import type { PaymentMode, SalesPaymentMethod, SalesPaymentStatus } from '@repo/database';

/*
 * What callers (the UI via the Tauri bridge, imports, tests) hand to PostingService. Amounts are
 * paise, rates basis points, quantities × 1000. Line tax amounts are already computed
 * (gst-engine); header totals are derived from the lines, never accepted from the caller.
 */

interface NumberedInput {
  readonly companyId: string;
  /** Number series to allocate from; must match the document type and the date's FY. */
  readonly seriesId: string;
  readonly date: string;
  readonly notes?: string;
}

export interface TradeLineInput {
  readonly productId: string;
  readonly description?: string;
  /** Defaults to the product's HSN/SAC. */
  readonly hsnSac?: string;
  /** Defaults to the product's unit. */
  readonly unitId?: string;
  readonly qtyX1000: number;
  readonly ratePaise: number;
  readonly discountPaise?: number;
  readonly taxableValuePaise: number;
  readonly cgstBp?: number;
  readonly sgstBp?: number;
  readonly igstBp?: number;
  readonly cessBp?: number;
  readonly cgstPaise?: number;
  readonly sgstPaise?: number;
  readonly igstPaise?: number;
  readonly cessPaise?: number;
}

export interface TradeDocumentInput extends NumberedInput {
  readonly partyId: string;
  /** State code. Defaults to the party's state, else the company's. */
  readonly placeOfSupply?: string;
  readonly igstApplicable: boolean;
  readonly reverseCharge?: boolean;
  readonly dueDate?: string;
  /** Signed. */
  readonly roundOffPaise?: number;
  readonly lines: readonly TradeLineInput[];
}

export interface SalesInvoiceInput extends TradeDocumentInput {
  /** Present → cash sale settled into this cash/bank ledger. Absent → credit sale. */
  readonly cashBankAccountId?: string;
  readonly paymentMethod?: SalesPaymentMethod;
  readonly paymentStatus?: SalesPaymentStatus;
}

export interface SalesReturnInput extends TradeDocumentInput {
  readonly originalInvoiceId?: string;
  readonly reason?: string;
}

export interface PurchaseInvoiceInput extends TradeDocumentInput {
  readonly supplierInvoiceNo: string;
  readonly supplierInvoiceDate: string;
  /** Default true. False: the tax is added to the cost of purchase. */
  readonly itcEligible?: boolean;
}

export interface PurchaseReturnInput extends TradeDocumentInput {
  /** When given, ITC eligibility follows the original purchase. */
  readonly originalInvoiceId?: string;
  readonly reason?: string;
}

/** Receipt or payment. Give either `partyId` (its ledger is used) or `counterAccountId`. */
export interface CashVoucherInput extends NumberedInput {
  readonly cashBankAccountId: string;
  readonly partyId?: string;
  readonly counterAccountId?: string;
  readonly amountPaise: number;
  readonly mode: PaymentMode;
  readonly referenceNo?: string;
  readonly referenceDate?: string;
}

export interface ContraInput extends NumberedInput {
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountPaise: number;
  readonly mode: PaymentMode;
  readonly referenceNo?: string;
}

export interface ExpenseLineInput {
  readonly accountId: string;
  readonly description?: string;
  readonly hsnSac?: string;
  readonly taxableValuePaise: number;
  readonly cgstBp?: number;
  readonly sgstBp?: number;
  readonly igstBp?: number;
  readonly cessBp?: number;
  readonly cgstPaise?: number;
  readonly sgstPaise?: number;
  readonly igstPaise?: number;
  readonly cessPaise?: number;
}

export interface ExpenseInput extends NumberedInput {
  /** Cash/bank ledger (paid now) or a party ledger (payable later). */
  readonly creditAccountId: string;
  readonly partyId?: string;
  readonly supplierGstin?: string;
  readonly supplierInvoiceNo?: string;
  readonly placeOfSupply?: string;
  readonly igstApplicable?: boolean;
  /** Default true. */
  readonly itcEligible?: boolean;
  readonly lines: readonly ExpenseLineInput[];
}

export interface JournalVoucherInput extends NumberedInput {
  readonly lines: readonly {
    readonly accountId: string;
    readonly debitPaise?: number;
    readonly creditPaise?: number;
    readonly narration?: string;
  }[];
}

export interface StockAdjustmentInput extends NumberedInput {
  readonly reason: string;
  readonly lines: readonly {
    readonly productId: string;
    /** Signed for adjustments (+ in, − out); positive for opening stock. */
    readonly qtyX1000: number;
    readonly ratePaise: number;
  }[];
}
