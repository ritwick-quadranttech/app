import { describe, expect, it } from 'vitest';
import {
  calculateGstinChecksum,
  calculateGstLine,
  calculateGstTotals,
  isValidGstin,
  validateGstin,
} from './index';

describe('GSTIN Validator', () => {
  it('validates a correct GSTIN', () => {
    // 27AAPFU0939F1ZV -> 27 (Maharashtra), AAPFU0939F (PAN), 1 (entity), Z, V (checksum)
    const valid = '27AAPFU0939F1ZV';
    const result = validateGstin(valid);
    expect(result.isValid).toBe(true);
    expect(result.stateCode).toBe('27');
    expect(result.stateName).toBe('Maharashtra');
    expect(result.pan).toBe('AAPFU0939F');
    expect(isValidGstin(valid)).toBe(true);
  });

  it('rejects invalid lengths and malformed patterns', () => {
    expect(validateGstin('').isValid).toBe(false);
    expect(validateGstin('123').isValid).toBe(false);
    expect(validateGstin('27AAPFU0939F1Z').isValid).toBe(false); // 14 chars
    expect(validateGstin('99AAPFU0939F1ZV').isValid).toBe(false); // invalid state 99
  });

  it('rejects invalid checksum character', () => {
    const invalidCheck = '27AAPFU0939F1Z0';
    const result = validateGstin(invalidCheck);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid check digit');
  });

  it('calculates expected Luhn mod-36 checksum', () => {
    const check = calculateGstinChecksum('27AAPFU0939F1Z');
    expect(check).toBe('V');
  });
});

describe('GST calculations', () => {
  it('calculates an intrastate discounted line and its totals in paise', () => {
    const line = calculateGstLine({
      qtyX1000: 2500,
      ratePaise: 10_000,
      discountPercentBp: 500,
      igstApplicable: false,
      cgstBp: 900,
      sgstBp: 900,
      cessBp: 100,
    });

    expect(line).toEqual({
      discountPaise: 1_250,
      taxableValuePaise: 23_750,
      cgstPaise: 2_138,
      sgstPaise: 2_138,
      igstPaise: 0,
      cessPaise: 238,
      totalPaise: 28_264,
    });
    expect(calculateGstTotals([line], -4)).toMatchObject({
      taxableValuePaise: 23_750,
      cgstPaise: 2_138,
      sgstPaise: 2_138,
      grandTotalPaise: 28_260,
    });
  });

  it('uses IGST and specific cess for an inter-state line', () => {
    expect(
      calculateGstLine({
        qtyX1000: 1500,
        ratePaise: 1_000,
        discountPaise: 100,
        igstApplicable: true,
        igstBp: 1800,
        cessPerUnitPaise: 50,
      }),
    ).toMatchObject({
      discountPaise: 100,
      taxableValuePaise: 1_400,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 252,
      cessPaise: 75,
      totalPaise: 1_727,
    });
  });

  it('rejects conflicting discounts and discounts above the line value', () => {
    expect(() =>
      calculateGstLine({
        qtyX1000: 1000,
        ratePaise: 100,
        discountPaise: 1,
        discountPercentBp: 100,
        igstApplicable: false,
      }),
    ).toThrow('Choose either');
    expect(() =>
      calculateGstLine({
        qtyX1000: 1000,
        ratePaise: 100,
        discountPaise: 101,
        igstApplicable: false,
      }),
    ).toThrow('Discount cannot exceed');
  });
});
