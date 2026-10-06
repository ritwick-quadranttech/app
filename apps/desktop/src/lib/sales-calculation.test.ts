import { describe, expect, it } from 'vitest';
import { calculateGstLine, calculateGstTotals } from '@repo/gst-engine';
import { calculateSalesPreview } from './sales-calculation';

describe('sales invoice preview', () => {
  it('matches displayed line and grand totals to GST-engine output', () => {
    const line = {
      productId: 'widget',
      qty: '2.5',
      rate: '100.00',
      discountMode: 'PERCENT' as const,
      discount: '5.00',
    };
    const rate = {
      taxCategoryId: 'standard',
      effectiveFrom: '2026-04-01',
      effectiveTo: null,
      cgstBp: 900,
      sgstBp: 900,
      igstBp: 1800,
      cessBp: 100,
      cessPerUnitPaise: 0,
    };
    const preview = calculateSalesPreview({
      lines: [line],
      products: [{ id: 'widget', unitId: 'nos', hsnSac: '8471', taxCategoryId: 'standard' }],
      taxRates: [rate],
      date: '2026-06-18',
      interstate: false,
      roundOff: '-0.04',
    });
    const engineLine = calculateGstLine({
      qtyX1000: 2500,
      ratePaise: 10_000,
      discountPercentBp: 500,
      igstApplicable: false,
      cgstBp: 900,
      sgstBp: 900,
      cessBp: 100,
    });

    expect(preview.rows[0]?.result).toEqual(engineLine);
    expect(preview.rows[0]?.rate).toEqual(rate);
    expect(preview.totals).toEqual(calculateGstTotals([engineLine], -4));
    expect(preview.totals.grandTotalPaise).toBe(28_260);
  });

  it('rejects a dated invoice when a categorized product has no effective GST rate', () => {
    const preview = calculateSalesPreview({
      lines: [
        { productId: 'widget', qty: '1', rate: '10.00', discountMode: 'PERCENT', discount: '0' },
      ],
      products: [{ id: 'widget', unitId: 'nos', hsnSac: '8471', taxCategoryId: 'standard' }],
      taxRates: [],
      date: '2026-06-18',
      interstate: false,
      roundOff: '0',
    });

    expect(preview.rows[0]?.error).toContain('No effective GST rate');
  });
});
