import Database from 'better-sqlite3';
import type { SqlExecutor } from '../client';

/**
 * better-sqlite3 executor for tests and Node tooling. Not for the desktop renderer: there the
 * Tauri proxy executor (Phase 4) is used instead.
 */
export function betterSqliteExecutor(filename = ':memory:'): SqlExecutor & {
  readonly raw: Database.Database;
} {
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  if (filename !== ':memory:') sqlite.pragma('journal_mode = WAL');

  return {
    raw: sqlite,
    // async so that SQLite errors surface as rejections, as they will over IPC.
    async execute(sql, params, method) {
      const stmt = sqlite.prepare(sql);
      if (method === 'run') {
        stmt.run(...params);
        return { rows: [] };
      }
      stmt.raw(true);
      return { rows: method === 'get' ? stmt.get(...params) : stmt.all(...params) };
    },
    async close() {
      sqlite.close();
    },
  };
}
