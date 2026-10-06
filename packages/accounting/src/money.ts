import Decimal from 'decimal.js';
import { DocumentValidationError } from './errors';

/** Throws unless `value` is a safe integer number of paise (optionally ≥ 0). */
export function assertPaise(value: number, label: string, { allowNegative = false } = {}): void {
  if (!Number.isSafeInteger(value)) {
    throw new DocumentValidationError(`${label} must be an integer number of paise, got ${value}.`);
  }
  if (!allowNegative && value < 0) {
    throw new DocumentValidationError(`${label} cannot be negative, got ${value}.`);
  }
}

export function sumPaise(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  if (!Number.isSafeInteger(total)) throw new RangeError('Paise total exceeds safe integer range');
  return total;
}

/**
 * Value of `qtyX1000` units at `ratePaise` per unit, rounded half-up to the paisa.
 * PROVISIONAL: ADR-001 leaves rounding rules to Phase 1 (gst-engine). Used only for opening stock.
 */
export function lineValuePaise(qtyX1000: number, ratePaise: number): number {
  return new Decimal(qtyX1000)
    .mul(ratePaise)
    .div(1000)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}
