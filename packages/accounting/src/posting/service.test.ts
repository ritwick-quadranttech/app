import { companies, journalEntries, salesInvoices, stockMovements } from '@repo/database';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  AlreadyCancelledError,
  DocumentValidationError,
  InvalidAccountError,
  NegativeStockError,
  PeriodLockedError,
} from '../errors';
import { accountBalance, trialBalance } from '../ledger/queries';
import { updatePostingSettings } from '../settings';
import { ACTOR, igstLine, line, world, type World } from '../test/world';
import { PostingService } from './service';

/** Tables any posting writes to. */
const WRITTEN = [
  'sales_invoices',
  'sales_invoice_items',
  'journal_entries',
  'ledger_entries',
  'stock_movements',
  'gst_transactions',
  'audit_logs',
];

const snapshotCounts = (w: World) => Object.fromEntries(WRITTEN.map((t) => [t, w.count(t)]));

async function stockIn(w: World, qty: number) {
  return w.post((p) =>
    p.postPurchaseInvoice({
      companyId: w.companyId,
      seriesId: w.series.PURCHASE_INVOICE,
      date: '2026-05-01',
      partyId: w.supplierId,
      igstApplicable: false,
      supplierInvoiceNo: `B-${Math.random()}`,
      supplierInvoiceDate: '2026-05-01',
      lines: [line(w.widgetId, qty, 1_000)],
    }),
  );
}

const sale = (w: World, qty: number, over: Partial<Parameters<PostingService['postSalesInvoice']>[0]> = {}) =>
  w.post((p) =>
    p.postSalesInvoice({
      companyId: w.companyId,
      seriesId: w.series.SALES_INVOICE,
      date: '2026-05-10',
      partyId: w.customerId,
      igstApplicable: false,
      lines: [line(w.widgetId, qty, 2_000), line(w.serviceId, 1, 500)],
      ...over,
    }),
  );

describe('PostingService', () => {
  it('writes document, items, journal, ledger, stock, GST and audit rows', async () => {
    const w = await world();

    const posted = await sale(w, 3);

    expect(posted).toMatchObject({ docNo: 1, docNumber: 'SAL/1', financialYear: '2026-27' });
    expect(Object.fromEntries(WRITTEN.map((t) => [t, w.count(t)]))).toEqual({
      sales_invoices: 1,
      sales_invoice_items: 2,
      journal_entries: 1,
      ledger_entries: 4, // party, sales, CGST, SGST
      stock_movements: 1, // the service line moves no stock
      gst_transactions: 2,
      audit_logs: 1,
    });
    const [inv] = await w.db.select().from(salesInvoices);
    expect(inv).toMatchObject({ taxableTotalPaise: 6_500, grandTotalPaise: 7_670, paymentType: 'CREDIT' });
    expect((await accountBalance(w.db, { companyId: w.companyId, accountId: w.customerAccountId, asOf: '2026-05-31' })).balancePaise).toBe(7_670);
  });

  it('cash sale debits the chosen cash/bank ledger', async () => {
    const w = await world();
    const cash = await w.account('CASH');

    await sale(w, 1, { cashBankAccountId: cash });

    expect((await accountBalance(w.db, { companyId: w.companyId, accountId: cash, asOf: '2026-05-31' })).balancePaise).toBe(2_950);
    expect((await accountBalance(w.db, { companyId: w.companyId, accountId: w.customerAccountId, asOf: '2026-05-31' })).balancePaise).toBe(0);
  });

  it('a forced failure mid-transaction leaves zero rows behind', async () => {
    const w = await world();
    const before = snapshotCounts(w);

    await expect(
      w.post(async (p) => {
        await p.postSalesInvoice({
          companyId: w.companyId,
          seriesId: w.series.SALES_INVOICE,
          date: '2026-05-10',
          partyId: w.customerId,
          igstApplicable: false,
          lines: [line(w.widgetId, 1, 1_000)],
        });
        throw new Error('power cut');
      }),
    ).rejects.toThrow('power cut');

    expect(snapshotCounts(w)).toEqual(before);
    // …and the number came back: the next invoice is still no. 1.
    expect((await sale(w, 1)).docNo).toBe(1);
  });

  it('a failure inside the posting (bad account) also leaves zero rows behind', async () => {
    const w = await world();
    const before = snapshotCounts(w);
    const bankGroup = await w.account('BANK');

    await expect(sale(w, 1, { cashBankAccountId: bankGroup })).rejects.toBeInstanceOf(InvalidAccountError);

    expect(snapshotCounts(w)).toEqual(before);
  });

  it('cancel posts exact reversals; trial balance returns to its pre-posting state', async () => {
    const w = await world();
    await stockIn(w, 10);
    const before = await trialBalance(w.db, { companyId: w.companyId, asOf: '2026-12-31' });

    const posted = await sale(w, 4);
    const during = await trialBalance(w.db, { companyId: w.companyId, asOf: '2026-12-31' });
    expect(during.rows).not.toEqual(before.rows);

    const cancelled = await w.post((p) => p.cancel('SALES_INVOICE', posted.id, 'Wrong customer'));

    expect(await trialBalance(w.db, { companyId: w.companyId, asOf: '2026-12-31' })).toEqual(before);
    expect(cancelled.reversalJournalEntryIds).toHaveLength(1);
    const [reversal] = await w.db.select().from(journalEntries).where(eq(journalEntries.id, cancelled.reversalJournalEntryIds[0]!));
    expect(reversal).toMatchObject({ reversesEntryId: posted.journalEntryId, sourceDocId: posted.id });
    const stock = await w.db.select().from(stockMovements).where(eq(stockMovements.sourceDocId, posted.id));
    expect(stock.map((m) => m.qtyX1000).sort()).toEqual([-4000, 4000]);
    expect(stock.find((m) => m.qtyX1000 > 0)?.reversesMovementId).toBe(stock.find((m) => m.qtyX1000 < 0)?.id);
    const [inv] = await w.db.select().from(salesInvoices);
    expect(inv).toMatchObject({ status: 'CANCELLED', cancelReason: 'Wrong customer', cancelledBy: ACTOR.userId });
    // Nothing was deleted: the original entry is still there alongside its reversal.
    const original = await w.db.select().from(journalEntries).where(eq(journalEntries.id, posted.journalEntryId!));
    expect(original).toHaveLength(1);
    expect(w.count('sales_invoices')).toBe(1);
  });

  it('cancelling twice is rejected', async () => {
    const w = await world();
    const posted = await sale(w, 1);
    await w.post((p) => p.cancel('SALES_INVOICE', posted.id, 'dup'));

    await expect(w.post((p) => p.cancel('SALES_INVOICE', posted.id, 'again'))).rejects.toBeInstanceOf(AlreadyCancelledError);
  });

  it('RCM purchase posts both input tax and the RCM liability', async () => {
    const w = await world();

    await w.post((p) =>
      p.postPurchaseInvoice({
        companyId: w.companyId,
        seriesId: w.series.PURCHASE_INVOICE,
        date: '2026-05-01',
        partyId: w.supplierId,
        igstApplicable: true,
        reverseCharge: true,
        supplierInvoiceNo: 'GTA-17',
        supplierInvoiceDate: '2026-05-01',
        lines: [igstLine(w.serviceId, 1, 50_000)],
      }),
    );

    const bal = async (code: Parameters<World['account']>[0]) =>
      (await accountBalance(w.db, { companyId: w.companyId, accountId: await w.account(code), asOf: '2026-05-31' })).balancePaise;
    expect(await bal('INPUT_IGST')).toBe(9_000);
    expect(await bal('RCM_PAYABLE')).toBe(-9_000);
    expect(await bal('PURCHASE')).toBe(50_000);
    expect((await accountBalance(w.db, { companyId: w.companyId, accountId: w.supplierAccountId, asOf: '2026-05-31' })).balancePaise).toBe(-50_000);
  });

  it('receipt / payment modes must match the ledger', async () => {
    const w = await world();
    const cash = await w.account('CASH');
    const receipt = (mode: 'CASH' | 'UPI', cashBankAccountId: string) =>
      w.post((p) =>
        p.postReceipt({
          companyId: w.companyId,
          seriesId: w.series.RECEIPT,
          date: '2026-05-10',
          cashBankAccountId,
          partyId: w.customerId,
          amountPaise: 1_000,
          mode,
        }),
      );

    await expect(receipt('UPI', cash)).rejects.toThrow(/needs a bank ledger/);
    await expect(receipt('CASH', w.bankAccountId)).rejects.toThrow(/needs the Cash ledger/);
    await expect(receipt('UPI', w.bankAccountId)).resolves.toMatchObject({ docNo: 1 });
  });

  it('rejects a series of the wrong type or financial year', async () => {
    const w = await world();

    await expect(sale(w, 1, { seriesId: w.series.RECEIPT })).rejects.toThrow(/is for RECEIPT/);
    await expect(sale(w, 1, { date: '2027-04-01' })).rejects.toThrow(/FY 2027-28/);
  });
});

describe('negative stock policy', () => {
  it('BLOCK raises a typed error before commit and writes nothing', async () => {
    const w = await world({ negativeStockPolicy: 'BLOCK' });
    await stockIn(w, 2);
    const before = snapshotCounts(w);

    const err = await sale(w, 5).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NegativeStockError);
    expect((err as NegativeStockError).shortfalls).toEqual([
      { productId: w.widgetId, availableQtyX1000: 2000, requestedQtyX1000: 5000, resultingQtyX1000: -3000 },
    ]);
    expect(snapshotCounts(w)).toEqual(before);
  });

  it('WARN posts and returns a warning', async () => {
    const w = await world({ negativeStockPolicy: 'WARN' });
    await stockIn(w, 2);

    const posted = await sale(w, 5);

    expect(posted.warnings).toEqual([
      {
        code: 'NEGATIVE_STOCK',
        shortfalls: [{ productId: w.widgetId, availableQtyX1000: 2000, requestedQtyX1000: 5000, resultingQtyX1000: -3000 }],
      },
    ]);
    expect(w.count('sales_invoices')).toBe(1);
  });

  it('ALLOW posts silently', async () => {
    const w = await world({ negativeStockPolicy: 'ALLOW' });

    const posted = await sale(w, 5);

    expect(posted.warnings).toEqual([]);
  });

  it('within available stock, BLOCK does not interfere', async () => {
    const w = await world({ negativeStockPolicy: 'BLOCK' });
    await stockIn(w, 5);

    await expect(sale(w, 5)).resolves.toMatchObject({ warnings: [] });
  });

  it('BLOCK also guards cancellations that would remove stock', async () => {
    const w = await world({ negativeStockPolicy: 'BLOCK' });
    const purchase = await stockIn(w, 5);
    await sale(w, 4);

    await expect(w.post((p) => p.cancel('PURCHASE_INVOICE', purchase.id, 'oops'))).rejects.toBeInstanceOf(NegativeStockError);
  });
});

describe('period lock', () => {
  it('rejects posting and cancelling on or before the lock date', async () => {
    const w = await world();
    const posted = await sale(w, 1);
    await w.client.transaction((tx) => updatePostingSettings(tx, ACTOR, w.companyId, { lockedUntil: '2026-05-10' }));

    await expect(sale(w, 1)).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(w.post((p) => p.cancel('SALES_INVOICE', posted.id, 'late'))).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(sale(w, 1, { date: '2026-05-11' })).resolves.toMatchObject({ docNo: 2 });
  });

  it('rejects dates before the books begin', async () => {
    const w = await world();
    await expect(sale(w, 1, { date: '2026-03-31' })).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it('settings changes are audit-logged', async () => {
    const w = await world();
    await w.client.transaction((tx) =>
      updatePostingSettings(tx, ACTOR, w.companyId, { lockedUntil: '2026-06-30', negativeStockPolicy: 'BLOCK' }),
    );
    const [c] = await w.db.select().from(companies);
    expect(c).toMatchObject({ lockedUntil: '2026-06-30', negativeStockPolicy: 'BLOCK' });
    expect(w.count('audit_logs')).toBe(1);
  });
});
