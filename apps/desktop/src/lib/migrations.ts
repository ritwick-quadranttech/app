import {
  MIGRATIONS_TABLE,
  SCHEMA_VERSION_KEY,
  SYSTEM_USER,
} from '@repo/database';
import { migrations as bundledMigrations } from '@repo/database/migrations/generated';
import { ulid } from 'ulid';
import { ipc, type StatementInput } from './ipc';

export interface MigrationSummary {
  readonly alreadyApplied: number;
  readonly newlyApplied: readonly string[];
  readonly currentVersion: number;
}

/**
 * Checks for and applies pending embedded migrations.
 * Takes a pre-migration snapshot via SQLite backup API before applying any pending migration.
 */
export async function runDesktopMigrations(): Promise<MigrationSummary> {
  const ordered = [...bundledMigrations].sort((a, b) => a.idx - b.idx);

  // Check if schema_migrations table exists
  const tableCheck = await ipc.dbQuery(
    "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
    [MIGRATIONS_TABLE],
  );
  const tableExists = Number(tableCheck[0]?.[0] ?? 0) > 0;

  let appliedRows: [number, string, string][] = [];
  if (tableExists) {
    const rows = await ipc.dbQuery(
      `SELECT idx, tag, hash FROM ${MIGRATIONS_TABLE} ORDER BY idx`,
    );
    appliedRows = rows.map((r) => [Number(r[0]), String(r[1]), String(r[2])]);
  }

  const known = new Map(ordered.map((m) => [m.idx, m]));
  for (const [idx, tag, hash] of appliedRows) {
    const m = known.get(idx);
    if (!m || m.tag !== tag) {
      throw new Error(`Database has migration '${tag}' which this build does not recognize.`);
    }
    if (m.hash !== hash) {
      throw new Error(`Migration '${tag}' was modified after being applied.`);
    }
  }

  const lastAppliedIdx = appliedRows.at(-1)?.[0] ?? -1;
  const pending = ordered.filter((m) => m.idx > lastAppliedIdx);

  // If already up-to-date, return
  if (pending.length === 0) {
    return {
      alreadyApplied: appliedRows.length,
      newlyApplied: [],
      currentVersion: appliedRows.length,
    };
  }

  // 1. Take db_snapshot before applying any pending migration
  const currentVersion = appliedRows.length;
  const snapshotPath = `backups/pre-migration-${currentVersion}.sqlite`;
  await ipc.dbSnapshot(snapshotPath);

  // 2. Prepare batch statements
  const statements: StatementInput[] = [];

  if (!tableExists) {
    statements.push({
      sql: `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id TEXT PRIMARY KEY NOT NULL,
        idx INTEGER NOT NULL UNIQUE,
        tag TEXT NOT NULL UNIQUE,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by TEXT NOT NULL
      )`,
      params: [],
    });
  }

  const now = Date.now();
  for (const m of pending) {
    for (const sqlStmt of m.statements) {
      statements.push({ sql: sqlStmt, params: [] });
    }

    statements.push({
      sql: `INSERT INTO ${MIGRATIONS_TABLE} (id, idx, tag, hash, created_at, updated_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [ulid(), m.idx, m.tag, m.hash, now, now, SYSTEM_USER],
    });
  }

  const newVersion = appliedRows.length + pending.length;
  statements.push({
    sql: `INSERT INTO app_settings (key, value, created_at, updated_at, created_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    params: [SCHEMA_VERSION_KEY, JSON.stringify(newVersion), now, now, SYSTEM_USER],
  });

  // 3. Execute all migration statements in ONE atomic batch
  await ipc.dbExecuteBatch(statements);

  // 4. Verify integrity
  const violations = await ipc.dbQuery('PRAGMA foreign_key_check');
  if (violations.length > 0) {
    throw new Error(`Migration left ${violations.length} foreign key violation(s).`);
  }

  return {
    alreadyApplied: appliedRows.length,
    newlyApplied: pending.map((m) => m.tag),
    currentVersion: newVersion,
  };
}
