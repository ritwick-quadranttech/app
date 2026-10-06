import { DocumentValidationError } from '../errors';
import { JournalBuilder } from '../journal';
import { assertPaise, sumPaise } from '../money';
import type {
  CashVoucherDocument,
  ContraDocument,
  ExpenseDocument,
  GstTransactionDraft,
  JournalVoucherDocument,
  PostingResult,
  SystemAccounts,
} from './types';

const noStockNoGst = { stockMovements: [], gstTransactions: [] } as const;

function assertPositive(amountPaise: number, label: string): void {
  assertPaise(amountPaise, label);
  if (amountPaise === 0) throw new DocumentValidationError(`${label} must be greater than zero.`);
}

function assertDistinct(a: string, b: string): void {
  if (a === b) throw new DocumentValidationError('Debit and credit accounts must differ.');
}

/** Receipt:  Dr Cash/Bank   Cr Party (or other counter ledger). */
export function postReceipt(doc: CashVoucherDocument): PostingResult {
  assertPositive(doc.amountPaise, 'Amount');
  assertDistinct(doc.cashBankAccountId, doc.counterAccountId);
  return {
    journal: new JournalBuilder('RECEIPT', doc.date, doc.narration ?? `Receipt ${doc.docNumber}`)
      .debit(doc.cashBankAccountId, doc.amountPaise)
      .credit(doc.counterAccountId, doc.amountPaise)
      .build(),
    ...noStockNoGst,
  };
}

/** Payment:  Dr Party (or other counter ledger)   Cr Cash/Bank. */
export function postPayment(doc: CashVoucherDocument): PostingResult {
  assertPositive(doc.amountPaise, 'Amount');
  assertDistinct(doc.cashBankAccountId, doc.counterAccountId);
  return {
    journal: new JournalBuilder('PAYMENT', doc.date, doc.narration ?? `Payment ${doc.docNumber}`)
      .debit(doc.counterAccountId, doc.amountPaise)
      .credit(doc.cashBankAccountId, doc.amountPaise)
      .build(),
    ...noStockNoGst,
  };
}

/** Contra:  Dr destination cash/bank   Cr source cash/bank. */
export function postContra(doc: ContraDocument): PostingResult {
  assertPositive(doc.amountPaise, 'Amount');
  assertDistinct(doc.fromAccountId, doc.toAccountId);
  return {
    journal: new JournalBuilder('CONTRA', doc.date, doc.narration ?? `Contra ${doc.docNumber}`)
      .debit(doc.toAccountId, doc.amountPaise)
      .credit(doc.fromAccountId, doc.amountPaise)
      .build(),
    ...noStockNoGst,
  };
}

/**
 * Expense:  Dr Expense ledger(s)   taxable (+ tax, when input credit is not available)
 *           Dr Input GST           each head (when ITC-eligible)
 *             Cr Cash/Bank/Party   total
 */
export function postExpense(doc: ExpenseDocument, acc: SystemAccounts): PostingResult {
  if (doc.lines.length === 0) throw new DocumentValidationError('An expense needs at least one line.');
  doc.lines.forEach((l, i) => {
    for (const [label, v] of [
      ['taxable value', l.taxableValuePaise],
      ['CGST', l.cgstPaise],
      ['SGST', l.sgstPaise],
      ['IGST', l.igstPaise],
      ['cess', l.cessPaise],
    ] as const) {
      assertPaise(v, `line ${i + 1} ${label}`);
    }
  });
  const tax = (l: ExpenseDocument['lines'][number]) =>
    l.cgstPaise + l.sgstPaise + l.igstPaise + l.cessPaise;
  const sum = (pick: (l: ExpenseDocument['lines'][number]) => number) =>
    sumPaise(doc.lines.map(pick));
  const total = sum((l) => l.taxableValuePaise + tax(l));
  assertPositive(total, 'Expense total');

  const j = new JournalBuilder('EXPENSE', doc.date, doc.narration ?? `Expense ${doc.docNumber}`);
  for (const l of doc.lines) {
    j.debit(l.accountId, l.taxableValuePaise + (doc.itcEligible ? 0 : tax(l)));
  }
  if (doc.itcEligible) {
    j.debit(acc.INPUT_CGST, sum((l) => l.cgstPaise))
      .debit(acc.INPUT_SGST, sum((l) => l.sgstPaise))
      .debit(acc.INPUT_IGST, sum((l) => l.igstPaise))
      .debit(acc.INPUT_CESS, sum((l) => l.cessPaise));
  }
  j.credit(doc.creditAccountId, total);

  const gstTransactions: GstTransactionDraft[] = doc.lines
    .filter((l) => tax(l) > 0)
    .map((l) => ({
      sourceLineId: l.id,
      direction: 'INWARD',
      supplyKind: 'INVOICE',
      partyId: doc.partyId,
      partyGstin: doc.supplierGstin,
      placeOfSupply: doc.placeOfSupply,
      reverseCharge: false,
      itcEligible: doc.itcEligible,
      hsnSac: l.hsnSac,
      gstRateBp: l.igstBp + l.cgstBp + l.sgstBp,
      cessRateBp: l.cessBp,
      taxableValuePaise: l.taxableValuePaise,
      cgstPaise: l.cgstPaise,
      sgstPaise: l.sgstPaise,
      igstPaise: l.igstPaise,
      cessPaise: l.cessPaise,
    }));

  return { journal: j.build(), stockMovements: [], gstTransactions };
}

/** Journal voucher: user-entered lines, posted exactly as entered (and so must balance). */
export function postJournalVoucher(doc: JournalVoucherDocument): PostingResult {
  if (doc.lines.length < 2) {
    throw new DocumentValidationError('A journal voucher needs at least two lines.');
  }
  const j = new JournalBuilder(
    'JOURNAL',
    doc.date,
    doc.narration ?? `Journal ${doc.docNumber}`,
  );
  for (const line of doc.lines) j.line(line);
  return { journal: j.build(), ...noStockNoGst };
}
