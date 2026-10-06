import {
  accounts,
  companies,
  type DatabaseClient,
  newId,
  numberSeries,
  seedCompanyDefaults,
} from '@repo/database';
import {
  trialBalance,
  type TrialBalance,
  withPosting,
} from '@repo/accounting';
import { and, eq } from 'drizzle-orm';
import { createTauriDatabaseClient } from './db-client';
import { type CompanyInfo, ipc } from './ipc';
import { type MigrationSummary, runDesktopMigrations } from './migrations';

let clientInstance: DatabaseClient | null = null;

export function getDatabaseClient(): DatabaseClient {
  if (!clientInstance) {
    clientInstance = createTauriDatabaseClient();
  }
  return clientInstance;
}

export interface AppInitState {
  readonly currentCompany: CompanyInfo;
  readonly allCompanies: readonly CompanyInfo[];
  readonly migrationSummary: MigrationSummary;
  readonly trialBalance: TrialBalance;
}

/**
 * Initializes desktop application at startup:
 * 1. Checks or opens last company (creates demo company if registry is empty).
 * 2. Runs embedded migrations (with pre-migration snapshot if pending).
 * 3. Seeds chart of accounts and default number series.
 * 4. Loads initial trial balance.
 */
export async function initDesktopApp(): Promise<AppInitState> {
  let list = await ipc.companyList();

  let activeCompany: CompanyInfo;
  if (list.length === 0) {
    activeCompany = await createCompany('Universal Trading Co.', '27');
    list = await ipc.companyList();
  } else {
    const last = list.find((c) => c.isLastOpened) ?? list[0]!;
    activeCompany = await ipc.companyOpen(last.id);
  }

  const migrationSummary = await runDesktopMigrations();
  const client = getDatabaseClient();

  await ensureCompanySetup(client, activeCompany.id, activeCompany.name);

  const tb = await trialBalance(client.db, {
    companyId: activeCompany.id,
    asOf: '2027-03-31',
  });

  return {
    currentCompany: activeCompany,
    allCompanies: list,
    migrationSummary,
    trialBalance: tb,
  };
}

export async function createCompany(name: string, stateCode = '27'): Promise<CompanyInfo> {
  const company = await ipc.companyCreate(name);
  await runDesktopMigrations();

  const client = getDatabaseClient();
  await ensureCompanySetup(client, company.id, name, stateCode);

  return company;
}

export async function switchCompany(companyId: string): Promise<CompanyInfo> {
  const company = await ipc.companyOpen(companyId);
  await runDesktopMigrations();

  const client = getDatabaseClient();
  await ensureCompanySetup(client, company.id, company.name);

  return company;
}

export async function fetchTrialBalance(companyId: string): Promise<TrialBalance> {
  const client = getDatabaseClient();
  return trialBalance(client.db, {
    companyId,
    asOf: '2027-03-31',
  });
}

/**
 * Posts a test journal voucher through PostingService and returns the updated trial balance.
 * Debits Cash and Credits Capital (or vice versa) for ₹1,000.00 (100,000 paise).
 */
export async function postTestJournal(companyId: string, amountPaise = 100_000): Promise<{
  docNumber: string;
  trialBalance: TrialBalance;
}> {
  const client = getDatabaseClient();

  // Find CASH and CAPITAL accounts
  const accRows = await client.db
    .select({ id: accounts.id, code: accounts.systemCode })
    .from(accounts)
    .where(and(eq(accounts.companyId, companyId), eq(accounts.isGroup, false)));

  const cash = accRows.find((a) => a.code === 'CASH');
  const capital = accRows.find((a) => a.code === 'CAPITAL');

  if (!cash || !capital) {
    throw new Error('Default accounts CASH or CAPITAL missing. Seed company defaults first.');
  }

  // Find default JOURNAL_VOUCHER number series
  const [series] = await client.db
    .select({ id: numberSeries.id })
    .from(numberSeries)
    .where(
      and(
        eq(numberSeries.companyId, companyId),
        eq(numberSeries.docType, 'JOURNAL_VOUCHER'),
        eq(numberSeries.financialYear, '2026-27'),
      ),
    );

  if (!series) {
    throw new Error('Journal voucher series missing for FY 2026-27.');
  }

  const actor = { userId: 'system' };
  const posted = await withPosting(client, actor, async (posting) => {
    return posting.postJournalVoucher({
      companyId,
      seriesId: series.id,
      date: '2026-05-15',
      narration: 'Test Journal Voucher: Infusion of Capital',
      lines: [
        { accountId: cash.id, debitPaise: amountPaise, creditPaise: 0 },
        { accountId: capital.id, debitPaise: 0, creditPaise: amountPaise },
      ],
    });
  });

  const tb = await fetchTrialBalance(companyId);

  return {
    docNumber: posted.docNumber,
    trialBalance: tb,
  };
}

export function formatPaiseToInr(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

async function ensureCompanySetup(
  client: DatabaseClient,
  companyId: string,
  name: string,
  stateCode = '27',
): Promise<void> {
  await client.transaction(async (tx) => {
    // 1. Ensure company row in companies table
    const [existing] = await tx.select().from(companies).where(eq(companies.id, companyId));
    if (!existing) {
      await tx.insert(companies).values({
        id: companyId,
        name,
        stateCode,
        booksBeginDate: '2026-04-01',
        fyStartMonth: 4,
        negativeStockPolicy: 'WARN',
        createdBy: 'system',
      });
    }

    // 2. Seed accounts & units
    await seedCompanyDefaults(client, { companyId, userId: 'system' });

    // 3. Ensure default number series for FY 2026-27
    const defaultSeries = [
      { docType: 'JOURNAL_VOUCHER', prefix: 'JV/', name: 'Journal Voucher' },
      { docType: 'SALES_INVOICE', prefix: 'INV/', name: 'Sales Invoice' },
      { docType: 'PURCHASE_INVOICE', prefix: 'PUR/', name: 'Purchase Invoice' },
      { docType: 'RECEIPT', prefix: 'REC/', name: 'Receipt' },
      { docType: 'PAYMENT', prefix: 'PAY/', name: 'Payment' },
      { docType: 'CONTRA', prefix: 'CNT/', name: 'Contra' },
    ] as const;

    for (const s of defaultSeries) {
      const [found] = await tx
        .select()
        .from(numberSeries)
        .where(
          and(
            eq(numberSeries.companyId, companyId),
            eq(numberSeries.docType, s.docType),
            eq(numberSeries.financialYear, '2026-27'),
          ),
        );
      if (!found) {
        await tx.insert(numberSeries).values({
          id: newId(),
          companyId,
          financialYear: '2026-27',
          docType: s.docType,
          name: s.name,
          prefix: s.prefix,
          nextNo: 1,
          padWidth: 4,
          isDefault: true,
          isActive: true,
          createdBy: 'system',
        });
      }
    }
  });
}
