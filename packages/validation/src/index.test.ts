import { describe, expect, it } from 'vitest';
import {
  CompanySetupSchema,
  CustomerSchema,
  ProductSchema,
  TaxRateSchema,
  UnitSchema,
  UserSchema,
} from './index';

describe('Validation Schemas', () => {
  it('validates customer input', () => {
    const validCustomer = {
      name: 'Aditi Enterprises',
      partyType: 'CUSTOMER',
      stateCode: '27',
      creditLimitPaise: 5000000,
      openingBalancePaise: 120000,
    };
    expect(CustomerSchema.safeParse(validCustomer).success).toBe(true);
  });

  it('rejects product with invalid rate or empty name', () => {
    const invalidProduct = {
      name: 'A', // too short
      unitId: '',
      saleRatePaise: -100, // negative
    };
    expect(ProductSchema.safeParse(invalidProduct).success).toBe(false);
  });

  it('enforces GST tax split in tax rate schema', () => {
    const validRate = {
      taxCategoryId: 'cat_1',
      effectiveFrom: '2026-04-01',
      igstBp: 1800,
      cgstBp: 900,
      sgstBp: 900,
    };
    expect(TaxRateSchema.safeParse(validRate).success).toBe(true);

    const mismatchedSplit = {
      taxCategoryId: 'cat_1',
      effectiveFrom: '2026-04-01',
      igstBp: 1800,
      cgstBp: 900,
      sgstBp: 800, // CGST !== SGST
    };
    expect(TaxRateSchema.safeParse(mismatchedSplit).success).toBe(false);
  });

  it('validates user schema and password minimum length', () => {
    const validUser = {
      username: 'admin',
      displayName: 'Administrator',
      password: 'password123',
      role: 'OWNER',
    };
    expect(UserSchema.safeParse(validUser).success).toBe(true);

    const shortPassword = {
      username: 'admin',
      displayName: 'Administrator',
      password: '123',
      role: 'OWNER',
    };
    expect(UserSchema.safeParse(shortPassword).success).toBe(false);
  });
});
