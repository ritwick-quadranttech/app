import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { AUDIT_ACTIONS, NEGATIVE_STOCK_POLICIES, USER_ROLES } from './enums';
import {
  auditColumns,
  bool,
  inList,
  isFinancialYear,
  isIsoDate,
  isStateCode,
  isoDate,
  pk,
  softDelete,
  timestampMs,
} from './columns';

export const companies = sqliteTable(
  'companies',
  {
    id: pk(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    gstin: text('gstin'),
    pan: text('pan'),
    stateCode: text('state_code').notNull(),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    pincode: text('pincode'),
    phone: text('phone'),
    email: text('email'),
    /** Month (1–12) the financial year starts in. India: April. */
    fyStartMonth: integer('fy_start_month').notNull().default(4),
    booksBeginDate: isoDate('books_begin_date').notNull(),
    einvoiceEnabled: bool('einvoice_enabled').notNull().default(false),
    negativeStockPolicy: text('negative_stock_policy', { enum: NEGATIVE_STOCK_POLICIES })
      .notNull()
      .default('WARN'),
    /** Period lock: nothing dated on or before this can be posted or cancelled. */
    lockedUntil: isoDate('locked_until'),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    check(
      'companies_negative_stock_policy',
      inList(t.negativeStockPolicy, NEGATIVE_STOCK_POLICIES),
    ),
    check('companies_locked_until', sql`${t.lockedUntil} IS NULL OR ${isIsoDate(t.lockedUntil)}`),
    check('companies_state_code', isStateCode(t.stateCode)),
    check('companies_gstin_len', sql`${t.gstin} IS NULL OR length(${t.gstin}) = 15`),
    check('companies_fy_start_month', sql`${t.fyStartMonth} BETWEEN 1 AND 12`),
    check('companies_books_begin_date', isIsoDate(t.booksBeginDate)),
  ],
);

export const financialYears = sqliteTable(
  'financial_years',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    /** e.g. '2026-27' */
    code: text('code').notNull(),
    startDate: isoDate('start_date').notNull(),
    endDate: isoDate('end_date').notNull(),
    isClosed: bool('is_closed').notNull().default(false),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('financial_years_company_code_uq').on(t.companyId, t.code),
    check('financial_years_code', isFinancialYear(t.code)),
    check('financial_years_dates', sql`${t.endDate} > ${t.startDate}`),
  ],
);

export const users = sqliteTable(
  'users',
  {
    id: pk(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull(),
    isActive: bool('is_active').notNull().default(true),
    lastLoginAt: timestampMs('last_login_at'),
    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('users_username_uq')
      .on(t.username)
      .where(sql`${t.deletedAt} IS NULL`),
    check('users_role', inList(t.role, USER_ROLES)),
  ],
);

/** Global key/value settings. `schema_version` is maintained by migrate(). */
export const appSettings = sqliteTable(
  'app_settings',
  {
    id: pk(),
    key: text('key').notNull(),
    /** JSON-encoded value. */
    value: text('value').notNull(),
    ...auditColumns(),
  },
  (t) => [uniqueIndex('app_settings_key_uq').on(t.key)],
);

/** Append-only (enforced by triggers in the append_only_guards migration). */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: pk(),
    companyId: text('company_id').references(() => companies.id),
    /** Who: user id, or 'system'. */
    userId: text('user_id').notNull(),
    /** When. */
    at: timestampMs('at')
      .notNull()
      .$defaultFn(() => new Date()),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    /** Table / aggregate name, e.g. 'sales_invoices'. */
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    ...auditColumns(),
  },
  (t) => [
    index('audit_logs_company_id_idx').on(t.companyId, t.at),
    index('audit_logs_entity_idx').on(t.entity, t.entityId),
    index('audit_logs_user_id_idx').on(t.userId, t.at),
    check('audit_logs_action', inList(t.action, AUDIT_ACTIONS)),
  ],
);
