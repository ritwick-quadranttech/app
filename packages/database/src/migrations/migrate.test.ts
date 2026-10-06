import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderEmbeddedMigrations } from '../../scripts/embed-migrations';
import { freshDb } from '../test/fixtures';
import { migrations } from './generated';
import { migrate, MigrationError, MIGRATIONS_TABLE, SCHEMA_VERSION_KEY } from './migrate';

const tableNames = (sqlite: ReturnType<typeof freshDb>['sqlite']) =>
  (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((r) => r.name);

const schemaVersion = (sqlite: ReturnType<typeof freshDb>['sqlite']) =>
  (
    sqlite.prepare('SELECT value FROM app_settings WHERE key = ?').get(SCHEMA_VERSION_KEY) as {
      value: string;
    }
  ).value;

describe('migrate()', () => {
  it('migrates a fresh database', async () => {
    const { client, sqlite } = freshDb();

    const result = await migrate(client);

    expect(result.applied).toEqual(migrations.map((m) => m.tag));
    expect(result.schemaVersion).toBe(migrations.length);
    expect(tableNames(sqlite)).toEqual(
      expect.arrayContaining(['companies', 'sales_invoices', 'ledger_entries', MIGRATIONS_TABLE]),
    );
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all()).toEqual([
      { name: 'product_stock' },
    ]);
    expect(schemaVersion(sqlite)).toBe(String(migrations.length));
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('is idempotent', async () => {
    const { client, sqlite } = freshDb();
    await migrate(client);
    const before = sqlite.prepare(`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY idx`).all();

    const second = await migrate(client);

    expect(second.applied).toEqual([]);
    expect(second.schemaVersion).toBe(migrations.length);
    expect(sqlite.prepare(`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY idx`).all()).toEqual(before);
    expect(schemaVersion(sqlite)).toBe(String(migrations.length));
  });

  it('applies only pending migrations', async () => {
    const { client } = freshDb();
    await migrate(client, migrations.slice(0, 1));

    const result = await migrate(client);

    expect(result.applied).toEqual(migrations.slice(1).map((m) => m.tag));
  });

  it('rolls back every migration in the run when one statement fails', async () => {
    const { client, sqlite } = freshDb();
    const broken = [
      ...migrations,
      {
        idx: 99,
        tag: '0099_broken',
        hash: 'x',
        statements: ['CREATE TABLE ok_table (a)', 'NOT SQL'],
      },
    ];

    await expect(migrate(client, broken)).rejects.toThrow();

    expect(tableNames(sqlite)).toEqual([]);
  });

  it('rejects a migration edited after it was applied', async () => {
    const { client } = freshDb();
    await migrate(client);
    const edited = migrations.map((m, i) => (i === 0 ? { ...m, hash: 'tampered' } : m));

    await expect(migrate(client, edited)).rejects.toBeInstanceOf(MigrationError);
  });

  it('rejects a database written by a newer build', async () => {
    const { client } = freshDb();
    await migrate(client);

    await expect(migrate(client, migrations.slice(0, 1))).rejects.toThrow(/does not know/);
  });

  it('upgrades a populated database, keeping data, FKs, views and triggers intact', async () => {
    const { client, sqlite } = freshDb();
    await migrate(client, migrations.slice(0, 2));
    const now = Date.now();
    const insert = (table: string, row: Record<string, unknown>) => {
      const cols = Object.keys(row);
      sqlite
        .prepare(
          `INSERT INTO ${table} (${cols.join(', ')}, created_at, updated_at, created_by)
           VALUES (${cols.map(() => '?').join(', ')}, ${now}, ${now}, 'u')`,
        )
        .run(...Object.values(row));
    };
    insert('companies', { id: 'c1', name: 'Co', state_code: '27', books_begin_date: '2026-04-01' });
    insert('units', { id: 'u1', company_id: 'c1', code: 'NOS', name: 'N', uqc: 'NOS' });
    insert('products', { id: 'p1', company_id: 'c1', name: 'W', unit_id: 'u1' });
    insert('stock_movements', {
      id: 'm1',
      company_id: 'c1',
      financial_year: '2026-27',
      date: '2026-05-01',
      product_id: 'p1',
      movement_type: 'PURCHASE',
      qty_x1000: 5000,
      rate_paise: 100,
      source_doc_type: 'PURCHASE_INVOICE',
      source_doc_id: 'x',
    });

    const result = await migrate(client);

    expect(result.applied).toEqual(migrations.slice(2).map((m) => m.tag));
    expect(sqlite.prepare('SELECT * FROM product_stock').all()).toEqual([
      { company_id: 'c1', product_id: 'p1', qty_x1000: 5000 },
    ]);
    expect(
      sqlite.prepare('SELECT negative_stock_policy, locked_until FROM companies').get(),
    ).toEqual({ negative_stock_policy: 'WARN', locked_until: null });
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(sqlite.pragma('legacy_alter_table', { simple: true })).toBe(0);
    expect(() => sqlite.prepare('DELETE FROM stock_movements').run()).toThrow(/append-only/);
  });

  it('embedded list is in sync with migrations/', () => {
    const file = new URL('./generated.ts', import.meta.url);
    expect(readFileSync(file, 'utf8')).toBe(renderEmbeddedMigrations());
  });
});
