import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

export type QueryMethod = 'run' | 'all' | 'values' | 'get';

/**
 * The only thing a driver has to implement. Injected so the same repositories run on
 * better-sqlite3 (tests, tooling) and on the Tauri IPC proxy (desktop, Phase 4).
 *
 * Result shape (drizzle sqlite-proxy contract):
 *   run          → { rows: [] }
 *   all / values → { rows: unknown[][] }          one array of column values per row
 *   get          → { rows: unknown[] | undefined } the first row's column values
 *
 * The executor must use a single connection with `PRAGMA foreign_keys = ON`.
 */
export interface SqlExecutor {
  execute(sql: string, params: unknown[], method: QueryMethod): Promise<{ rows: unknown }>;
  close?(): Promise<void>;
}

export type Db = SqliteRemoteDatabase<typeof schema>;

export interface DatabaseClient {
  /** For standalone reads/writes. Each statement waits for any open transaction to finish. */
  readonly db: Db;
  /**
   * Runs `fn` in a `BEGIN IMMEDIATE` transaction, committing on success and rolling back on
   * any error. Transactions are serialised. Inside `fn`, use only `tx`: touching `client.db`
   * or calling `client.transaction` again would wait on the transaction itself and deadlock.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Minimal FIFO async mutex. */
class Mutex {
  #tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(fn);
    this.#tail = result.catch(() => undefined);
    return result;
  }
}

export function createDatabaseClient(executor: SqlExecutor): DatabaseClient {
  const lock = new Mutex();

  const raw = (sql: string, params: unknown[], method: QueryMethod) =>
    executor.execute(sql, params, method) as Promise<{ rows: never }>;

  const db: Db = drizzle((sql, params, method) => lock.run(() => raw(sql, params, method)), {
    schema,
  });
  // Bound to the raw executor: only ever used while the lock is held by transaction().
  const txDb: Db = drizzle(raw, { schema });

  return {
    db,
    transaction: (fn) =>
      lock.run(async () => {
        await raw('BEGIN IMMEDIATE', [], 'run');
        try {
          const result = await fn(txDb);
          await raw('COMMIT', [], 'run');
          return result;
        } catch (err) {
          try {
            await raw('ROLLBACK', [], 'run');
          } catch {
            // SQLite may already have rolled back (e.g. SQLITE_FULL); keep the original error.
          }
          throw err;
        }
      }),
    close: () => lock.run(async () => executor.close?.()),
  };
}
