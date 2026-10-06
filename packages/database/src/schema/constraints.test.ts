import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { allocateDocumentNumber } from '../numbering';
import { invoiceValues, sqliteError, USER, world, FY } from '../test/fixtures';
import {
  auditLogs,
  journalEntries,
  ledgerEntries,
  numberSeries,
  productStock,
  salesInvoices,
  stockMovements,
} from './index';

async function postedEntry(w: Awaited<ReturnType<typeof world>>) {
  const [je] = await w.db
    .insert(journalEntries)
    .values({
      companyId: w.companyId,
      financialYear: FY,
      date: '2026-05-10',
      voucherType: 'SALES',
      sourceDocType: 'SALES_INVOICE',
      sourceDocId: 'doc_1',
      createdBy: USER,
    })
    .returning();
  return je!.id;
}

const line = (
  w: Awaited<ReturnType<typeof world>>,
  journalEntryId: string,
  lineNo: number,
  debitPaise: number,
  creditPaise: number,
) => ({
  companyId: w.companyId,
  financialYear: FY,
  journalEntryId,
  lineNo,
  date: '2026-05-10',
  accountId: w.cashId,
  debitPaise,
  creditPaise,
  createdBy: USER,
});

describe('ledger_entries', () => {
  it('accepts a debit-only or credit-only line', async () => {
    const w = await world();
    const je = await postedEntry(w);

    await w.db.insert(ledgerEntries).values([line(w, je, 1, 500, 0), line(w, je, 2, 0, 500)]);

    expect(await w.db.select().from(ledgerEntries)).toHaveLength(2);
  });

  it('rejects a line with both debit and credit', async () => {
    const w = await world();
    const je = await postedEntry(w);

    expect(await sqliteError(w.db.insert(ledgerEntries).values(line(w, je, 1, 500, 500)))).toMatch(
      /CHECK constraint failed: ledger_entries_one_side/,
    );
  });

  it('rejects an empty line and negative amounts', async () => {
    const w = await world();
    const je = await postedEntry(w);

    expect(await sqliteError(w.db.insert(ledgerEntries).values(line(w, je, 1, 0, 0)))).toMatch(
      /ledger_entries_one_side/,
    );
    expect(await sqliteError(w.db.insert(ledgerEntries).values(line(w, je, 1, -5, 0)))).toMatch(
      /ledger_entries_non_negative/,
    );
  });

  it('is append-only', async () => {
    const w = await world();
    const je = await postedEntry(w);
    await w.db.insert(ledgerEntries).values(line(w, je, 1, 500, 0));

    expect(await sqliteError(w.db.update(ledgerEntries).set({ debitPaise: 1 }))).toMatch(
      /append-only/,
    );
    expect(await sqliteError(w.db.delete(ledgerEntries))).toMatch(/append-only/);
    expect(await sqliteError(w.db.delete(journalEntries))).toMatch(/append-only/);
  });
});

describe('sales_invoices numbering', () => {
  it('rejects a duplicate invoice number in the same series and FY', async () => {
    const w = await world();
    await w.db.insert(salesInvoices).values(invoiceValues(w));

    expect(
      await sqliteError(
        w.db.insert(salesInvoices).values(invoiceValues(w, { docNumber: 'INV/0001-dup' })),
      ),
    ).toMatch(
      /UNIQUE constraint failed: sales_invoices.series_id, sales_invoices.financial_year, sales_invoices.doc_no/,
    );
  });

  it('rejects the same printed number twice in a FY, even from another series', async () => {
    const w = await world();
    const [other] = await w.db
      .insert(numberSeries)
      .values({
        companyId: w.companyId,
        financialYear: FY,
        docType: 'SALES_INVOICE',
        name: 'Other',
        prefix: 'INV/0',
        createdBy: USER,
      })
      .returning();
    await w.db.insert(salesInvoices).values(invoiceValues(w));

    expect(
      await sqliteError(
        w.db.insert(salesInvoices).values(invoiceValues(w, { seriesId: other!.id })),
      ),
    ).toMatch(/UNIQUE constraint failed: .*doc_number/);
  });

  it('allows the same number in a different financial year', async () => {
    const w = await world();
    const [nextFy] = await w.db
      .insert(numberSeries)
      .values({
        companyId: w.companyId,
        financialYear: '2027-28',
        docType: 'SALES_INVOICE',
        name: 'Sales',
        prefix: 'INV/',
        padWidth: 4,
        createdBy: USER,
      })
      .returning();
    await w.db.insert(salesInvoices).values(invoiceValues(w));

    await w.db
      .insert(salesInvoices)
      .values(
        invoiceValues(w, { seriesId: nextFy!.id, financialYear: '2027-28', date: '2027-05-10' }),
      );

    expect(await w.db.select().from(salesInvoices)).toHaveLength(2);
  });

  it('series next_no cannot move backwards', async () => {
    const w = await world();
    await w.client.transaction((tx) => allocateDocumentNumber(tx, w.seriesId));

    expect(
      await sqliteError(
        w.db.update(numberSeries).set({ nextNo: 1 }).where(eq(numberSeries.id, w.seriesId)),
      ),
    ).toMatch(/cannot move backwards/);
  });
});

describe('financial documents', () => {
  it('cannot be deleted', async () => {
    const w = await world();
    await w.db.insert(salesInvoices).values(invoiceValues(w));

    expect(await sqliteError(w.db.delete(salesInvoices))).toMatch(/cannot be deleted/);
  });

  it('can only be cancelled with a reason, and cancellation is final', async () => {
    const w = await world();
    const [inv] = await w.db.insert(salesInvoices).values(invoiceValues(w)).returning();
    const byId = eq(salesInvoices.id, inv!.id);

    expect(
      await sqliteError(w.db.update(salesInvoices).set({ status: 'CANCELLED' }).where(byId)),
    ).toMatch(/sales_invoices_cancellation/);

    await w.db
      .update(salesInvoices)
      .set({
        status: 'CANCELLED',
        cancelReason: 'Wrong party',
        cancelledAt: new Date(),
        cancelledBy: USER,
      })
      .where(byId);

    expect(
      await sqliteError(w.db.update(salesInvoices).set({ status: 'POSTED' }).where(byId)),
    ).toMatch(/cancelled document cannot be modified/);
  });

  it('totals must add up and respect the IGST / CGST+SGST split', async () => {
    const w = await world();

    expect(
      await sqliteError(
        w.db.insert(salesInvoices).values(invoiceValues(w, { grandTotalPaise: 11_799 })),
      ),
    ).toMatch(/sales_invoices_grand_total/);
    expect(
      await sqliteError(
        w.db.insert(salesInvoices).values(
          invoiceValues(w, {
            igstApplicable: true,
            igstTotalPaise: 1800,
            grandTotalPaise: 13_600,
          }),
        ),
      ),
    ).toMatch(/sales_invoices_tax_regime/);
  });
});

describe('stock_movements', () => {
  const movement = (
    w: Awaited<ReturnType<typeof world>>,
    v: Partial<typeof stockMovements.$inferInsert>,
  ): typeof stockMovements.$inferInsert => ({
    companyId: w.companyId,
    financialYear: FY,
    date: '2026-05-10',
    productId: w.productId,
    movementType: 'PURCHASE',
    qtyX1000: 10_000,
    ratePaise: 5_000,
    sourceDocType: 'PURCHASE_INVOICE',
    sourceDocId: 'doc_1',
    createdBy: USER,
    ...v,
  });

  it('enforces the sign of each movement type, flipped for reversals', async () => {
    const w = await world();
    const [purchase] = await w.db.insert(stockMovements).values(movement(w, {})).returning();
    await w.db
      .insert(stockMovements)
      .values(
        movement(w, { movementType: 'SALE', qtyX1000: -3_000, sourceDocType: 'SALES_INVOICE' }),
      );

    expect(
      await sqliteError(w.db.insert(stockMovements).values(movement(w, { qtyX1000: -1 }))),
    ).toMatch(/stock_movements_sign/);

    // Cancelling the purchase posts an opposite-signed reversal.
    await w.db
      .insert(stockMovements)
      .values(movement(w, { qtyX1000: -10_000, reversesMovementId: purchase!.id }));

    const [stock] = await w.db.select().from(productStock);
    expect(stock).toEqual({ companyId: w.companyId, productId: w.productId, qtyX1000: -3_000 });
  });

  it('is append-only', async () => {
    const w = await world();
    await w.db.insert(stockMovements).values(movement(w, {}));

    expect(await sqliteError(w.db.update(stockMovements).set({ qtyX1000: 1 }))).toMatch(
      /append-only/,
    );
  });
});

describe('audit_logs', () => {
  it('is append-only', async () => {
    const w = await world();
    await w.db.insert(auditLogs).values({
      userId: USER,
      action: 'CREATE',
      entity: 'sales_invoices',
      entityId: 'x',
      afterJson: '{}',
      createdBy: USER,
    });

    expect(await sqliteError(w.db.update(auditLogs).set({ entityId: 'y' }))).toMatch(/append-only/);
    expect(await sqliteError(w.db.delete(auditLogs))).toMatch(/append-only/);
  });
});
