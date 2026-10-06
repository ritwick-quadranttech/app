import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { allocateDocumentNumber, formatDocNumber, NumberSeriesError } from './numbering';
import { numberSeries, salesInvoices } from './schema';
import { invoiceValues, world } from './test/fixtures';

describe('allocateDocumentNumber()', () => {
  it('allocates sequential, formatted numbers', async () => {
    const w = await world();

    const first = await w.client.transaction((tx) => allocateDocumentNumber(tx, w.seriesId));
    const second = await w.client.transaction((tx) => allocateDocumentNumber(tx, w.seriesId));

    expect(first).toEqual({ docNo: 1, docNumber: 'INV/0001', financialYear: '2026-27' });
    expect(second.docNumber).toBe('INV/0002');
  });

  it('is gap-free: a failed document insert returns its number', async () => {
    const w = await world();

    await expect(
      w.client.transaction(async (tx) => {
        const n = await allocateDocumentNumber(tx, w.seriesId);
        // grand total does not add up → CHECK fails → whole transaction rolls back
        await tx.insert(salesInvoices).values(invoiceValues(w, { ...n, grandTotalPaise: 1 }));
      }),
    ).rejects.toThrow();

    const inserted = await w.client.transaction(async (tx) => {
      const n = await allocateDocumentNumber(tx, w.seriesId);
      const [row] = await tx.insert(salesInvoices).values(invoiceValues(w, n)).returning();
      return row!;
    });
    expect(inserted.docNo).toBe(1);
  });

  it('never hands out the same number to concurrent transactions', async () => {
    const w = await world();

    const numbers = await Promise.all(
      Array.from({ length: 25 }, () =>
        w.client.transaction((tx) => allocateDocumentNumber(tx, w.seriesId)),
      ),
    );

    expect(numbers.map((n) => n.docNo).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
  });

  it('refuses inactive series', async () => {
    const w = await world();
    await w.db.update(numberSeries).set({ isActive: false }).where(eq(numberSeries.id, w.seriesId));

    await expect(
      w.client.transaction((tx) => allocateDocumentNumber(tx, w.seriesId)),
    ).rejects.toBeInstanceOf(NumberSeriesError);
  });

  it('formats prefix, padding and suffix', () => {
    expect(formatDocNumber({ prefix: 'S-', suffix: '/26', padWidth: 3 }, 7)).toBe('S-007/26');
    expect(formatDocNumber({ prefix: '', suffix: '', padWidth: 0 }, 12)).toBe('12');
  });
});
