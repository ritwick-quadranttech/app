import { z } from 'zod';

export const GstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PanPattern = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const StateCodePattern = /^[0-9]{2}$/;
export const IsoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
export const FinancialYearPattern = /^\d{4}-\d{2}$/;

// ------------------- Company Setup -------------------
export const CompanySetupSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  legalName: z.string().optional(),
  gstin: z
    .string()
    .regex(GstinPattern, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  stateCode: z.string().regex(StateCodePattern, 'State code must be 2 digits'),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().or(z.literal('')),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  fyStartMonth: z.number().int().min(1).max(12).default(4),
  booksBeginDate: z.string().regex(IsoDatePattern, 'Books begin date must be YYYY-MM-DD'),
  invoicePrefix: z.string().min(1).default('INV/'),
  logoBase64: z.string().optional(),
});
export type CompanySetupInput = z.infer<typeof CompanySetupSchema>;

// ------------------- Parties (Customers & Suppliers) -------------------
export const PartyTypeSchema = z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']);
export const GstRegistrationTypeSchema = z.enum([
  'REGULAR',
  'COMPOSITION',
  'UNREGISTERED',
  'CONSUMER',
  'SEZ',
  'OVERSEAS',
  'DEEMED_EXPORT',
]);

export const PartySchema = z.object({
  name: z.string().min(2, 'Party name must be at least 2 characters'),
  partyType: PartyTypeSchema,
  gstin: z
    .string()
    .regex(GstinPattern, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  pan: z
    .string()
    .regex(PanPattern, 'Invalid PAN format')
    .optional()
    .or(z.literal('')),
  registrationType: GstRegistrationTypeSchema.default('UNREGISTERED'),
  stateCode: z.string().regex(StateCodePattern, 'State code must be 2 digits').optional(),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().or(z.literal('')),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  creditDays: z.number().int().min(0).default(0),
  creditLimitPaise: z.number().int().min(0).default(0),
  openingBalancePaise: z.number().int().default(0), // Positive: Dr, Negative: Cr
});
export type PartyInput = z.infer<typeof PartySchema>;

export const CustomerSchema = PartySchema.extend({
  partyType: z.literal('CUSTOMER').default('CUSTOMER'),
});
export type CustomerInput = z.infer<typeof CustomerSchema>;

export const SupplierSchema = PartySchema.extend({
  partyType: z.literal('SUPPLIER').default('SUPPLIER'),
});
export type SupplierInput = z.infer<typeof SupplierSchema>;

// ------------------- Products & Services -------------------
export const ProductSchema = z.object({
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  sku: z.string().optional(),
  description: z.string().optional(),
  hsnSac: z.string().min(2).max(8, 'HSN/SAC must be between 2 and 8 digits').optional(),
  isService: z.boolean().default(false),
  unitId: z.string().min(1, 'Unit is required'),
  taxCategoryId: z.string().optional(),
  saleRatePaise: z.number().int().min(0).default(0),
  purchaseRatePaise: z.number().int().min(0).default(0),
  mrpPaise: z.number().int().min(0).default(0),
  isTaxInclusive: z.boolean().default(false),
  trackInventory: z.boolean().default(true),
  // Opening stock fields for automatic initial OPENING stock movement
  openingStockQtyX1000: z.number().int().min(0).default(0),
  openingStockRatePaise: z.number().int().min(0).default(0),
});
export type ProductInput = z.infer<typeof ProductSchema>;

// ------------------- Units -------------------
export const UnitSchema = z.object({
  code: z.string().min(1).max(10, 'Unit code must be 1-10 characters'),
  name: z.string().min(1, 'Unit name is required'),
  uqc: z.string().min(3).max(3, 'UQC must be a 3-letter GST code'),
  decimals: z.number().int().min(0).max(3).default(0),
});
export type UnitInput = z.infer<typeof UnitSchema>;

// ------------------- Categories -------------------
export const TaxCategorySchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
});
export type TaxCategoryInput = z.infer<typeof TaxCategorySchema>;

// ------------------- Tax Rates (Effective-dated) -------------------
export const TaxRateSchema = z.object({
  taxCategoryId: z.string().min(1, 'Tax category is required'),
  effectiveFrom: z.string().regex(IsoDatePattern, 'Effective from must be YYYY-MM-DD'),
  effectiveTo: z.string().regex(IsoDatePattern, 'Effective to must be YYYY-MM-DD').optional().nullable(),
  igstBp: z.number().int().min(0, 'IGST basis points must be non-negative'),
  cgstBp: z.number().int().min(0, 'CGST basis points must be non-negative'),
  sgstBp: z.number().int().min(0, 'SGST basis points must be non-negative'),
  cessBp: z.number().int().min(0).default(0),
  cessPerUnitPaise: z.number().int().min(0).default(0),
}).refine((data) => data.cgstBp === data.sgstBp, {
  message: 'CGST and SGST must be equal for intra-state GST splits',
  path: ['sgstBp'],
}).refine((data) => data.igstBp === data.cgstBp + data.sgstBp, {
  message: 'IGST must equal CGST + SGST',
  path: ['igstBp'],
});
export type TaxRateInput = z.infer<typeof TaxRateSchema>;

// ------------------- HSN/SAC Master -------------------
export const HsnSacSchema = z.object({
  code: z.string().min(2).max(8, 'HSN/SAC must be 2 to 8 characters'),
  description: z.string().min(2, 'Description is required'),
  isService: z.boolean().default(false),
  defaultGstRateBp: z.number().int().min(0).default(1800), // e.g. 1800 bp = 18%
});
export type HsnSacInput = z.infer<typeof HsnSacSchema>;

// ------------------- Local Users & Roles -------------------
export const UserRoleSchema = z.enum(['OWNER', 'ACCOUNTANT', 'SALES', 'VIEWER']);

export const UserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: UserRoleSchema,
});
export type UserInput = z.infer<typeof UserSchema>;

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;
