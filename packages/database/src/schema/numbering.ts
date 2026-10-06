import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { NUMBERED_DOC_TYPES } from './enums';
import { auditColumns, bool, inList, isFinancialYear, pk } from './columns';
import { companies } from './core';

/**
 * Gap-free document number series, one row per (company, FY, doc type, prefix, suffix).
 * Numbers are allocated with allocateDocumentNumber() inside the same transaction as the
 * document insert, so a rolled-back insert never consumes a number.
 */
export const numberSeries = sqliteTable(
  'number_series',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    docType: text('doc_type', { enum: NUMBERED_DOC_TYPES }).notNull(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull().default(''),
    suffix: text('suffix').notNull().default(''),
    nextNo: integer('next_no').notNull().default(1),
    /** Zero-pad the number to this width (0 = no padding). */
    padWidth: integer('pad_width').notNull().default(0),
    isDefault: bool('is_default').notNull().default(false),
    isActive: bool('is_active').notNull().default(true),
    ...auditColumns(),
  },
  (t) => [
    index('number_series_company_id_idx').on(t.companyId, t.financialYear),
    uniqueIndex('number_series_uq').on(t.companyId, t.financialYear, t.docType, t.prefix, t.suffix),
    uniqueIndex('number_series_default_uq')
      .on(t.companyId, t.financialYear, t.docType)
      .where(sql`${t.isDefault} = 1`),
    check('number_series_fy', isFinancialYear(t.financialYear)),
    check('number_series_doc_type', inList(t.docType, NUMBERED_DOC_TYPES)),
    check('number_series_next_no', sql`${t.nextNo} >= 1`),
    check('number_series_pad_width', sql`${t.padWidth} BETWEEN 0 AND 12`),
  ],
);
