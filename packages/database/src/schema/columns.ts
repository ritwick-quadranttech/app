import { type SQL, sql } from 'drizzle-orm';
import { type AnySQLiteColumn, integer, text } from 'drizzle-orm/sqlite-core';
import { ulid } from 'ulid';

/**
 * Column conventions (see ADR-001 / ADR-002):
 *   *_paise   INTEGER money in paise
 *   *_bp      INTEGER rate in basis points (18% = 1800)
 *   qty_x1000 INTEGER quantity × 1000
 *   dates     TEXT 'YYYY-MM-DD' (business dates, no time zone)
 *   *_at      INTEGER unix epoch milliseconds (instants)
 *   financial_year TEXT 'YYYY-YY', e.g. '2026-27'
 */

export const SYSTEM_USER = 'system';

/** ULID: sortable by creation time, generated client-side. */
export const newId = (): string => ulid();

export const pk = () => text('id').primaryKey().$defaultFn(newId);

export const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** created_at / updated_at / created_by — on every table. */
export const auditColumns = () => ({
  createdAt: timestampMs('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestampMs('updated_at')
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  createdBy: text('created_by').notNull(),
});

/** Masters only. Financial documents are cancelled, never deleted. */
export const softDelete = () => ({
  deletedAt: timestampMs('deleted_at'),
});

export const paise = (name: string) => integer(name);
export const basisPoints = (name: string) => integer(name);
export const qtyX1000 = (name: string) => integer(name);
export const isoDate = (name: string) => text(name);
export const bool = (name: string) => integer(name, { mode: 'boolean' });

const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;

export const inList = (column: AnySQLiteColumn, values: readonly string[]): SQL =>
  sql`${column} IN (${sql.raw(values.map(quote).join(', '))})`;

export const isIsoDate = (column: AnySQLiteColumn): SQL =>
  sql`${column} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`;

export const isFinancialYear = (column: AnySQLiteColumn): SQL =>
  sql`${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'`;

export const isStateCode = (column: AnySQLiteColumn): SQL => sql`${column} GLOB '[0-9][0-9]'`;
