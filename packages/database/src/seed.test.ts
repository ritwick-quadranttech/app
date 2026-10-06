import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './migrations/migrate';
import { accounts, companies, units } from './schema';
import { DEFAULT_ACCOUNTS, DEFAULT_UNITS, seedCompanyDefaults } from './seed';
import { freshDb, USER } from './test/fixtures';

describe('seedCompanyDefaults()', () => {
  let ctx: ReturnType<typeof freshDb> & { companyId: string };

  beforeEach(async () => {
    const fresh = freshDb();
    await migrate(fresh.client);
    const [c] = await fresh.client.db
      .insert(companies)
      .values({ name: 'Co', stateCode: '29', booksBeginDate: '2026-04-01', createdBy: USER })
      .returning();
    ctx = { ...fresh, companyId: c!.id };
  });

  it('creates the default chart of accounts and units', async () => {
    const result = await seedCompanyDefaults(ctx.client, {
      companyId: ctx.companyId,
      userId: USER,
    });

    expect(result).toEqual({ accountsCreated: 19, unitsCreated: 6 });
    const seededAccounts = await ctx.client.db
      .select()
      .from(accounts)
      .where(eq(accounts.companyId, ctx.companyId));
    expect(seededAccounts.map((a) => a.systemCode).sort()).toEqual(
      DEFAULT_ACCOUNTS.map((a) => a.systemCode).sort(),
    );
    expect(seededAccounts.every((a) => a.createdBy === USER)).toBe(true);
    const seededUnits = await ctx.client.db.select().from(units);
    expect(seededUnits.map((u) => u.code).sort()).toEqual([
      'BOX',
      'KGS',
      'LTR',
      'MTR',
      'NOS',
      'PCS',
    ]);
    expect(seededUnits.length).toBe(DEFAULT_UNITS.length);
  });

  it('seeds nothing else', async () => {
    await seedCompanyDefaults(ctx.client, { companyId: ctx.companyId, userId: USER });

    const populated = (
      ctx.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    )
      .map((t) => t.name)
      .filter(
        (name) =>
          (ctx.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n > 0,
      )
      .sort();
    expect(populated).toEqual([
      'accounts',
      'app_settings',
      'companies',
      'schema_migrations',
      'units',
    ]);
  });

  it('is idempotent', async () => {
    await seedCompanyDefaults(ctx.client, { companyId: ctx.companyId, userId: USER });

    const again = await seedCompanyDefaults(ctx.client, { companyId: ctx.companyId, userId: USER });

    expect(again).toEqual({ accountsCreated: 0, unitsCreated: 0 });
    expect((await ctx.client.db.select().from(accounts)).length).toBe(19);
  });
});
