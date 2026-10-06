import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ALLOCATION_BILL_TYPES, ALLOCATION_VOUCHER_TYPES, PAYMENT_MODES } from './enums';
import { auditColumns, inList, isFinancialYear, isIsoDate, isoDate, paise, pk } from './columns';
import { companies } from './core';
import { documentColumns, documentConstraints } from './documents';
import { accounts, parties } from './masters';

const cashBankVoucherColumns = () => ({
  ...documentColumns(),
  /** The cash or bank ledger the money moves through. */
  cashBankAccountId: text('cash_bank_account_id')
    .notNull()
    .references(() => accounts.id),
  /** The other side: a party's ledger, or any other ledger for non-party vouchers. */
  counterAccountId: text('counter_account_id')
    .notNull()
    .references(() => accounts.id),
  partyId: text('party_id').references(() => parties.id),
  amountPaise: paise('amount_paise').notNull(),
  mode: text('mode', { enum: PAYMENT_MODES }).notNull(),
  referenceNo: text('reference_no'),
  referenceDate: isoDate('reference_date'),
});

/** Money received (typically from customers). */
export const receipts = sqliteTable('receipts', cashBankVoucherColumns(), (t) => [
  ...documentConstraints('receipts', t),
  index('receipts_cash_bank_account_id_idx').on(t.cashBankAccountId),
  index('receipts_counter_account_id_idx').on(t.counterAccountId),
  index('receipts_party_id_idx').on(t.partyId),
  check('receipts_amount', sql`${t.amountPaise} > 0`),
  check('receipts_mode', inList(t.mode, PAYMENT_MODES)),
  check('receipts_accounts_differ', sql`${t.cashBankAccountId} <> ${t.counterAccountId}`),
  check(
    'receipts_reference_date',
    sql`${t.referenceDate} IS NULL OR ${isIsoDate(t.referenceDate)}`,
  ),
]);

/** Money paid (typically to suppliers). */
export const payments = sqliteTable('payments', cashBankVoucherColumns(), (t) => [
  ...documentConstraints('payments', t),
  index('payments_cash_bank_account_id_idx').on(t.cashBankAccountId),
  index('payments_counter_account_id_idx').on(t.counterAccountId),
  index('payments_party_id_idx').on(t.partyId),
  check('payments_amount', sql`${t.amountPaise} > 0`),
  check('payments_mode', inList(t.mode, PAYMENT_MODES)),
  check('payments_accounts_differ', sql`${t.cashBankAccountId} <> ${t.counterAccountId}`),
  check(
    'payments_reference_date',
    sql`${t.referenceDate} IS NULL OR ${isIsoDate(t.referenceDate)}`,
  ),
]);

/**
 * Bill-wise settlement: which voucher (receipt, payment, credit/debit note) settles how much of
 * which invoice. Polymorphic on both sides, so there are no FKs; the engine validates references.
 * Allocations of a cancelled voucher are ignored via the voucher's status.
 */
export const billAllocations = sqliteTable(
  'bill_allocations',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    voucherType: text('voucher_type', { enum: ALLOCATION_VOUCHER_TYPES }).notNull(),
    voucherId: text('voucher_id').notNull(),
    billType: text('bill_type', { enum: ALLOCATION_BILL_TYPES }).notNull(),
    billId: text('bill_id').notNull(),
    amountPaise: paise('amount_paise').notNull(),
    ...auditColumns(),
  },
  (t) => [
    index('bill_allocations_company_id_idx').on(t.companyId, t.financialYear),
    index('bill_allocations_voucher_idx').on(t.voucherType, t.voucherId),
    index('bill_allocations_bill_idx').on(t.billType, t.billId),
    check('bill_allocations_fy', isFinancialYear(t.financialYear)),
    check('bill_allocations_voucher_type', inList(t.voucherType, ALLOCATION_VOUCHER_TYPES)),
    check('bill_allocations_bill_type', inList(t.billType, ALLOCATION_BILL_TYPES)),
    check('bill_allocations_amount', sql`${t.amountPaise} > 0`),
  ],
);
