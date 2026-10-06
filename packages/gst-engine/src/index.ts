export const STATE_CODES: Readonly<Record<string, string>> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const CHAR_SET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Calculates GSTIN Luhn mod-36 checksum character for the first 14 characters.
 */
export function calculateGstinChecksum(first14: string): string {
  let factor = 2;
  let sum = 0;
  const n = CHAR_SET.length;

  for (let i = first14.length - 1; i >= 0; i--) {
    const codePoint = CHAR_SET.indexOf(first14.charAt(i));
    let addend = factor * codePoint;

    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / n) + (addend % n);
    sum += addend;
  }

  const remainder = sum % n;
  const checkCodePoint = (n - remainder) % n;
  return CHAR_SET.charAt(checkCodePoint);
}

export interface GstinValidationResult {
  readonly isValid: boolean;
  readonly stateCode?: string;
  readonly stateName?: string;
  readonly pan?: string;
  readonly error?: string;
}

/**
 * Validates format, state code, and check digit of an Indian GSTIN.
 */
export function validateGstin(rawGstin: string): GstinValidationResult {
  const gstin = rawGstin.trim().toUpperCase();

  if (!gstin) {
    return { isValid: false, error: 'GSTIN cannot be empty' };
  }

  if (gstin.length !== 15) {
    return { isValid: false, error: 'GSTIN must be exactly 15 characters' };
  }

  if (!GSTIN_REGEX.test(gstin)) {
    return { isValid: false, error: 'Invalid GSTIN format pattern' };
  }

  const stateCode = gstin.substring(0, 2);
  const stateName = STATE_CODES[stateCode];
  if (!stateName) {
    return { isValid: false, error: `Invalid state code: ${stateCode}` };
  }

  const pan = gstin.substring(2, 12);
  const expectedCheckDigit = calculateGstinChecksum(gstin.substring(0, 14));
  const actualCheckDigit = gstin.charAt(14);

  if (actualCheckDigit !== expectedCheckDigit) {
    return {
      isValid: false,
      stateCode,
      stateName,
      pan,
      error: `Invalid check digit: expected '${expectedCheckDigit}', found '${actualCheckDigit}'`,
    };
  }

  return {
    isValid: true,
    stateCode,
    stateName,
    pan,
  };
}

export function isValidGstin(gstin: string): boolean {
  return validateGstin(gstin).isValid;
}

export interface GstLineInput {
  readonly qtyX1000: number;
  readonly ratePaise: number;
  readonly discountPaise?: number;
  /** Basis points, where 10000 = 100%. */
  readonly discountPercentBp?: number;
  readonly igstApplicable: boolean;
  readonly cgstBp?: number;
  readonly sgstBp?: number;
  readonly igstBp?: number;
  readonly cessBp?: number;
  readonly cessPerUnitPaise?: number;
}

export interface GstLineResult {
  readonly discountPaise: number;
  readonly taxableValuePaise: number;
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
  readonly cessPaise: number;
  readonly totalPaise: number;
}

export interface GstTotals extends Omit<GstLineResult, 'discountPaise'> {
  readonly roundOffPaise: number;
  readonly grandTotalPaise: number;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function roundRatioHalfUp(numerator: bigint, denominator: bigint): number {
  const rounded = (numerator * 2n + denominator) / (2n * denominator);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new RangeError('GST amount exceeds safe integer range.');
  return result;
}

/** Calculate an invoice line in paise, rounding quantity, discount, and each tax head half-up. */
export function calculateGstLine(input: GstLineInput): GstLineResult {
  for (const [name, value] of Object.entries({
    qtyX1000: input.qtyX1000,
    ratePaise: input.ratePaise,
    discountPaise: input.discountPaise ?? 0,
    discountPercentBp: input.discountPercentBp ?? 0,
    cgstBp: input.cgstBp ?? 0,
    sgstBp: input.sgstBp ?? 0,
    igstBp: input.igstBp ?? 0,
    cessBp: input.cessBp ?? 0,
    cessPerUnitPaise: input.cessPerUnitPaise ?? 0,
  })) {
    assertNonNegativeInteger(value, name);
  }
  if (input.qtyX1000 === 0) throw new RangeError('qtyX1000 must be greater than zero.');
  if ((input.discountPaise ?? 0) > 0 && (input.discountPercentBp ?? 0) > 0) {
    throw new RangeError('Choose either an amount or a percentage discount.');
  }

  const grossPaise = roundRatioHalfUp(BigInt(input.qtyX1000) * BigInt(input.ratePaise), 1000n);
  const discountPaise =
    input.discountPaise ??
    roundRatioHalfUp(BigInt(grossPaise) * BigInt(input.discountPercentBp ?? 0), 10000n);
  if (discountPaise > grossPaise) throw new RangeError('Discount cannot exceed the line value.');
  const taxableValuePaise = grossPaise - discountPaise;
  const cgstPaise = input.igstApplicable
    ? 0
    : roundRatioHalfUp(BigInt(taxableValuePaise) * BigInt(input.cgstBp ?? 0), 10000n);
  const sgstPaise = input.igstApplicable
    ? 0
    : roundRatioHalfUp(BigInt(taxableValuePaise) * BigInt(input.sgstBp ?? 0), 10000n);
  const igstPaise = input.igstApplicable
    ? roundRatioHalfUp(BigInt(taxableValuePaise) * BigInt(input.igstBp ?? 0), 10000n)
    : 0;
  const cessPaise =
    roundRatioHalfUp(BigInt(taxableValuePaise) * BigInt(input.cessBp ?? 0), 10000n) +
    roundRatioHalfUp(BigInt(input.qtyX1000) * BigInt(input.cessPerUnitPaise ?? 0), 1000n);
  const totalPaise = taxableValuePaise + cgstPaise + sgstPaise + igstPaise + cessPaise;

  return {
    discountPaise,
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    cessPaise,
    totalPaise,
  };
}

/** Sum already-calculated line values and apply an optional signed invoice round-off. */
export function calculateGstTotals(lines: readonly GstLineResult[], roundOffPaise = 0): GstTotals {
  assertNonNegativeInteger(roundOffPaise < 0 ? -roundOffPaise : roundOffPaise, 'roundOffPaise');
  const sum = (pick: (line: GstLineResult) => number) => {
    const total = lines.reduce((value, line) => value + pick(line), 0);
    if (!Number.isSafeInteger(total)) throw new RangeError('GST total exceeds safe integer range.');
    return total;
  };
  const taxableValuePaise = sum((line) => line.taxableValuePaise);
  const cgstPaise = sum((line) => line.cgstPaise);
  const sgstPaise = sum((line) => line.sgstPaise);
  const igstPaise = sum((line) => line.igstPaise);
  const cessPaise = sum((line) => line.cessPaise);
  const totalPaise = taxableValuePaise + cgstPaise + sgstPaise + igstPaise + cessPaise;
  const grandTotalPaise = totalPaise + roundOffPaise;
  if (!Number.isSafeInteger(grandTotalPaise) || grandTotalPaise < 0) {
    throw new RangeError('Grand total must be a non-negative safe integer.');
  }
  return {
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    cessPaise,
    totalPaise,
    roundOffPaise,
    grandTotalPaise,
  };
}
