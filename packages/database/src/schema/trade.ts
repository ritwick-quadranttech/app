import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { SALES_PAYMENT_TYPES } from './enums';
import { bool, inList, isIsoDate, isoDate } from './columns';
import { accounts } from './masters';
import {
  tradeDocumentColumns,
  tradeDocumentConstraints,
  tradeLineColumns,
  tradeLineConstraints,
} from './documents';

// ---------- sales ----------

export const salesInvoices = sqliteTable(
  'sales_invoices',
  {
    ...tradeDocumentColumns(),
    paymentType: text('payment_type', { enum: SALES_PAYMENT_TYPES }).notNull().default('CREDIT'),
    /** Cash sales only: the cash or bank ledger debited instead of the party. */
    cashBankAccountId: text('cash_bank_account_id').references(() => accounts.id),
  },
  (t) => [
    ...tradeDocumentConstraints('sales_invoices', t),
    index('sales_invoices_cash_bank_account_id_idx').on(t.cashBankAccountId),
    check('sales_invoices_payment_type', inList(t.paymentType, SALES_PAYMENT_TYPES)),
    check(
      'sales_invoices_cash_account',
      sql`(${t.paymentType} = 'CASH') = (${t.cashBankAccountId} IS NOT NULL)`,
    ),
  ],
);

export const salesInvoiceItems = sqliteTable(
  'sales_invoice_items',
  {
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => salesInvoices.id),
    ...tradeLineColumns(),
  },
  (t) => [...tradeLineConstraints('sales_invoice_items', t.invoiceId, t)],
);

/** Credit notes issued to customers. */
export const salesReturns = sqliteTable(
  'sales_returns',
  {
    ...tradeDocumentColumns(),
    originalInvoiceId: text('original_invoice_id').references(() => salesInvoices.id),
    reason: text('reason'),
  },
  (t) => [
    ...tradeDocumentConstraints('sales_returns', t),
    index('sales_returns_original_invoice_id_idx').on(t.originalInvoiceId),
  ],
);

export const salesReturnItems = sqliteTable(
  'sales_return_items',
  {
    returnId: text('return_id')
      .notNull()
      .references(() => salesReturns.id),
    ...tradeLineColumns(),
  },
  (t) => [...tradeLineConstraints('sales_return_items', t.returnId, t)],
);

// ---------- purchases ----------

export const purchaseInvoices = sqliteTable(
  'purchase_invoices',
  {
    ...tradeDocumentColumns(),
    supplierInvoiceNo: text('supplier_invoice_no').notNull(),
    supplierInvoiceDate: isoDate('supplier_invoice_date').notNull(),
    itcEligible: bool('itc_eligible').notNull().default(true),
  },
  (t) => [
    ...tradeDocumentConstraints('purchase_invoices', t),
    // The same supplier bill cannot be booked twice in a FY (cancelled bookings excluded).
    uniqueIndex('purchase_invoices_supplier_bill_uq')
      .on(t.companyId, t.partyId, t.financialYear, t.supplierInvoiceNo)
      .where(sql`${t.status} = 'POSTED'`),
    check('purchase_invoices_supplier_invoice_date', isIsoDate(t.supplierInvoiceDate)),
  ],
);

export const purchaseInvoiceItems = sqliteTable(
  'purchase_invoice_items',
  {
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id),
    ...tradeLineColumns(),
  },
  (t) => [...tradeLineConstraints('purchase_invoice_items', t.invoiceId, t)],
);

/** Debit notes issued to suppliers. */
export const purchaseReturns = sqliteTable(
  'purchase_returns',
  {
    ...tradeDocumentColumns(),
    originalInvoiceId: text('original_invoice_id').references(() => purchaseInvoices.id),
    reason: text('reason'),
  },
  (t) => [
    ...tradeDocumentConstraints('purchase_returns', t),
    index('purchase_returns_original_invoice_id_idx').on(t.originalInvoiceId),
  ],
);

export const purchaseReturnItems = sqliteTable(
  'purchase_return_items',
  {
    returnId: text('return_id')
      .notNull()
      .references(() => purchaseReturns.id),
    ...tradeLineColumns(),
  },
  (t) => [...tradeLineConstraints('purchase_return_items', t.returnId, t)],
);
