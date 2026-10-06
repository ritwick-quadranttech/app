import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { PAYMENT_MODES } from './enums';
import {
  auditColumns,
  basisPoints,
  bool,
  inList,
  isFinancialYear,
  isStateCode,
  paise,
  pk,
} from './columns';
import { companies } from './core';
import { documentColumns, documentConstraints } from './documents';
import { accounts, parties } from './masters';

/** Cash ↔ bank and bank ↔ bank transfers. */
export const contraVouchers = sqliteTable(
  'contra_vouchers',
  {
    ...documentColumns(),
    fromAccountId: text('from_account_id')
      .notNull()
      .references(() => accounts.id),
    toAccountId: text('to_account_id')
      .notNull()
      .references(() => accounts.id),
    amountPaise: paise('amount_paise').notNull(),
    mode: text('mode', { enum: PAYMENT_MODES }).notNull(),
    referenceNo: text('reference_no'),
  },
  (t) => [
    ...documentConstraints('contra_vouchers', t),
    index('contra_vouchers_from_account_id_idx').on(t.fromAccountId),
    index('contra_vouchers_to_account_id_idx').on(t.toAccountId),
    check('contra_vouchers_amount', sql`${t.amountPaise} > 0`),
    check('contra_vouchers_mode', inList(t.mode, PAYMENT_MODES)),
    check('contra_vouchers_accounts_differ', sql`${t.fromAccountId} <> ${t.toAccountId}`),
  ],
);

/** Direct expenses (rent, freight, …), optionally with GST input credit. */
export const expenses = sqliteTable(
  'expenses',
  {
    ...documentColumns(),
    /** Credited: a cash/bank ledger (paid now) or a party ledger (payable). */
    creditAccountId: text('credit_account_id')
      .notNull()
      .references(() => accounts.id),
    partyId: text('party_id').references(() => parties.id),
    supplierGstin: text('supplier_gstin'),
    supplierInvoiceNo: text('supplier_invoice_no'),
    placeOfSupply: text('place_of_supply'),
    igstApplicable: bool('igst_applicable').notNull().default(false),
    itcEligible: bool('itc_eligible').notNull().default(true),
    taxableTotalPaise: paise('taxable_total_paise').notNull(),
    cgstTotalPaise: paise('cgst_total_paise').notNull().default(0),
    sgstTotalPaise: paise('sgst_total_paise').notNull().default(0),
    igstTotalPaise: paise('igst_total_paise').notNull().default(0),
    cessTotalPaise: paise('cess_total_paise').notNull().default(0),
    totalPaise: paise('total_paise').notNull(),
  },
  (t) => [
    ...documentConstraints('expenses', t),
    index('expenses_credit_account_id_idx').on(t.creditAccountId),
    index('expenses_party_id_idx').on(t.partyId),
    check(
      'expenses_place_of_supply',
      sql`${t.placeOfSupply} IS NULL OR ${isStateCode(t.placeOfSupply)}`,
    ),
    check(
      'expenses_totals_non_negative',
      sql`${t.taxableTotalPaise} >= 0 AND ${t.cgstTotalPaise} >= 0 AND ${t.sgstTotalPaise} >= 0 AND ${t.igstTotalPaise} >= 0 AND ${t.cessTotalPaise} >= 0`,
    ),
    check(
      'expenses_tax_regime',
      sql`(${t.igstApplicable} = 1 AND ${t.cgstTotalPaise} = 0 AND ${t.sgstTotalPaise} = 0) OR (${t.igstApplicable} = 0 AND ${t.igstTotalPaise} = 0)`,
    ),
    check(
      'expenses_total',
      sql`${t.totalPaise} > 0 AND ${t.totalPaise} = ${t.taxableTotalPaise} + ${t.cgstTotalPaise} + ${t.sgstTotalPaise} + ${t.igstTotalPaise} + ${t.cessTotalPaise}`,
    ),
  ],
);

export const expenseItems = sqliteTable(
  'expense_items',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id),
    lineNo: integer('line_no').notNull(),
    /** The expense ledger debited. */
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    description: text('description'),
    hsnSac: text('hsn_sac'),
    taxableValuePaise: paise('taxable_value_paise').notNull(),
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
  },
  (t) => [
    uniqueIndex('expense_items_parent_line_uq').on(t.expenseId, t.lineNo),
    index('expense_items_company_id_idx').on(t.companyId, t.financialYear),
    index('expense_items_account_id_idx').on(t.accountId),
    check('expense_items_fy', isFinancialYear(t.financialYear)),
    check('expense_items_line_no', sql`${t.lineNo} >= 1`),
    check(
      'expense_items_amounts_non_negative',
      sql`${t.taxableValuePaise} >= 0 AND ${t.cgstPaise} >= 0 AND ${t.sgstPaise} >= 0 AND ${t.igstPaise} >= 0 AND ${t.cessPaise} >= 0`,
    ),
    check(
      'expense_items_total',
      sql`${t.totalPaise} = ${t.taxableValuePaise} + ${t.cgstPaise} + ${t.sgstPaise} + ${t.igstPaise} + ${t.cessPaise}`,
    ),
  ],
);

/** Free-form double-entry vouchers entered by the user. */
export const journalVouchers = sqliteTable('journal_vouchers', documentColumns(), (t) => [
  ...documentConstraints('journal_vouchers', t),
]);

export const journalVoucherLines = sqliteTable(
  'journal_voucher_lines',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    journalVoucherId: text('journal_voucher_id')
      .notNull()
      .references(() => journalVouchers.id),
    lineNo: integer('line_no').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    debitPaise: paise('debit_paise').notNull().default(0),
    creditPaise: paise('credit_paise').notNull().default(0),
    narration: text('narration'),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('journal_voucher_lines_parent_line_uq').on(t.journalVoucherId, t.lineNo),
    index('journal_voucher_lines_company_id_idx').on(t.companyId, t.financialYear),
    index('journal_voucher_lines_account_id_idx').on(t.accountId),
    check('journal_voucher_lines_fy', isFinancialYear(t.financialYear)),
    check(
      'journal_voucher_lines_non_negative',
      sql`${t.debitPaise} >= 0 AND ${t.creditPaise} >= 0`,
    ),
    check('journal_voucher_lines_one_side', sql`(${t.debitPaise} = 0) <> (${t.creditPaise} = 0)`),
  ],
);
