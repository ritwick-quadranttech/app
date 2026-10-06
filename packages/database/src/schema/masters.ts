import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { ACCOUNT_NATURES, GST_REGISTRATION_TYPES, PARTY_TYPES } from './enums';
import {
  auditColumns,
  basisPoints,
  bool,
  inList,
  isIsoDate,
  isStateCode,
  isoDate,
  paise,
  pk,
  softDelete,
} from './columns';
import { companies } from './core';

const notDeleted = (deletedAt: AnySQLiteColumn) => sql`${deletedAt} IS NULL`;

/**
 * Chart of accounts. Groups (is_group = 1) hold ledgers or other groups; only ledgers are posted to.
 * `system_code` identifies accounts the engine posts to automatically (e.g. OUTPUT_CGST).
 */
export const accounts = sqliteTable(
  'accounts',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    parentId: text('parent_id').references((): AnySQLiteColumn => accounts.id),
    code: text('code'),
    name: text('name').notNull(),
    nature: text('nature', { enum: ACCOUNT_NATURES }).notNull(),
    isGroup: bool('is_group').notNull().default(false),
    systemCode: text('system_code'),
    isActive: bool('is_active').notNull().default(true),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('accounts_company_id_idx').on(t.companyId),
    index('accounts_parent_id_idx').on(t.parentId),
    uniqueIndex('accounts_company_name_uq').on(t.companyId, t.name).where(notDeleted(t.deletedAt)),
    uniqueIndex('accounts_company_system_code_uq')
      .on(t.companyId, t.systemCode)
      .where(sql`${t.systemCode} IS NOT NULL`),
    check('accounts_nature', inList(t.nature, ACCOUNT_NATURES)),
    check('accounts_not_own_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
);

/** Customers and suppliers. Each party owns exactly one ledger account. */
export const parties = sqliteTable(
  'parties',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    partyType: text('party_type', { enum: PARTY_TYPES }).notNull(),
    name: text('name').notNull(),
    gstin: text('gstin'),
    pan: text('pan'),
    registrationType: text('registration_type', { enum: GST_REGISTRATION_TYPES }).notNull(),
    stateCode: text('state_code'),
    billingAddress: text('billing_address'),
    shippingAddress: text('shipping_address'),
    city: text('city'),
    pincode: text('pincode'),
    phone: text('phone'),
    email: text('email'),
    creditDays: integer('credit_days'),
    creditLimitPaise: paise('credit_limit_paise'),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('parties_company_id_idx').on(t.companyId),
    uniqueIndex('parties_account_id_uq').on(t.accountId),
    index('parties_company_name_idx').on(t.companyId, t.name),
    index('parties_company_gstin_idx').on(t.companyId, t.gstin),
    check('parties_party_type', inList(t.partyType, PARTY_TYPES)),
    check('parties_registration_type', inList(t.registrationType, GST_REGISTRATION_TYPES)),
    check('parties_gstin_len', sql`${t.gstin} IS NULL OR length(${t.gstin}) = 15`),
    check('parties_state_code', sql`${t.stateCode} IS NULL OR ${isStateCode(t.stateCode)}`),
    check('parties_credit_days', sql`${t.creditDays} IS NULL OR ${t.creditDays} >= 0`),
    check('parties_credit_limit', sql`${t.creditLimitPaise} IS NULL OR ${t.creditLimitPaise} >= 0`),
  ],
);

export const units = sqliteTable(
  'units',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** GST Unit Quantity Code. */
    uqc: text('uqc').notNull(),
    /** Decimal places allowed in quantities (max 3, since qty is stored × 1000). */
    decimals: integer('decimals').notNull().default(0),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('units_company_id_idx').on(t.companyId),
    uniqueIndex('units_company_code_uq').on(t.companyId, t.code).where(notDeleted(t.deletedAt)),
    check('units_decimals', sql`${t.decimals} BETWEEN 0 AND 3`),
  ],
);

/** A named GST slab (e.g. 'GST 18%') whose rates are versioned in tax_rates. */
export const taxCategories = sqliteTable(
  'tax_categories',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('tax_categories_company_id_idx').on(t.companyId),
    uniqueIndex('tax_categories_company_code_uq')
      .on(t.companyId, t.code)
      .where(notDeleted(t.deletedAt)),
  ],
);

/**
 * Effective-dated rates for a tax category. `effective_to` is inclusive; NULL means open-ended.
 * Non-overlap of ranges per category is enforced by the GST engine, not the schema.
 */
export const taxRates = sqliteTable(
  'tax_rates',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    taxCategoryId: text('tax_category_id')
      .notNull()
      .references(() => taxCategories.id),
    effectiveFrom: isoDate('effective_from').notNull(),
    effectiveTo: isoDate('effective_to'),
    igstBp: basisPoints('igst_bp').notNull(),
    cgstBp: basisPoints('cgst_bp').notNull(),
    sgstBp: basisPoints('sgst_bp').notNull(),
    cessBp: basisPoints('cess_bp').notNull().default(0),
    /** Specific cess per unit (some goods carry an amount-per-unit cess). */
    cessPerUnitPaise: paise('cess_per_unit_paise').notNull().default(0),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('tax_rates_company_id_idx').on(t.companyId),
    uniqueIndex('tax_rates_category_from_uq')
      .on(t.taxCategoryId, t.effectiveFrom)
      .where(notDeleted(t.deletedAt)),
    check('tax_rates_effective_from', isIsoDate(t.effectiveFrom)),
    check(
      'tax_rates_effective_range',
      sql`${t.effectiveTo} IS NULL OR (${isIsoDate(t.effectiveTo)} AND ${t.effectiveTo} >= ${t.effectiveFrom})`,
    ),
    check(
      'tax_rates_non_negative',
      sql`${t.igstBp} >= 0 AND ${t.cgstBp} >= 0 AND ${t.sgstBp} >= 0 AND ${t.cessBp} >= 0 AND ${t.cessPerUnitPaise} >= 0`,
    ),
    check(
      'tax_rates_split',
      sql`${t.cgstBp} = ${t.sgstBp} AND ${t.igstBp} = ${t.cgstBp} + ${t.sgstBp}`,
    ),
  ],
);

/** Products and services. There is deliberately no stock column: see the product_stock view. */
export const products = sqliteTable(
  'products',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    sku: text('sku'),
    description: text('description'),
    hsnSac: text('hsn_sac'),
    isService: bool('is_service').notNull().default(false),
    unitId: text('unit_id')
      .notNull()
      .references(() => units.id),
    taxCategoryId: text('tax_category_id').references(() => taxCategories.id),
    saleRatePaise: paise('sale_rate_paise'),
    purchaseRatePaise: paise('purchase_rate_paise'),
    mrpPaise: paise('mrp_paise'),
    trackInventory: bool('track_inventory').notNull().default(true),
    isActive: bool('is_active').notNull().default(true),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('products_company_id_idx').on(t.companyId),
    index('products_unit_id_idx').on(t.unitId),
    index('products_tax_category_id_idx').on(t.taxCategoryId),
    uniqueIndex('products_company_name_uq').on(t.companyId, t.name).where(notDeleted(t.deletedAt)),
    uniqueIndex('products_company_sku_uq')
      .on(t.companyId, t.sku)
      .where(sql`${t.sku} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    check(
      'products_rates_non_negative',
      sql`coalesce(${t.saleRatePaise}, 0) >= 0 AND coalesce(${t.purchaseRatePaise}, 0) >= 0 AND coalesce(${t.mrpPaise}, 0) >= 0`,
    ),
    check('products_service_no_stock', sql`NOT (${t.isService} = 1 AND ${t.trackInventory} = 1)`),
  ],
);
