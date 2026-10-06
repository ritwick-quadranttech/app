import { sql } from 'drizzle-orm';
import type { DatabaseClient, Db } from '../client';
import { SYSTEM_USER } from '../schema/columns';
import { appSettings } from '../schema/core';
import { ulid } from 'ulid';
import { migrations as bundledMigrations } from './generated';
import type { Migration } from './types';

export const MIGRATIONS_TABLE = 'schema_migrations';
export const SCHEMA_VERSION_KEY = 'schema_version';

export class MigrationError extends Error {
  override name = 'MigrationError';
}

export interface MigrateResult {
  /** Tags applied by this call, in order. Empty when the database was already current. */
  readonly applied: readonly string[];
  /** Number of migrations recorded in the database after this call. */
  readonly schemaVersion: number;
}

/**
 * Applies every pending migration inside ONE transaction and records each in schema_migrations.
 * Either the database ends up fully current, or it is left exactly as it was.
 *
 * - Already-applied migrations are verified by hash; an edited migration is rejected.
 * - A database that has migrations this build doesn't know (newer app wrote it) is rejected.
 * - Foreign keys are switched OFF around the transaction (SQLite ignores the pragma inside one),
 *   as SQLite's table-rebuild procedure requires: drizzle-kit rebuilds a table to change its
 *   CHECKs, and with FKs on, dropping a parent that has child rows would fail. Integrity is then
 *   verified with `PRAGMA foreign_key_check` before commit, and FKs are switched back ON.
 * - `legacy_alter_table` is ON for the same procedure: otherwise the final RENAME of a rebuilt
 *   table fails because views (e.g. product_stock) briefly reference a missing table. Every view
 *   is re-compiled before commit to prove it still resolves.
 *   Run migrate() at startup, before anything else uses the connection.
 */
export async function migrate(
  client: DatabaseClient,
  migrations: readonly Migration[] = bundledMigrations,
): Promise<MigrateResult> {
  const ordered = [...migrations].sort((a, b) => a.idx - b.idx);

  await client.db.run(sql.raw('PRAGMA foreign_keys = OFF'));
  await client.db.run(sql.raw('PRAGMA legacy_alter_table = ON'));
  try {
    return await client.transaction((tx) => applyPending(tx, ordered));
  } finally {
    await client.db.run(sql.raw('PRAGMA legacy_alter_table = OFF'));
    await client.db.run(sql.raw('PRAGMA foreign_keys = ON'));
  }
}

async function applyPending(tx: Db, ordered: readonly Migration[]): Promise<MigrateResult> {
  await tx.run(
    sql.raw(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id TEXT PRIMARY KEY NOT NULL,
        idx INTEGER NOT NULL UNIQUE,
        tag TEXT NOT NULL UNIQUE,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by TEXT NOT NULL
      )`),
  );

  const appliedRows = await tx.values<[number, string, string]>(
    sql.raw(`SELECT idx, tag, hash FROM ${MIGRATIONS_TABLE} ORDER BY idx`),
  );
  const known = new Map(ordered.map((m) => [m.idx, m]));
  for (const [idx, tag, hash] of appliedRows) {
    const m = known.get(idx);
    if (!m || m.tag !== tag) {
      throw new MigrationError(
        `Database has migration ${tag} which this build does not know. Update the app.`,
      );
    }
    if (m.hash !== hash) {
      throw new MigrationError(`Migration ${tag} was modified after being applied.`);
    }
  }

  const lastApplied = appliedRows.at(-1)?.[0] ?? -1;
  const pending = ordered.filter((m) => m.idx > lastApplied);
  if (pending.length + appliedRows.length !== ordered.length) {
    throw new MigrationError('Migrations are out of order: a gap exists before the last applied.');
  }

  for (const m of pending) {
    for (const statement of m.statements) {
      await tx.run(sql.raw(statement));
    }
    const now = Date.now();
    await tx.run(
      sql`INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} (id, idx, tag, hash, created_at, updated_at, created_by)
            VALUES (${ulid()}, ${m.idx}, ${m.tag}, ${m.hash}, ${now}, ${now}, ${SYSTEM_USER})`,
    );
  }

  const violations = await tx.values(sql.raw('PRAGMA foreign_key_check'));
  if (violations.length > 0) {
    throw new MigrationError(
      `Migration left ${violations.length} foreign key violation(s); rolled back.`,
    );
  }

  const views = await tx.values<[string]>(
    sql.raw("SELECT name FROM sqlite_master WHERE type = 'view'"),
  );
  for (const [view] of views) {
    await tx.values(sql`SELECT * FROM ${sql.identifier(view)} LIMIT 0`);
  }

  const schemaVersion = appliedRows.length + pending.length;
  if (pending.length > 0) {
    await tx
      .insert(appSettings)
      .values({
        key: SCHEMA_VERSION_KEY,
        value: JSON.stringify(schemaVersion),
        createdBy: SYSTEM_USER,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: JSON.stringify(schemaVersion), updatedAt: new Date() },
      });
  }

  return { applied: pending.map((m) => m.tag), schemaVersion };
}
