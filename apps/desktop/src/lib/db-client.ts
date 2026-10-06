import {
  type DatabaseClient,
  type Db,
  type QueryMethod,
  schema,
} from '@repo/database';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { ipc, type StatementInput } from './ipc';

interface CachedSeries {
  nextNo: number;
  prefix: string;
  suffix: string;
  padWidth: number;
  financialYear: string;
}

/**
 * Unit of Work collecting writes from a transaction and executing them as ONE db_execute_batch call.
 * Read-your-own-writes (e.g. allocateDocumentNumber) are computed in TypeScript using cached series state.
 */
class UnitOfWork {
  readonly statements: StatementInput[] = [];
  private readonly seriesCache = new Map<string, CachedSeries>();

  async execute(sqlStr: string, params: unknown[], method: QueryMethod): Promise<{ rows: unknown }> {
    const trimmed = sqlStr.trim();
    const isSelect = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\s/i.test(trimmed);

    // 1. Read operations go directly to db_query
    if (isSelect) {
      const rows = await ipc.dbQuery(trimmed, params);

      // If querying number_series, inspect and cache series for read-your-own-writes
      if (/FROM\s+["`]?number_series["`]?/i.test(trimmed)) {
        this.#populateSeriesFromRows(rows, trimmed);
      }

      if (method === 'get') {
        return { rows: rows[0] };
      }
      return { rows };
    }

    // 2. Read-your-own-write: UPDATE number_series ... RETURNING (allocateDocumentNumber)
    if (/UPDATE\s+["`]?number_series["`]?/i.test(trimmed) && /RETURNING/i.test(trimmed)) {
      const returningRow = await this.#handleAllocateDocumentNumber(trimmed, params);
      this.statements.push({ sql: trimmed, params });

      if (method === 'get') {
        return { rows: returningRow };
      }
      return { rows: [returningRow] };
    }

    // 3. Regular write operation: buffer into the batch
    this.statements.push({ sql: trimmed, params });
    return { rows: [] };
  }

  async commit(): Promise<void> {
    if (this.statements.length > 0) {
      await ipc.dbExecuteBatch(this.statements);
    }
  }

  #populateSeriesFromRows(rows: unknown[][], sqlQuery: string): void {
    // If SELECT * FROM number_series or specific columns
    // Check if rows contains expected number_series column structures
    for (const r of rows) {
      if (Array.isArray(r) && r.length >= 8) {
        // Find series id string and next_no number
        const id = r.find((col): col is string => typeof col === 'string' && col.length >= 10);
        const nextNo = r.find((col): col is number => typeof col === 'number' && Number.isInteger(col) && col >= 1);
        const prefix = (r.find((col): col is string => typeof col === 'string' && col.endsWith('/')) ?? '') as string;
        const fy = (r.find((col): col is string => typeof col === 'string' && /^\d{4}-\d{2}$/.test(col)) ?? '2026-27') as string;

        if (id && nextNo !== undefined) {
          this.seriesCache.set(id, {
            nextNo,
            prefix,
            suffix: '',
            padWidth: 0,
            financialYear: fy,
          });
        }
      }
    }
  }

  async #handleAllocateDocumentNumber(sqlQuery: string, params: unknown[]): Promise<unknown[]> {
    // Locate the series ID in params
    let seriesId: string | undefined;
    for (const p of params) {
      if (typeof p === 'string' && this.seriesCache.has(p)) {
        seriesId = p;
        break;
      }
      if (typeof p === 'string' && p.length >= 10) {
        seriesId = p;
      }
    }

    let cached = seriesId ? this.seriesCache.get(seriesId) : undefined;

    // If not found in cache, fetch series metadata via db_query
    if (!cached && seriesId) {
      const rows = await ipc.dbQuery(
        'SELECT id, next_no, prefix, suffix, pad_width, financial_year FROM number_series WHERE id = ?',
        [seriesId],
      );
      if (rows.length > 0 && rows[0]) {
        const row = rows[0];
        cached = {
          nextNo: Number(row[1]),
          prefix: String(row[2] ?? ''),
          suffix: String(row[3] ?? ''),
          padWidth: Number(row[4] ?? 0),
          financialYear: String(row[5] ?? ''),
        };
        this.seriesCache.set(seriesId, cached);
      }
    }

    if (!cached) {
      // Fallback defaults if series was newly generated in this transaction
      cached = {
        nextNo: 1,
        prefix: '',
        suffix: '',
        padWidth: 0,
        financialYear: '2026-27',
      };
    }

    const allocated = cached.nextNo;
    cached.nextNo += 1; // Increment for any subsequent allocation in the same unit-of-work

    // Returning fields match allocateDocumentNumber:
    // [allocated, prefix, suffix, padWidth, financialYear]
    return [allocated, cached.prefix, cached.suffix, cached.padWidth, cached.financialYear];
  }
}

/**
 * Creates a DatabaseClient for the desktop application.
 * - Reads use Drizzle's sqlite-proxy calling db_query.
 * - Writes in transactions are collected into a UnitOfWork and executed in ONE db_execute_batch call.
 */
export function createTauriDatabaseClient(): DatabaseClient {
  // Standalone db proxy
  const db: Db = drizzle(
    async (sqlStr, params, method) => {
      const trimmed = sqlStr.trim();
      const isSelect = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\s/i.test(trimmed);

      if (isSelect) {
        const rows = await ipc.dbQuery(trimmed, params);
        if (method === 'get') {
          return { rows: rows[0] };
        }
        return { rows };
      }

      // Standalone write
      await ipc.dbExecuteBatch([{ sql: trimmed, params }]);
      return { rows: [] };
    },
    { schema },
  );

  return {
    db,

    transaction: async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
      const uow = new UnitOfWork();

      // Create a transaction Db handle bound to this UnitOfWork
      const txDb: Db = drizzle(
        (sqlStr, params, method) => uow.execute(sqlStr, params, method),
        { schema },
      );

      // Execute transaction logic
      const result = await fn(txDb);

      // Send all buffered statements in ONE atomic batch call
      await uow.commit();

      return result;
    },

    close: async (): Promise<void> => {
      // Connection lifecycle is managed by Tauri backend
    },
  };
}
