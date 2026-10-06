export const ROLES = ['OWNER', 'ACCOUNTANT', 'SALES', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'COMPANY_MANAGE',
  'USERS_MANAGE',
  'MASTERS_CREATE',
  'MASTERS_UPDATE',
  'MASTERS_DELETE',
  'VOUCHERS_POST',
  'VOUCHERS_CANCEL',
  'REPORTS_VIEW',
  'SETTINGS_MANAGE',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export class PermissionDeniedError extends Error {
  override name = 'PermissionDeniedError';
  constructor(
    readonly role: Role,
    readonly permission: Permission,
  ) {
    super(`Role '${role}' is not authorized to perform '${permission}'.`);
  }
}

/**
 * Role-Based Access Control Permission Matrix:
 * - OWNER: Full control over company, users, settings, and accounting.
 * - ACCOUNTANT: Full access to masters, vouchers, postings, and reports.
 * - SALES: Can create masters (parties/products), post sales/receipts, view reports.
 * - VIEWER: Read-only access to ledger statements and reports.
 */
export const PERMISSION_MATRIX: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  OWNER: new Set(PERMISSIONS),
  ACCOUNTANT: new Set([
    'MASTERS_CREATE',
    'MASTERS_UPDATE',
    'MASTERS_DELETE',
    'VOUCHERS_POST',
    'VOUCHERS_CANCEL',
    'REPORTS_VIEW',
  ]),
  SALES: new Set([
    'MASTERS_CREATE',
    'VOUCHERS_POST',
    'REPORTS_VIEW',
  ]),
  VIEWER: new Set(['REPORTS_VIEW']),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSION_MATRIX[role]?.has(permission) ?? false;
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionDeniedError(role, permission);
  }
}
