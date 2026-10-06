import {
  calculateGstLine,
  calculateGstTotals,
  type GstLineResult,
  type GstTotals,
} from '@repo/gst-engine';

export interface SalesCalcDraftLine {
  readonly productId: string;
  readonly qty: string;
  readonly rate: string;
  readonly discountMode: 'PERCENT' | 'AMOUNT';
  readonly discount: string;
}

export interface SalesCalcProduct {
  readonly id: string;
  readonly unitId: string;
  readonly hsnSac: string | null;
  readonly taxCategoryId: string | null;
}

export interface SalesCalcRate {
  readonly taxCategoryId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly cgstBp: number;
  readonly sgstBp: number;
  readonly igstBp: number;
  readonly cessBp: number;
  readonly cessPerUnitPaise: number;
}

export function parseInvoicePaise(value: string, signed = false): number {
  const input = value.trim();
  const match = (signed ? /^(-?)(\d+)(?:\.(\d{0,2}))?$/ : /^(\d+)(?:\.(\d{0,2}))?$/).exec(input);
  if (!match) throw new Error('Enter a valid amount with up to two decimal places.');
  const negative = signed && match[1] === '-';
  const whole = signed ? match[2] : match[1];
  if (whole === undefined) throw new Error('Enter a valid amount with up to two decimal places.');
  const rupees = BigInt(whole);
  const fraction = signed ? (match[3] ?? '') : (match[2] ?? '');
  const cents = BigInt(fraction.padEnd(2, '0') || '0');
  const amount = (rupees * 100n + cents) * (negative ? -1n : 1n);
  const result = Number(amount);
  if (!Number.isSafeInteger(result)) throw new Error('Amount exceeds the supported range.');
  return result;
}

export function parseInvoiceQty(value: string): number {
  const match = /^(\d+)(?:\.(\d{0,3}))?$/.exec(value.trim());
  if (!match) throw new Error('Quantity supports up to three decimal places.');
  const whole = match[1];
  if (whole === undefined) throw new Error('Quantity supports up to three decimal places.');
  const result = Number(BigInt(whole) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0') || '0'));
  if (!Number.isSafeInteger(result) || result < 1)
    throw new Error('Quantity must be greater than zero.');
  return result;
}

export function calculateSalesPreview(input: {
  readonly lines: readonly SalesCalcDraftLine[];
  readonly products: readonly SalesCalcProduct[];
  readonly taxRates: readonly SalesCalcRate[];
  readonly date: string;
  readonly interstate: boolean;
  readonly roundOff: string;
}): {
  readonly rows: readonly {
    readonly line: SalesCalcDraftLine;
    readonly product: SalesCalcProduct | undefined;
    readonly rate: SalesCalcRate | undefined;
    readonly result: GstLineResult | null;
    readonly error: string | null;
  }[];
  readonly roundOffPaise: number;
  readonly totals: GstTotals;
  readonly error: string | null;
} {
  let roundOffPaise = 0;
  let error: string | null = null;
  try {
    roundOffPaise = parseInvoicePaise(input.roundOff, true);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const rows = input.lines.map((line) => {
    if (!line.productId) return { line, product: undefined, rate: undefined, result: null, error: null };
    const product = input.products.find((item) => item.id === line.productId);
    if (!product) return { line, product, rate: undefined, result: null, error: 'Product is no longer available.' };
    try {
      const rate = input.taxRates
        .filter(
          (item) =>
            item.taxCategoryId === product.taxCategoryId &&
            item.effectiveFrom <= input.date &&
            (!item.effectiveTo || item.effectiveTo >= input.date),
        )
        .toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      if (product.taxCategoryId && !rate) {
        throw new Error(
          'No effective GST rate is configured for this product on the invoice date.',
        );
      }
      const result = calculateGstLine({
        qtyX1000: parseInvoiceQty(line.qty),
        ratePaise: parseInvoicePaise(line.rate),
        ...(line.discountMode === 'AMOUNT'
          ? { discountPaise: parseInvoicePaise(line.discount) }
          : { discountPercentBp: parseInvoicePaise(line.discount) }),
        igstApplicable: input.interstate,
        cgstBp: input.interstate ? 0 : (rate?.cgstBp ?? 0),
        sgstBp: input.interstate ? 0 : (rate?.sgstBp ?? 0),
        igstBp: input.interstate ? (rate?.igstBp ?? 0) : 0,
        cessBp: rate?.cessBp ?? 0,
        cessPerUnitPaise: rate?.cessPerUnitPaise ?? 0,
      });
      return { line, product, rate, result, error: null };
    } catch (cause) {
      return {
        line,
        product,
        rate: undefined,
        result: null,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });
  const validLines = rows.flatMap((row) => (row.result ? [row.result] : []));
  let totals = calculateGstTotals([], 0);
  try {
    totals = calculateGstTotals(validLines, roundOffPaise);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { rows, roundOffPaise, totals, error };
}
