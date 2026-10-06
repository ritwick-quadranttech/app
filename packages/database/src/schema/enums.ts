// PROVISIONAL: CLAUDE.md (LOCAL DATABASE) was not available when these were defined.
// Reconcile against the spec, especially STOCK_MOVEMENT_TYPES, which the spec says to copy exactly.

export const STOCK_MOVEMENT_TYPES = [
  'OPENING',
  'PURCHASE',
  'PURCHASE_RETURN',
  'SALE',
  'SALE_RETURN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** Movement types that increase stock (qty > 0); all others decrease it (qty < 0). */
export const INWARD_MOVEMENT_TYPES = [
  'OPENING',
  'PURCHASE',
  'SALE_RETURN',
  'ADJUSTMENT_IN',
] as const satisfies readonly StockMovementType[];

/** Documents that can originate journal entries, stock movements and e-documents. */
export const SOURCE_DOC_TYPES = [
  'SALES_INVOICE',
  'SALES_RETURN',
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
  'RECEIPT',
  'PAYMENT',
  'CONTRA',
  'EXPENSE',
  'JOURNAL_VOUCHER',
  /** Also carries opening stock (stock_adjustments.kind = 'OPENING'). */
  'STOCK_ADJUSTMENT',
] as const;
export type SourceDocType = (typeof SOURCE_DOC_TYPES)[number];

/** Document types that draw numbers from number_series. */
export const NUMBERED_DOC_TYPES = SOURCE_DOC_TYPES;
export type NumberedDocType = (typeof NUMBERED_DOC_TYPES)[number];

export const VOUCHER_TYPES = [
  'SALES',
  'SALES_RETURN',
  'PURCHASE',
  'PURCHASE_RETURN',
  'RECEIPT',
  'PAYMENT',
  'JOURNAL',
  'CONTRA',
  'EXPENSE',
  'OPENING',
] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

/** Financial documents are never deleted; they are CANCELLED with a reason and reversing entries. */
export const DOCUMENT_STATUSES = ['POSTED', 'CANCELLED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const E_DOC_STATUSES = [
  'NOT_REQUIRED',
  'PENDING',
  'SUBMITTED',
  'GENERATED',
  'FAILED',
  'CANCELLED',
] as const;
export type EDocStatus = (typeof E_DOC_STATUSES)[number];

/** Documents for which an IRN can be generated. */
export const EINVOICE_DOC_TYPES = ['SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_RETURN'] as const;
export type EInvoiceDocType = (typeof EINVOICE_DOC_TYPES)[number];

/** Documents that can carry an e-way bill. */
export const EWAYBILL_DOC_TYPES = [
  'SALES_INVOICE',
  'SALES_RETURN',
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
] as const;
export type EWayBillDocType = (typeof EWAYBILL_DOC_TYPES)[number];

export const TRANSPORT_MODES = ['ROAD', 'RAIL', 'AIR', 'SHIP'] as const;

export const ACCOUNT_NATURES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;
export type AccountNature = (typeof ACCOUNT_NATURES)[number];

export const PARTY_TYPES = ['CUSTOMER', 'SUPPLIER', 'BOTH'] as const;

export const GST_REGISTRATION_TYPES = [
  'REGULAR',
  'COMPOSITION',
  'UNREGISTERED',
  'CONSUMER',
  'SEZ',
  'OVERSEAS',
  'DEEMED_EXPORT',
] as const;

export const PAYMENT_MODES = [
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CARD',
  'CHEQUE',
  'ONLINE',
  'OTHER',
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Cash sales debit a cash/bank ledger directly; credit sales debit the party. */
export const SALES_PAYMENT_TYPES = ['CREDIT', 'CASH'] as const;
export type SalesPaymentType = (typeof SALES_PAYMENT_TYPES)[number];

export const NEGATIVE_STOCK_POLICIES = ['ALLOW', 'WARN', 'BLOCK'] as const;
export type NegativeStockPolicy = (typeof NEGATIVE_STOCK_POLICIES)[number];

export const STOCK_ADJUSTMENT_KINDS = ['ADJUSTMENT', 'OPENING'] as const;
export type StockAdjustmentKind = (typeof STOCK_ADJUSTMENT_KINDS)[number];

/** GST register: outward = our supplies (GSTR-1), inward = purchases / ITC (GSTR-2B/3B). */
export const GST_DIRECTIONS = ['OUTWARD', 'INWARD'] as const;
export type GstDirection = (typeof GST_DIRECTIONS)[number];

export const GST_SUPPLY_KINDS = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'] as const;
export type GstSupplyKind = (typeof GST_SUPPLY_KINDS)[number];

/** Vouchers that can settle bills, and the bills they can settle. */
export const ALLOCATION_VOUCHER_TYPES = [
  'RECEIPT',
  'PAYMENT',
  'SALES_RETURN',
  'PURCHASE_RETURN',
] as const;
export const ALLOCATION_BILL_TYPES = ['SALES_INVOICE', 'PURCHASE_INVOICE'] as const;

export const USER_ROLES = ['ADMIN', 'ACCOUNTANT', 'OPERATOR', 'VIEWER'] as const;

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'SOFT_DELETE',
  'RESTORE',
  'CANCEL',
  'LOGIN',
  'LOGOUT',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
