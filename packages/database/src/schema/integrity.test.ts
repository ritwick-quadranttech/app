import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS_TABLE } from '../migrations/migrate';
import { freshDb } from '../test/fixtures';
import { TRIGGERS } from './triggers';

/** Structural rules from the Phase 2 brief, checked against the real migrated schema. */

const MASTERS = [
  'companies',
  'users',
  'accounts',
  'parties',
  'units',
  'tax_categories',
  'tax_rates',
  'products',
];
const NOT_COMPANY_SCOPED = ['companies', 'users', 'app_settings', 'audit_logs', MIGRATIONS_TABLE];
const NOT_FY_SCOPED = [...NOT_COMPANY_SCOPED, ...MASTERS, 'financial_years'];

let sqlite: ReturnType<typeof freshDb>['sqlite'];
let tables: string[];
const columns = (t: string) =>
  sqlite.pragma(`table_info("${t}")`) as { name: string; type: string; pk: number }[];

beforeAll(async () => {
  const fresh = freshDb();
  await migrate(fresh.client);
  sqlite = fresh.sqlite;
  tables = (
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((r) => r.name);
});

describe('schema integrity', () => {
  it('every table has a TEXT id primary key and audit columns', () => {
    for (const t of tables) {
      const cols = columns(t);
      expect(
        cols.find((c) => c.pk === 1),
        t,
      ).toMatchObject({ name: 'id', type: 'TEXT' });
      for (const c of ['created_at', 'updated_at', 'created_by']) {
        expect(
          cols.map((x) => x.name),
          `${t}.${c}`,
        ).toContain(c);
      }
    }
  });

  it('soft delete exists on masters only', () => {
    for (const t of tables) {
      const has = columns(t).some((c) => c.name === 'deleted_at');
      expect(has, t).toBe(MASTERS.includes(t));
    }
  });

  it('every financial table has company_id and financial_year', () => {
    for (const t of tables) {
      const names = columns(t).map((c) => c.name);
      if (!NOT_COMPANY_SCOPED.includes(t)) expect(names, t).toContain('company_id');
      if (!NOT_FY_SCOPED.includes(t)) expect(names, t).toContain('financial_year');
    }
  });

  it('every foreign key column leads some index', () => {
    const missing: string[] = [];
    for (const t of tables) {
      const fks = sqlite.pragma(`foreign_key_list("${t}")`) as { from: string }[];
      const leading = new Set(
        (sqlite.pragma(`index_list("${t}")`) as { name: string }[]).map(
          (i) => (sqlite.pragma(`index_info("${i.name}")`) as { name: string }[])[0]?.name,
        ),
      );
      for (const fk of fks) if (!leading.has(fk.from)) missing.push(`${t}.${fk.from}`);
    }
    expect(missing).toEqual([]);
  });

  it('documents are indexed on (company_id, date)', () => {
    for (const t of tables.filter((t) => columns(t).some((c) => c.name === 'doc_no'))) {
      const indexes = (sqlite.pragma(`index_list("${t}")`) as { name: string }[]).map((i) =>
        (sqlite.pragma(`index_info("${i.name}")`) as { name: string }[])
          .map((c) => c.name)
          .join(','),
      );
      expect(indexes, t).toContain('company_id,date');
    }
  });

  it('every trigger in TRIGGERS exists (rebuilt tables lose theirs)', () => {
    const present = new Set(
      (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as {
          name: string;
        }[]
      ).map((r) => r.name),
    );
    expect(TRIGGERS.map((t) => t.name).filter((n) => !present.has(n))).toEqual([]);
    expect(present.size).toBe(TRIGGERS.length);
  });

  it('no product stock column', () => {
    expect(
      columns('products')
        .map((c) => c.name)
        .filter((n) => /stock|qty/.test(n)),
    ).toEqual([]);
  });
});
