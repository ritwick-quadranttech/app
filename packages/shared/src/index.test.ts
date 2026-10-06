import { describe, expect, it } from 'vitest';
import {
  assertPermission,
  hasPermission,
  PermissionDeniedError,
  type Role,
} from './index';

describe('RBAC Permission Matrix', () => {
  it('OWNER has all permissions', () => {
    expect(hasPermission('OWNER', 'COMPANY_MANAGE')).toBe(true);
    expect(hasPermission('OWNER', 'USERS_MANAGE')).toBe(true);
    expect(hasPermission('OWNER', 'VOUCHERS_CANCEL')).toBe(true);
    expect(() => assertPermission('OWNER', 'SETTINGS_MANAGE')).not.toThrow();
  });

  it('ACCOUNTANT has accounting permissions but not company/user management', () => {
    expect(hasPermission('ACCOUNTANT', 'MASTERS_CREATE')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'VOUCHERS_POST')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'VOUCHERS_CANCEL')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'USERS_MANAGE')).toBe(false);
    expect(hasPermission('ACCOUNTANT', 'COMPANY_MANAGE')).toBe(false);
    expect(() => assertPermission('ACCOUNTANT', 'USERS_MANAGE')).toThrow(PermissionDeniedError);
  });

  it('SALES can create parties/products and post vouchers, but cannot cancel or delete', () => {
    expect(hasPermission('SALES', 'MASTERS_CREATE')).toBe(true);
    expect(hasPermission('SALES', 'VOUCHERS_POST')).toBe(true);
    expect(hasPermission('SALES', 'VOUCHERS_CANCEL')).toBe(false);
    expect(hasPermission('SALES', 'MASTERS_DELETE')).toBe(false);
  });

  it('VIEWER can only view reports', () => {
    expect(hasPermission('VIEWER', 'REPORTS_VIEW')).toBe(true);
    expect(hasPermission('VIEWER', 'VOUCHERS_POST')).toBe(false);
    expect(hasPermission('VIEWER', 'MASTERS_CREATE')).toBe(false);
  });
});
