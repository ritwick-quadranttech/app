import type { GstDirection, GstSupplyKind } from '@repo/database';
import { DocumentValidationError } from '../errors';
import { JournalBuilder, reverseJournal } from '../journal';
import { assertPaise, sumPaise } from '../money';
import type {
  GstTransactionDraft,
  PostingResult,
  PurchaseDocument,
  SalesInvoiceDocument,
  StockMovementDraft,
  SystemAccounts,
  TaxAmounts,
  TradeDocument,
  TradeLine,
} from './types';

/*
 * Inventory is accounted periodically (the common Indian trading set-up): purchases are debited
 * to Purchase and sales credited to Sales; stock-in-hand is valued at period end (Phase 8).
 * Line tax amounts arrive already computed (gst-engine, Phase 1) and are posted as given.
 */

export interface TradeTotals extends TaxAmounts {
  readonly taxablePaise: number;
  readonly taxPaise: number;
}

export function tradeTotals(lines: readonly TradeLine[]): TradeTotals {
  const sum = (pick: (l: TradeLine) => number) => sumPaise(lines.map(pick));
  const cgstPaise = sum((l) => l.cgstPaise);
  const sgstPaise = sum((l) => l.sgstPaise);
  const igstPaise = sum((l) => l.igstPaise);
  const cessPaise = sum((l) => l.cessPaise);
  return {
    taxablePaise: sum((l) => l.taxableValuePaise),
    cgstPaise,
    sgstPaise,
    igstPaise,
    cessPaise,
    taxPaise: cgstPaise + sgstPaise + igstPaise + cessPaise,
  };
}

/** Amount the party owes / is owed: tax is excluded under reverse charge. */
export function tradeGrandTotal(doc: TradeDocument): number {
  const t = tradeTotals(doc.lines);
  return t.taxablePaise + (doc.reverseCharge ? 0 : t.taxPaise) + doc.roundOffPaise;
}

export function validateTradeDocument(doc: TradeDocument): void {
  if (doc.lines.length === 0) throw new DocumentValidationError('A document needs at least one line.');
  assertPaise(doc.roundOffPaise, 'round off', { allowNegative: true });
  doc.lines.forEach((l, i) => {
    const at = `line ${i + 1}`;
    if (!Number.isSafeInteger(l.qtyX1000) || l.qtyX1000 <= 0) {
      throw new DocumentValidationError(`${at}: quantity must be a positive integer (×1000).`);
    }
    for (const [label, v] of [
      ['rate', l.ratePaise],
      ['taxable value', l.taxableValuePaise],
      ['CGST', l.cgstPaise],
      ['SGST', l.sgstPaise],
      ['IGST', l.igstPaise],
      ['cess', l.cessPaise],
    ] as const) {
      assertPaise(v, `${at} ${label}`);
    }
    if (l.igstPaise > 0 && (l.cgstPaise > 0 || l.sgstPaise > 0)) {
      throw new DocumentValidationError(`${at}: a line has either IGST or CGST+SGST, not both.`);
    }
  });
  if (tradeGrandTotal(doc) < 0) throw new DocumentValidationError('Document total is negative.');
}

const gstDrafts = (
  doc: TradeDocument,
  direction: GstDirection,
  supplyKind: GstSupplyKind,
  sign: 1 | -1,
  itcEligible: boolean,
): GstTransactionDraft[] =>
  doc.lines.map((l) => ({
    sourceLineId: l.id,
    direction,
    supplyKind,
    partyId: doc.partyId,
    partyGstin: doc.partyGstin,
    placeOfSupply: doc.placeOfSupply,
    reverseCharge: doc.reverseCharge,
    itcEligible,
    hsnSac: l.hsnSac,
    gstRateBp: l.igstBp + l.cgstBp + l.sgstBp,
    cessRateBp: l.cessBp,
    taxableValuePaise: sign * l.taxableValuePaise,
    cgstPaise: sign * l.cgstPaise,
    sgstPaise: sign * l.sgstPaise,
    igstPaise: sign * l.igstPaise,
    cessPaise: sign * l.cessPaise,
  }));

const stockDrafts = (
  lines: readonly TradeLine[],
  movementType: StockMovementDraft['movementType'],
  sign: 1 | -1,
): StockMovementDraft[] =>
  lines
    .filter((l) => l.trackInventory)
    .map((l) => ({
      productId: l.productId,
      movementType,
      qtyX1000: sign * l.qtyX1000,
      ratePaise: l.ratePaise,
      sourceLineId: l.id,
    }));

// ---------- sales ----------

/**
 * Credit sale:  Dr Party            grand total
 *                 Cr Sales           taxable
 *                 Cr Output GST      each head (not under reverse charge: the buyer pays it)
 *                 Cr/Dr Round Off    signed
 * Cash sale: the cash/bank ledger is debited instead of the party.
 */
function salesJournal(
  doc: TradeDocument,
  debitAccountId: string,
  acc: SystemAccounts,
  voucherType: 'SALES' | 'SALES_RETURN',
  narration: string,
) {
  const t = tradeTotals(doc.lines);
  const j = new JournalBuilder(voucherType, doc.date, narration)
    .debit(debitAccountId, tradeGrandTotal(doc))
    .credit(acc.SALES, t.taxablePaise);
  if (!doc.reverseCharge) {
    j.credit(acc.OUTPUT_CGST, t.cgstPaise)
      .credit(acc.OUTPUT_SGST, t.sgstPaise)
      .credit(acc.OUTPUT_IGST, t.igstPaise)
      .credit(acc.OUTPUT_CESS, t.cessPaise);
  }
  return j.credit(acc.ROUND_OFF, doc.roundOffPaise).build();
}

export function postSalesInvoice(doc: SalesInvoiceDocument, acc: SystemAccounts): PostingResult {
  validateTradeDocument(doc);
  return {
    journal: salesJournal(
      doc,
      doc.cashBankAccountId ?? doc.partyAccountId,
      acc,
      'SALES',
      `Sales ${doc.docNumber}`,
    ),
    stockMovements: stockDrafts(doc.lines, 'SALE', -1),
    gstTransactions: gstDrafts(doc, 'OUTWARD', 'INVOICE', 1, false),
  };
}

/** Credit note: the exact mirror of a credit sale; goods come back into stock. */
export function postSalesReturn(doc: TradeDocument, acc: SystemAccounts): PostingResult {
  validateTradeDocument(doc);
  const asSale = salesJournal(doc, doc.partyAccountId, acc, 'SALES', `Sales return ${doc.docNumber}`);
  return {
    journal: reverseJournal(asSale, 'SALES_RETURN'),
    stockMovements: stockDrafts(doc.lines, 'SALE_RETURN', 1),
    gstTransactions: gstDrafts(doc, 'OUTWARD', 'CREDIT_NOTE', -1, false),
  };
}

// ---------- purchases ----------

/**
 * Purchase:   Dr Purchase          taxable (+ tax, when input credit is not available)
 *             Dr Input GST         each head (when ITC-eligible)
 *               Cr Party           grand total (excludes tax under reverse charge)
 *               Cr RCM Payable     total tax, under reverse charge
 *             Dr/Cr Round Off      signed
 */
function purchaseJournal(
  doc: PurchaseDocument,
  acc: SystemAccounts,
  voucherType: 'PURCHASE' | 'PURCHASE_RETURN',
  narration: string,
) {
  const t = tradeTotals(doc.lines);
  const j = new JournalBuilder(voucherType, doc.date, narration).debit(
    acc.PURCHASE,
    t.taxablePaise + (doc.itcEligible ? 0 : t.taxPaise),
  );
  if (doc.itcEligible) {
    j.debit(acc.INPUT_CGST, t.cgstPaise)
      .debit(acc.INPUT_SGST, t.sgstPaise)
      .debit(acc.INPUT_IGST, t.igstPaise)
      .debit(acc.INPUT_CESS, t.cessPaise);
  }
  if (doc.reverseCharge) j.credit(acc.RCM_PAYABLE, t.taxPaise);
  return j
    .debit(acc.ROUND_OFF, doc.roundOffPaise)
    .credit(doc.partyAccountId, tradeGrandTotal(doc))
    .build();
}

export function postPurchaseInvoice(doc: PurchaseDocument, acc: SystemAccounts): PostingResult {
  validateTradeDocument(doc);
  return {
    journal: purchaseJournal(doc, acc, 'PURCHASE', `Purchase ${doc.docNumber}`),
    stockMovements: stockDrafts(doc.lines, 'PURCHASE', 1),
    gstTransactions: gstDrafts(doc, 'INWARD', 'INVOICE', 1, doc.itcEligible),
  };
}

/** Debit note: the exact mirror of a purchase; goods leave stock. */
export function postPurchaseReturn(doc: PurchaseDocument, acc: SystemAccounts): PostingResult {
  validateTradeDocument(doc);
  const asPurchase = purchaseJournal(doc, acc, 'PURCHASE', `Purchase return ${doc.docNumber}`);
  return {
    journal: reverseJournal(asPurchase, 'PURCHASE_RETURN'),
    stockMovements: stockDrafts(doc.lines, 'PURCHASE_RETURN', -1),
    gstTransactions: gstDrafts(doc, 'INWARD', 'DEBIT_NOTE', -1, doc.itcEligible),
  };
}
