import { describe, expect, it } from 'vitest';
import { UnbalancedJournalError } from '../errors';
import { assertBalanced, type Journal } from '../journal';
import { postOpeningStock, postStockAdjustment } from './stock';
import { postPurchaseInvoice, postPurchaseReturn, postSalesInvoice, postSalesReturn } from './trade';
import type { PostingResult, SystemAccounts, TradeLine } from './types';
import { SYSTEM_ACCOUNT_CODES } from './types';
import {
  postContra,
  postExpense,
  postJournalVoucher,
  postPayment,
  postReceipt,
} from './vouchers';

const acc = Object.fromEntries(SYSTEM_ACCOUNT_CODES.map((c) => [c, c])) as SystemAccounts;

const tradeLine = (over: Partial<TradeLine> = {}): TradeLine => ({
  id: 'l1',
  productId: 'p1',
  trackInventory: true,
  hsnSac: '8471',
  qtyX1000: 2000,
  ratePaise: 5_000,
  taxableValuePaise: 10_000,
  cgstBp: 900,
  sgstBp: 900,
  igstBp: 0,
  cessBp: 0,
  cgstPaise: 900,
  sgstPaise: 900,
  igstPaise: 0,
  cessPaise: 0,
  ...over,
});

const trade = {
  date: '2026-05-10',
  docNumber: 'X/1',
  partyId: 'party',
  partyAccountId: 'PARTY',
  partyGstin: null,
  placeOfSupply: '27',
  reverseCharge: false,
  roundOffPaise: 0,
  lines: [tradeLine(), tradeLine({ id: 'l2', productId: 'svc', trackInventory: false })],
};

/** Net effect per account (debit-positive), for readable assertions. */
const effect = (j: Journal | null) => {
  const out: Record<string, number> = {};
  for (const l of j?.lines ?? []) out[l.accountId] = (out[l.accountId] ?? 0) + l.debitPaise - l.creditPaise;
  return out;
};

const signs = (r: PostingResult) => r.stockMovements.map((m) => [m.movementType, Math.sign(m.qtyX1000)]);

describe('posting rules', () => {
  const cases: [string, () => PostingResult, [string, number][]][] = [
    ['credit sale', () => postSalesInvoice({ ...trade, cashBankAccountId: null }, acc), [['SALE', -1]]],
    ['cash sale', () => postSalesInvoice({ ...trade, cashBankAccountId: 'CASH' }, acc), [['SALE', -1]]],
    ['sales return', () => postSalesReturn(trade, acc), [['SALE_RETURN', 1]]],
    ['purchase', () => postPurchaseInvoice({ ...trade, itcEligible: true }, acc), [['PURCHASE', 1]]],
    [
      'purchase under reverse charge',
      () => postPurchaseInvoice({ ...trade, reverseCharge: true, itcEligible: true }, acc),
      [['PURCHASE', 1]],
    ],
    ['purchase return', () => postPurchaseReturn({ ...trade, itcEligible: true }, acc), [['PURCHASE_RETURN', -1]]],
    [
      'receipt',
      () =>
        postReceipt({ date: '2026-05-10', docNumber: 'R/1', cashBankAccountId: 'CASH', counterAccountId: 'PARTY', amountPaise: 500, narration: null }),
      [],
    ],
    [
      'payment',
      () =>
        postPayment({ date: '2026-05-10', docNumber: 'P/1', cashBankAccountId: 'BANK1', counterAccountId: 'PARTY', amountPaise: 500, narration: null }),
      [],
    ],
    [
      'contra',
      () =>
        postContra({ date: '2026-05-10', docNumber: 'C/1', fromAccountId: 'CASH', toAccountId: 'BANK1', amountPaise: 500, narration: null }),
      [],
    ],
    [
      'expense with ITC',
      () =>
        postExpense(
          {
            date: '2026-05-10',
            docNumber: 'E/1',
            creditAccountId: 'CASH',
            partyId: null,
            supplierGstin: null,
            placeOfSupply: '27',
            itcEligible: true,
            narration: null,
            lines: [
              { id: 'e1', accountId: 'RENT', hsnSac: '997212', taxableValuePaise: 10_000, cgstBp: 900, sgstBp: 900, igstBp: 0, cessBp: 0, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, cessPaise: 0 },
            ],
          },
          acc,
        ),
      [],
    ],
    [
      'journal voucher',
      () =>
        postJournalVoucher({
          date: '2026-05-10',
          docNumber: 'J/1',
          narration: null,
          lines: [
            { accountId: 'A', debitPaise: 700, creditPaise: 0 },
            { accountId: 'B', debitPaise: 0, creditPaise: 700 },
          ],
        }),
      [],
    ],
    [
      'stock adjustment',
      () =>
        postStockAdjustment({
          date: '2026-05-10',
          docNumber: 'S/1',
          kind: 'ADJUSTMENT',
          reason: 'count',
          lines: [
            { id: 'a', productId: 'p1', qtyX1000: 3000, ratePaise: 100 },
            { id: 'b', productId: 'p2', qtyX1000: -1000, ratePaise: 100 },
          ],
        }),
      [['ADJUSTMENT_IN', 1], ['ADJUSTMENT_OUT', -1]],
    ],
    [
      'opening stock',
      () =>
        postOpeningStock(
          {
            date: '2026-04-01',
            docNumber: 'S/2',
            kind: 'OPENING',
            reason: 'opening',
            lines: [{ id: 'a', productId: 'p1', qtyX1000: 1500, ratePaise: 333 }],
          },
          acc,
        ),
      [['OPENING', 1]],
    ],
  ];

  it.each(cases)('%s: balanced journal and correct stock signs', (_name, run, expectedSigns) => {
    const result = run();
    if (result.journal) expect(() => assertBalanced(result.journal!)).not.toThrow();
    expect(signs(result)).toEqual(expectedSigns);
  });

  it('credit sale: party debited with the grand total, sales and output tax credited', () => {
    const r = postSalesInvoice({ ...trade, roundOffPaise: -40, cashBankAccountId: null }, acc);
    expect(effect(r.journal)).toEqual({
      PARTY: 23_560,
      SALES: -20_000,
      OUTPUT_CGST: -1_800,
      OUTPUT_SGST: -1_800,
      ROUND_OFF: 40,
    });
    expect(r.gstTransactions.every((g) => g.direction === 'OUTWARD' && g.taxableValuePaise > 0)).toBe(true);
  });

  it('cash sale debits the cash/bank ledger, not the party', () => {
    const r = postSalesInvoice({ ...trade, cashBankAccountId: 'CASH' }, acc);
    expect(effect(r.journal)['CASH']).toBe(23_600);
    expect(effect(r.journal)['PARTY']).toBeUndefined();
  });

  it('reverse-charge purchase posts input tax AND RCM liability; supplier gets taxable only', () => {
    const r = postPurchaseInvoice({ ...trade, reverseCharge: true, itcEligible: true }, acc);
    expect(effect(r.journal)).toEqual({
      PURCHASE: 20_000,
      INPUT_CGST: 1_800,
      INPUT_SGST: 1_800,
      RCM_PAYABLE: -3_600,
      PARTY: -20_000,
    });
  });

  it('purchase without ITC capitalises the tax into purchases', () => {
    const r = postPurchaseInvoice({ ...trade, itcEligible: false }, acc);
    expect(effect(r.journal)).toEqual({ PURCHASE: 23_600, PARTY: -23_600 });
  });

  it('returns are exact mirror images, with negative GST rows', () => {
    const sale = effect(postSalesInvoice({ ...trade, cashBankAccountId: null }, acc).journal);
    const ret = postSalesReturn(trade, acc);
    for (const [k, v] of Object.entries(effect(ret.journal))) expect(v).toBe(-(sale[k] ?? 0));
    expect(ret.gstTransactions.map((g) => [g.supplyKind, Math.sign(g.taxableValuePaise)])).toEqual([
      ['CREDIT_NOTE', -1],
      ['CREDIT_NOTE', -1],
    ]);
  });

  it('services post no stock movement', () => {
    const r = postSalesInvoice({ ...trade, cashBankAccountId: null }, acc);
    expect(r.stockMovements.map((m) => m.productId)).toEqual(['p1']);
  });

  it('opening stock values qty × rate, rounded half-up to the paisa', () => {
    const r = postOpeningStock(
      { date: '2026-04-01', docNumber: 'S', kind: 'OPENING', reason: 'o', lines: [{ id: 'a', productId: 'p', qtyX1000: 1500, ratePaise: 333 }] },
      acc,
    );
    expect(effect(r.journal)).toEqual({ STOCK_IN_HAND: 500, CAPITAL: -500 }); // 1.5 × 333 = 499.5 → 500
  });
});

describe('assertBalanced', () => {
  const j = (lines: Journal['lines']): Journal => ({ voucherType: 'JOURNAL', date: '2026-05-10', narration: null, lines });

  it('rejects unequal totals', () => {
    expect(() =>
      assertBalanced(j([{ accountId: 'A', debitPaise: 100, creditPaise: 0 }, { accountId: 'B', debitPaise: 0, creditPaise: 99 }])),
    ).toThrow(UnbalancedJournalError);
  });

  it('rejects a line with both sides, even when totals agree', () => {
    expect(() =>
      assertBalanced(j([{ accountId: 'A', debitPaise: 100, creditPaise: 100 }])),
    ).toThrow(/both a debit and a credit/);
  });

  it('rejects fractional or negative paise', () => {
    expect(() => assertBalanced(j([{ accountId: 'A', debitPaise: 0.5, creditPaise: 0 }]))).toThrow(/integer/);
    expect(() => assertBalanced(j([{ accountId: 'A', debitPaise: -1, creditPaise: 0 }]))).toThrow(/negative/);
  });

  it('a journal voucher entered unbalanced is rejected by the rule', () => {
    expect(() =>
      postJournalVoucher({
        date: '2026-05-10',
        docNumber: 'J',
        narration: null,
        lines: [
          { accountId: 'A', debitPaise: 700, creditPaise: 0 },
          { accountId: 'B', debitPaise: 0, creditPaise: 600 },
        ],
      }),
    ).toThrow(UnbalancedJournalError);
  });
});
