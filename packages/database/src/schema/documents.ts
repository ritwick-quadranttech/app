import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { DOCUMENT_STATUSES } from './enums';
import {
  auditColumns,
  basisPoints,
  bool,
  inList,
  isFinancialYear,
  isIsoDate,
  isStateCode,
  isoDate,
  paise,
  pk,
  qtyX1000,
  timestampMs,
} from './columns';
import { companies } from './core';
import { parties, products, units } from './masters';
import { numberSeries } from './numbering';

/*
 * Shared column and constraint factories for financial documents.
 * Every financial table carries company_id and financial_year. Documents are never deleted
 * (a trigger forbids it); they move to CANCELLED with a reason and reversing entries.
 */

// ---------- every numbered document ----------

export const documentColumns = () => ({
  id: pk(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  financialYear: text('financial_year').notNull(),
  seriesId: text('series_id')
    .notNull()
    .references(() => numberSeries.id),
  docNo: integer('doc_no').notNull(),
  /** Formatted number as printed: prefix + padded doc_no + suffix. */
  docNumber: text('doc_number').notNull(),
  date: isoDate('date').notNull(),
  status: text('status', { enum: DOCUMENT_STATUSES }).notNull().default('POSTED'),
  cancelReason: text('cancel_reason'),
  cancelledAt: timestampMs('cancelled_at'),
  cancelledBy: text('cancelled_by'),
  notes: text('notes'),
  ...auditColumns(),
});

interface DocumentCols {
  companyId: AnySQLiteColumn;
  financialYear: AnySQLiteColumn;
  seriesId: AnySQLiteColumn;
  docNo: AnySQLiteColumn;
  docNumber: AnySQLiteColumn;
  date: AnySQLiteColumn;
  status: AnySQLiteColumn;
  cancelReason: AnySQLiteColumn;
  cancelledAt: AnySQLiteColumn;
  cancelledBy: AnySQLiteColumn;
}

export const documentConstraints = (table: string, t: DocumentCols) => [
  index(`${table}_company_date_idx`).on(t.companyId, t.date),
  // Gap-free numbering: one document per number within a series and FY.
  uniqueIndex(`${table}_doc_no_uq`).on(t.seriesId, t.financialYear, t.docNo),
  uniqueIndex(`${table}_doc_number_uq`).on(t.companyId, t.financialYear, t.docNumber),
  check(`${table}_fy`, isFinancialYear(t.financialYear)),
  check(`${table}_date`, isIsoDate(t.date)),
  check(`${table}_doc_no`, sql`${t.docNo} >= 1`),
  check(`${table}_status`, inList(t.status, DOCUMENT_STATUSES)),
  check(
    `${table}_cancellation`,
    sql`(${t.status} = 'CANCELLED') = (${t.cancelReason} IS NOT NULL AND trim(${t.cancelReason}) <> '' AND ${t.cancelledAt} IS NOT NULL AND ${t.cancelledBy} IS NOT NULL)`,
  ),
];

// ---------- GST trade documents (invoices, returns) ----------

export const tradeDocumentColumns = () => ({
  ...documentColumns(),
  partyId: text('party_id')
    .notNull()
    .references(() => parties.id),
  // Party snapshot as at the document date (masters may change later).
  partyName: text('party_name').notNull(),
  partyGstin: text('party_gstin'),
  partyStateCode: text('party_state_code'),
  billingAddress: text('billing_address'),
  shippingAddress: text('shipping_address'),
  placeOfSupply: text('place_of_supply').notNull(),
  igstApplicable: bool('igst_applicable').notNull(),
  reverseCharge: bool('reverse_charge').notNull().default(false),
  dueDate: isoDate('due_date'),
  discountTotalPaise: paise('discount_total_paise').notNull().default(0),
  taxableTotalPaise: paise('taxable_total_paise').notNull(),
  cgstTotalPaise: paise('cgst_total_paise').notNull().default(0),
  sgstTotalPaise: paise('sgst_total_paise').notNull().default(0),
  igstTotalPaise: paise('igst_total_paise').notNull().default(0),
  cessTotalPaise: paise('cess_total_paise').notNull().default(0),
  /** Signed: invoice-level round-off to the rupee. */
  roundOffPaise: paise('round_off_paise').notNull().default(0),
  grandTotalPaise: paise('grand_total_paise').notNull(),
});

interface TradeDocumentCols extends DocumentCols {
  partyId: AnySQLiteColumn;
  placeOfSupply: AnySQLiteColumn;
  igstApplicable: AnySQLiteColumn;
  reverseCharge: AnySQLiteColumn;
  dueDate: AnySQLiteColumn;
  discountTotalPaise: AnySQLiteColumn;
  taxableTotalPaise: AnySQLiteColumn;
  cgstTotalPaise: AnySQLiteColumn;
  sgstTotalPaise: AnySQLiteColumn;
  igstTotalPaise: AnySQLiteColumn;
  cessTotalPaise: AnySQLiteColumn;
  roundOffPaise: AnySQLiteColumn;
  grandTotalPaise: AnySQLiteColumn;
}

export const tradeDocumentConstraints = (table: string, t: TradeDocumentCols) => [
  ...documentConstraints(table, t),
  index(`${table}_party_id_idx`).on(t.partyId, t.date),
  check(`${table}_place_of_supply`, isStateCode(t.placeOfSupply)),
  check(`${table}_due_date`, sql`${t.dueDate} IS NULL OR ${isIsoDate(t.dueDate)}`),
  check(
    `${table}_totals_non_negative`,
    sql`${t.discountTotalPaise} >= 0 AND ${t.taxableTotalPaise} >= 0 AND ${t.cgstTotalPaise} >= 0 AND ${t.sgstTotalPaise} >= 0 AND ${t.igstTotalPaise} >= 0 AND ${t.cessTotalPaise} >= 0 AND ${t.grandTotalPaise} >= 0`,
  ),
  check(
    `${table}_tax_regime`,
    sql`(${t.igstApplicable} = 1 AND ${t.cgstTotalPaise} = 0 AND ${t.sgstTotalPaise} = 0) OR (${t.igstApplicable} = 0 AND ${t.igstTotalPaise} = 0)`,
  ),
  // Under reverse charge the recipient pays the tax to the government, not to the supplier,
  // so the document total excludes it (the tax amounts are still recorded).
  check(
    `${table}_grand_total`,
    sql`${t.grandTotalPaise} = ${t.taxableTotalPaise} + CASE WHEN ${t.reverseCharge} = 1 THEN 0 ELSE ${t.cgstTotalPaise} + ${t.sgstTotalPaise} + ${t.igstTotalPaise} + ${t.cessTotalPaise} END + ${t.roundOffPaise}`,
  ),
];

export const tradeLineColumns = () => ({
  id: pk(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  financialYear: text('financial_year').notNull(),
  lineNo: integer('line_no').notNull(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  description: text('description'),
  hsnSac: text('hsn_sac'),
  qtyX1000: qtyX1000('qty_x1000').notNull(),
  unitId: text('unit_id')
    .notNull()
    .references(() => units.id),
  ratePaise: paise('rate_paise').notNull(),
  discountPaise: paise('discount_paise').notNull().default(0),
  taxableValuePaise: paise('taxable_value_paise').notNull(),
  // Rate snapshot from tax_rates as at the document date.
  cgstBp: basisPoints('cgst_bp').notNull().default(0),
  sgstBp: basisPoints('sgst_bp').notNull().default(0),
  igstBp: basisPoints('igst_bp').notNull().default(0),
  cessBp: basisPoints('cess_bp').notNull().default(0),
  cgstPaise: paise('cgst_paise').notNull().default(0),
  sgstPaise: paise('sgst_paise').notNull().default(0),
  igstPaise: paise('igst_paise').notNull().default(0),
  cessPaise: paise('cess_paise').notNull().default(0),
  totalPaise: paise('total_paise').notNull(),
  ...auditColumns(),
});

interface TradeLineCols {
  companyId: AnySQLiteColumn;
  financialYear: AnySQLiteColumn;
  lineNo: AnySQLiteColumn;
  productId: AnySQLiteColumn;
  unitId: AnySQLiteColumn;
  qtyX1000: AnySQLiteColumn;
  ratePaise: AnySQLiteColumn;
  discountPaise: AnySQLiteColumn;
  taxableValuePaise: AnySQLiteColumn;
  cgstBp: AnySQLiteColumn;
  sgstBp: AnySQLiteColumn;
  igstBp: AnySQLiteColumn;
  cessBp: AnySQLiteColumn;
  cgstPaise: AnySQLiteColumn;
  sgstPaise: AnySQLiteColumn;
  igstPaise: AnySQLiteColumn;
  cessPaise: AnySQLiteColumn;
  totalPaise: AnySQLiteColumn;
}

export const tradeLineConstraints = (
  table: string,
  parentId: AnySQLiteColumn,
  t: TradeLineCols,
) => [
  uniqueIndex(`${table}_parent_line_uq`).on(parentId, t.lineNo),
  index(`${table}_company_id_idx`).on(t.companyId, t.financialYear),
  index(`${table}_product_id_idx`).on(t.productId),
  index(`${table}_unit_id_idx`).on(t.unitId),
  check(`${table}_fy`, isFinancialYear(t.financialYear)),
  check(`${table}_line_no`, sql`${t.lineNo} >= 1`),
  check(`${table}_qty`, sql`${t.qtyX1000} > 0`),
  check(
    `${table}_amounts_non_negative`,
    sql`${t.ratePaise} >= 0 AND ${t.discountPaise} >= 0 AND ${t.taxableValuePaise} >= 0 AND ${t.cgstPaise} >= 0 AND ${t.sgstPaise} >= 0 AND ${t.igstPaise} >= 0 AND ${t.cessPaise} >= 0`,
  ),
  check(
    `${table}_rates_non_negative`,
    sql`${t.cgstBp} >= 0 AND ${t.sgstBp} >= 0 AND ${t.igstBp} >= 0 AND ${t.cessBp} >= 0`,
  ),
  check(
    `${table}_total`,
    sql`${t.totalPaise} = ${t.taxableValuePaise} + ${t.cgstPaise} + ${t.sgstPaise} + ${t.igstPaise} + ${t.cessPaise}`,
  ),
];
