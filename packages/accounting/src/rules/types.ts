import type {
  GstDirection,
  GstSupplyKind,
  StockMovementType,
  StockAdjustmentKind,
} from '@repo/database';
import type { Journal } from '../journal';

/** Accounts the engine posts to automatically, keyed by `accounts.system_code` (see seed). */
export const SYSTEM_ACCOUNT_CODES = [
  'CAPITAL',
  'CASH',
  'BANK',
  'SUNDRY_DEBTORS',
  'SUNDRY_CREDITORS',
  'SALES',
  'PURCHASE',
  'OUTPUT_CGST',
  'OUTPUT_SGST',
  'OUTPUT_IGST',
  'OUTPUT_CESS',
  'INPUT_CGST',
  'INPUT_SGST',
  'INPUT_IGST',
  'INPUT_CESS',
  'RCM_PAYABLE',
  'ROUND_OFF',
  'DISCOUNT',
  'STOCK_IN_HAND',
] as const;
export type SystemAccountCode = (typeof SYSTEM_ACCOUNT_CODES)[number];
export type SystemAccounts = Readonly<Record<SystemAccountCode, string>>;

export interface TaxAmounts {
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
  readonly cessPaise: number;
}

export interface TaxRates {
  readonly cgstBp: number;
  readonly sgstBp: number;
  readonly igstBp: number;
  readonly cessBp: number;
}

export interface StockMovementDraft {
  readonly productId: string;
  readonly movementType: StockMovementType;
  /** Signed: + in, − out. */
  readonly qtyX1000: number;
  readonly ratePaise: number;
  readonly sourceLineId: string | null;
}

export interface GstTransactionDraft extends TaxAmounts {
  readonly sourceLineId: string | null;
  readonly direction: GstDirection;
  readonly supplyKind: GstSupplyKind;
  readonly partyId: string | null;
  readonly partyGstin: string | null;
  readonly placeOfSupply: string | null;
  readonly reverseCharge: boolean;
  readonly itcEligible: boolean;
  readonly hsnSac: string | null;
  readonly gstRateBp: number;
  readonly cessRateBp: number;
  /** Signed: negative for notes that reduce tax. */
  readonly taxableValuePaise: number;
}

/** What every posting rule returns. `journal` is null when a document has no ledger effect. */
export interface PostingResult {
  readonly journal: Journal | null;
  readonly stockMovements: readonly StockMovementDraft[];
  readonly gstTransactions: readonly GstTransactionDraft[];
}

// ---------- rule inputs: documents as stored, with references already resolved ----------

export interface TradeLine extends TaxAmounts, TaxRates {
  readonly id: string;
  readonly productId: string;
  /** False for services and non-stock items: no stock movement. */
  readonly trackInventory: boolean;
  readonly hsnSac: string | null;
  readonly qtyX1000: number;
  readonly ratePaise: number;
  readonly taxableValuePaise: number;
}

export interface TradeDocument {
  readonly date: string;
  readonly docNumber: string;
  readonly partyId: string;
  readonly partyAccountId: string;
  readonly partyGstin: string | null;
  readonly placeOfSupply: string;
  readonly reverseCharge: boolean;
  /** Signed. */
  readonly roundOffPaise: number;
  readonly lines: readonly TradeLine[];
}

export interface SalesInvoiceDocument extends TradeDocument {
  /** Cash sale: the cash/bank ledger debited instead of the party. */
  readonly cashBankAccountId: string | null;
}

export interface PurchaseDocument extends TradeDocument {
  readonly itcEligible: boolean;
}

export interface CashVoucherDocument {
  readonly date: string;
  readonly docNumber: string;
  readonly cashBankAccountId: string;
  readonly counterAccountId: string;
  readonly amountPaise: number;
  readonly narration: string | null;
}

export interface ContraDocument {
  readonly date: string;
  readonly docNumber: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountPaise: number;
  readonly narration: string | null;
}

export interface ExpenseLine extends TaxAmounts, TaxRates {
  readonly id: string;
  readonly accountId: string;
  readonly hsnSac: string | null;
  readonly taxableValuePaise: number;
}

export interface ExpenseDocument {
  readonly date: string;
  readonly docNumber: string;
  readonly creditAccountId: string;
  readonly partyId: string | null;
  readonly supplierGstin: string | null;
  readonly placeOfSupply: string | null;
  readonly itcEligible: boolean;
  readonly narration: string | null;
  readonly lines: readonly ExpenseLine[];
}

export interface JournalVoucherDocument {
  readonly date: string;
  readonly docNumber: string;
  readonly narration: string | null;
  readonly lines: readonly {
    readonly accountId: string;
    readonly debitPaise: number;
    readonly creditPaise: number;
    readonly narration?: string;
  }[];
}

export interface StockAdjustmentDocument {
  readonly date: string;
  readonly docNumber: string;
  readonly kind: StockAdjustmentKind;
  readonly reason: string;
  readonly lines: readonly {
    readonly id: string;
    readonly productId: string;
    /** Signed for adjustments; must be positive for opening stock. */
    readonly qtyX1000: number;
    readonly ratePaise: number;
  }[];
}
