import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SourceDocType } from '@repo/database';
import { trialBalance } from './queries';
import type { PostingService } from '../posting/service';
import { igstLine, line, world, type World } from '../test/world';

/** One random business event. Amounts are small integers so tax maths stays exact. */
type Command =
  | { kind: 'sale'; qty: number; rate: number; inter: boolean; cash: boolean; roundOff: number }
  | { kind: 'salesReturn'; qty: number; rate: number }
  | { kind: 'purchase'; qty: number; rate: number; rcm: boolean; itc: boolean; inter: boolean }
  | { kind: 'purchaseReturn'; qty: number; rate: number }
  | { kind: 'receipt' | 'payment'; amount: number; bank: boolean }
  | { kind: 'contra'; amount: number; toBank: boolean }
  | { kind: 'expense'; amount: number; itc: boolean }
  | { kind: 'journal'; amount: number }
  | { kind: 'adjustment'; qty: number }
  | { kind: 'cancel'; pick: number };

const qty = fc.integer({ min: 1, max: 20 });
const rate = fc.integer({ min: 1, max: 500_000 });
const amount = fc.integer({ min: 1, max: 10_000_000 });

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ kind: fc.constant('sale' as const), qty, rate, inter: fc.boolean(), cash: fc.boolean(), roundOff: fc.integer({ min: -99, max: 99 }) }),
  fc.record({ kind: fc.constant('salesReturn' as const), qty, rate }),
  fc.record({ kind: fc.constant('purchase' as const), qty, rate, rcm: fc.boolean(), itc: fc.boolean(), inter: fc.boolean() }),
  fc.record({ kind: fc.constant('purchaseReturn' as const), qty, rate }),
  fc.record({ kind: fc.constantFrom('receipt' as const, 'payment' as const), amount, bank: fc.boolean() }),
  fc.record({ kind: fc.constant('contra' as const), amount, toBank: fc.boolean() }),
  fc.record({ kind: fc.constant('expense' as const), amount, itc: fc.boolean() }),
  fc.record({ kind: fc.constant('journal' as const), amount }),
  fc.record({ kind: fc.constant('adjustment' as const), qty: fc.integer({ min: -20, max: 20 }).filter((q) => q !== 0) }),
  fc.record({ kind: fc.constant('cancel' as const), pick: fc.nat() }),
);

async function run(w: World, p: PostingService, c: Command, cash: string, posted: { type: SourceDocType; id: string }[]) {
  const base = { companyId: w.companyId, date: '2026-06-15' };
  const lineFor = (inter: boolean, q: number, r: number) => (inter ? igstLine(w.widgetId, q, r) : line(w.widgetId, q, r));
  switch (c.kind) {
    case 'sale':
      return p.postSalesInvoice({
        ...base,
        seriesId: w.series.SALES_INVOICE,
        partyId: w.customerId,
        igstApplicable: c.inter,
        roundOffPaise: c.roundOff,
        lines: [lineFor(c.inter, c.qty, c.rate)],
        ...(c.cash ? { cashBankAccountId: cash } : {}),
      });
    case 'salesReturn':
      return p.postSalesReturn({ ...base, seriesId: w.series.SALES_RETURN, partyId: w.customerId, igstApplicable: false, lines: [line(w.widgetId, c.qty, c.rate)] });
    case 'purchase':
      return p.postPurchaseInvoice({
        ...base,
        seriesId: w.series.PURCHASE_INVOICE,
        partyId: w.supplierId,
        igstApplicable: c.inter,
        reverseCharge: c.rcm,
        itcEligible: c.itc,
        supplierInvoiceNo: `S-${posted.length}`,
        supplierInvoiceDate: base.date,
        lines: [lineFor(c.inter, c.qty, c.rate)],
      });
    case 'purchaseReturn':
      return p.postPurchaseReturn({ ...base, seriesId: w.series.PURCHASE_RETURN, partyId: w.supplierId, igstApplicable: false, lines: [line(w.widgetId, c.qty, c.rate)] });
    case 'receipt':
    case 'payment':
      return (c.kind === 'receipt' ? p.postReceipt.bind(p) : p.postPayment.bind(p))({
        ...base,
        seriesId: w.series[c.kind === 'receipt' ? 'RECEIPT' : 'PAYMENT'],
        cashBankAccountId: c.bank ? w.bankAccountId : cash,
        partyId: c.kind === 'receipt' ? w.customerId : w.supplierId,
        amountPaise: c.amount,
        mode: c.bank ? 'UPI' : 'CASH',
      });
    case 'contra':
      return p.postContra({
        ...base,
        seriesId: w.series.CONTRA,
        fromAccountId: c.toBank ? cash : w.bankAccountId,
        toAccountId: c.toBank ? w.bankAccountId : cash,
        amountPaise: c.amount,
        mode: 'CASH',
      });
    case 'expense':
      return p.postExpense({
        ...base,
        seriesId: w.series.EXPENSE,
        creditAccountId: cash,
        itcEligible: c.itc,
        lines: [{ accountId: w.rentAccountId, taxableValuePaise: c.amount, cgstPaise: Math.round(c.amount * 0.09), sgstPaise: Math.round(c.amount * 0.09) }],
      });
    case 'journal':
      return p.postJournalVoucher({
        ...base,
        seriesId: w.series.JOURNAL_VOUCHER,
        lines: [
          { accountId: w.rentAccountId, debitPaise: c.amount },
          { accountId: cash, creditPaise: c.amount },
        ],
      });
    case 'adjustment':
      return p.postStockAdjustment({ ...base, seriesId: w.series.STOCK_ADJUSTMENT, reason: 'count', lines: [{ productId: w.widgetId, qtyX1000: c.qty * 1000, ratePaise: 100 }] });
    case 'cancel': {
      if (posted.length === 0) return undefined;
      const [target] = posted.splice(c.pick % posted.length, 1);
      return p.cancel(target!.type, target!.id, 'random cancel');
    }
  }
}

describe('trial balance (property)', () => {
  it('always balances after 1,000 random postings and cancellations', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(command, { minLength: 1000, maxLength: 1000 }), async (commands) => {
        const w = await world({ negativeStockPolicy: 'ALLOW' });
        const cash = await w.account('CASH');
        const posted: { type: SourceDocType; id: string }[] = [];

        for (const c of commands) {
          const result = await w.post((p) => run(w, p, c, cash, posted));
          if (result && 'docNo' in result) posted.push({ type: result.docType, id: result.id });
        }

        const tb = await trialBalance(w.db, { companyId: w.companyId, asOf: '2027-03-31' });
        expect(tb.totalDebitPaise).toBe(tb.totalCreditPaise);
        // Stronger: every single journal entry balances, and no line is two-sided.
        expect(
          w.sqlite
            .prepare(
              `SELECT journal_entry_id FROM ledger_entries GROUP BY journal_entry_id
               HAVING sum(debit_paise) <> sum(credit_paise)`,
            )
            .all(),
        ).toEqual([]);
        expect(w.count('journal_entries')).toBeGreaterThan(500);
      }),
      { numRuns: 3 },
    );
  }, 120_000);
});
