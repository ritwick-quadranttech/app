import { sql, type SQL } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { GST_DIRECTIONS, GST_SUPPLY_KINDS, SOURCE_DOC_TYPES } from './enums';
import {
  auditColumns,
  basisPoints,
  bool,
  inList,
  isFinancialYear,
  isIsoDate,
  isoDate,
  paise,
  pk,
} from './columns';
import { companies } from './core';
import { parties } from './masters';

const sameSignOrZero = (cols: AnySQLiteColumn[]): SQL =>
  sql`(${sql.join(
    cols.map((c) => sql`${c} >= 0`),
    sql` AND `,
  )}) OR (${sql.join(
    cols.map((c) => sql`${c} <= 0`),
    sql` AND `,
  )})`;

/**
 * GST register: one row per document line per posting, the source for GSTR-1 / GSTR-3B data.
 * Amounts are signed: invoices are positive, credit/debit notes that reduce tax are negative,
 * and a cancellation appends an exact negation (`reverses_gst_transaction_id`). Append-only.
 */
export const gstTransactions = sqliteTable(
  'gst_transactions',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    date: isoDate('date').notNull(),
    sourceDocType: text('source_doc_type', { enum: SOURCE_DOC_TYPES }).notNull(),
    sourceDocId: text('source_doc_id').notNull(),
    sourceLineId: text('source_line_id'),
    direction: text('direction', { enum: GST_DIRECTIONS }).notNull(),
    supplyKind: text('supply_kind', { enum: GST_SUPPLY_KINDS }).notNull(),
    partyId: text('party_id').references(() => parties.id),
    partyGstin: text('party_gstin'),
    placeOfSupply: text('place_of_supply'),
    reverseCharge: bool('reverse_charge').notNull().default(false),
    itcEligible: bool('itc_eligible').notNull().default(false),
    hsnSac: text('hsn_sac'),
    /** Combined GST rate (IGST, or CGST + SGST). */
    gstRateBp: basisPoints('gst_rate_bp').notNull(),
    cessRateBp: basisPoints('cess_rate_bp').notNull().default(0),
    taxableValuePaise: paise('taxable_value_paise').notNull(),
    cgstPaise: paise('cgst_paise').notNull().default(0),
    sgstPaise: paise('sgst_paise').notNull().default(0),
    igstPaise: paise('igst_paise').notNull().default(0),
    cessPaise: paise('cess_paise').notNull().default(0),
    reversesGstTransactionId: text('reverses_gst_transaction_id').references(
      (): AnySQLiteColumn => gstTransactions.id,
    ),
    ...auditColumns(),
  },
  (t) => [
    index('gst_transactions_company_date_idx').on(t.companyId, t.date),
    index('gst_transactions_source_idx').on(t.sourceDocType, t.sourceDocId),
    index('gst_transactions_party_id_idx').on(t.partyId),
    uniqueIndex('gst_transactions_reverses_uq')
      .on(t.reversesGstTransactionId)
      .where(sql`${t.reversesGstTransactionId} IS NOT NULL`),
    check('gst_transactions_fy', isFinancialYear(t.financialYear)),
    check('gst_transactions_date', isIsoDate(t.date)),
    check('gst_transactions_source_doc_type', inList(t.sourceDocType, SOURCE_DOC_TYPES)),
    check('gst_transactions_direction', inList(t.direction, GST_DIRECTIONS)),
    check('gst_transactions_supply_kind', inList(t.supplyKind, GST_SUPPLY_KINDS)),
    check('gst_transactions_rates', sql`${t.gstRateBp} >= 0 AND ${t.cessRateBp} >= 0`),
    check(
      'gst_transactions_signs',
      sameSignOrZero([t.taxableValuePaise, t.cgstPaise, t.sgstPaise, t.igstPaise, t.cessPaise]),
    ),
  ],
);
