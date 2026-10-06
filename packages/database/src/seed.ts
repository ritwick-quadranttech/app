import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseClient } from './client';
import { accounts, units } from './schema';
import type { AccountNature } from './schema/enums';

export interface DefaultAccount {
  readonly systemCode: string;
  readonly name: string;
  readonly nature: AccountNature;
  /** Groups hold user-created ledgers (parties under debtors/creditors, each bank under Bank). */
  readonly isGroup: boolean;
}

/** Default chart of accounts for an Indian trading business. */
export const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  { systemCode: 'CAPITAL', name: 'Capital', nature: 'EQUITY', isGroup: false },
  { systemCode: 'CASH', name: 'Cash', nature: 'ASSET', isGroup: false },
  { systemCode: 'BANK', name: 'Bank', nature: 'ASSET', isGroup: true },
  { systemCode: 'SUNDRY_DEBTORS', name: 'Sundry Debtors', nature: 'ASSET', isGroup: true },
  { systemCode: 'SUNDRY_CREDITORS', name: 'Sundry Creditors', nature: 'LIABILITY', isGroup: true },
  { systemCode: 'SALES', name: 'Sales', nature: 'INCOME', isGroup: false },
  { systemCode: 'PURCHASE', name: 'Purchase', nature: 'EXPENSE', isGroup: false },
  { systemCode: 'OUTPUT_CGST', name: 'Output CGST', nature: 'LIABILITY', isGroup: false },
  { systemCode: 'OUTPUT_SGST', name: 'Output SGST', nature: 'LIABILITY', isGroup: false },
  { systemCode: 'OUTPUT_IGST', name: 'Output IGST', nature: 'LIABILITY', isGroup: false },
  { systemCode: 'OUTPUT_CESS', name: 'Output Cess', nature: 'LIABILITY', isGroup: false },
  { systemCode: 'INPUT_CGST', name: 'Input CGST', nature: 'ASSET', isGroup: false },
  { systemCode: 'INPUT_SGST', name: 'Input SGST', nature: 'ASSET', isGroup: false },
  { systemCode: 'INPUT_IGST', name: 'Input IGST', nature: 'ASSET', isGroup: false },
  { systemCode: 'INPUT_CESS', name: 'Input Cess', nature: 'ASSET', isGroup: false },
  { systemCode: 'RCM_PAYABLE', name: 'RCM Payable', nature: 'LIABILITY', isGroup: false },
  { systemCode: 'ROUND_OFF', name: 'Round Off', nature: 'EXPENSE', isGroup: false },
  { systemCode: 'DISCOUNT', name: 'Discount', nature: 'EXPENSE', isGroup: false },
  { systemCode: 'STOCK_IN_HAND', name: 'Stock-in-hand', nature: 'ASSET', isGroup: false },
];

export interface DefaultUnit {
  readonly code: string;
  readonly name: string;
  readonly uqc: string;
  readonly decimals: number;
}

export const DEFAULT_UNITS: readonly DefaultUnit[] = [
  { code: 'NOS', name: 'Numbers', uqc: 'NOS', decimals: 0 },
  { code: 'KGS', name: 'Kilograms', uqc: 'KGS', decimals: 3 },
  { code: 'LTR', name: 'Litres', uqc: 'LTR', decimals: 3 },
  { code: 'MTR', name: 'Metres', uqc: 'MTR', decimals: 3 },
  { code: 'BOX', name: 'Box', uqc: 'BOX', decimals: 0 },
  { code: 'PCS', name: 'Pieces', uqc: 'PCS', decimals: 0 },
];

export interface SeedResult {
  readonly accountsCreated: number;
  readonly unitsCreated: number;
}

/**
 * Seeds the default chart of accounts and units for a company, and nothing else.
 * Idempotent: anything already present (by system_code / unit code) is left untouched.
 */
export async function seedCompanyDefaults(
  client: DatabaseClient,
  { companyId, userId }: { companyId: string; userId: string },
): Promise<SeedResult> {
  return client.transaction(async (tx) => {
    const existingAccounts = new Set(
      (
        await tx
          .select({ systemCode: accounts.systemCode })
          .from(accounts)
          .where(eq(accounts.companyId, companyId))
      ).map((r) => r.systemCode),
    );
    const newAccounts = DEFAULT_ACCOUNTS.filter((a) => !existingAccounts.has(a.systemCode));
    if (newAccounts.length > 0) {
      await tx
        .insert(accounts)
        .values(newAccounts.map((a) => ({ ...a, companyId, createdBy: userId })));
    }

    const existingUnits = new Set(
      (
        await tx
          .select({ code: units.code })
          .from(units)
          .where(and(eq(units.companyId, companyId), isNull(units.deletedAt)))
      ).map((r) => r.code),
    );
    const newUnits = DEFAULT_UNITS.filter((u) => !existingUnits.has(u.code));
    if (newUnits.length > 0) {
      await tx.insert(units).values(newUnits.map((u) => ({ ...u, companyId, createdBy: userId })));
    }

    return { accountsCreated: newAccounts.length, unitsCreated: newUnits.length };
  });
}
