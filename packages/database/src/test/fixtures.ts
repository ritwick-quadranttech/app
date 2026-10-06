import { eq } from 'drizzle-orm';
import { createDatabaseClient, type DatabaseClient, type Db } from '../client';
import { betterSqliteExecutor } from '../drivers/better-sqlite3';
import { migrate } from '../migrations/migrate';
import {
  accounts,
  companies,
  numberSeries,
  parties,
  products,
  salesInvoices,
  units,
} from '../schema';
import { seedCompanyDefaults } from '../seed';

export const USER = 'user_test';
export const FY = '2026-27';

export function freshDb() {
  const executor = betterSqliteExecutor(':memory:');
  return { client: createDatabaseClient(executor), sqlite: executor.raw };
}

/** Unwraps drizzle's DrizzleQueryError to the underlying SQLite message. */
export async function sqliteError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    let e: unknown = err;
    while (e instanceof Error && e.cause) e = e.cause;
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('Expected the operation to fail, but it succeeded');
}

export interface World {
  client: DatabaseClient;
  db: Db;
  companyId: string;
  seriesId: string;
  partyId: string;
  productId: string;
  unitId: string;
  cashId: string;
  salesId: string;
}

/** A migrated, seeded database with one company, customer, product and sales series. */
export async function world(): Promise<World & ReturnType<typeof freshDb>> {
  const fresh = freshDb();
  const { client } = fresh;
  const { db } = client;
  await migrate(client);

  const [company] = await db
    .insert(companies)
    .values({
      name: 'Test Traders',
      stateCode: '27',
      booksBeginDate: '2026-04-01',
      createdBy: USER,
    })
    .returning();
  const companyId = company!.id;
  await seedCompanyDefaults(client, { companyId, userId: USER });

  const accountId = async (systemCode: string) =>
    (await db.select().from(accounts).where(eq(accounts.systemCode, systemCode)))[0]!.id;
  const debtorsId = await accountId('SUNDRY_DEBTORS');

  const [partyAccount] = await db
    .insert(accounts)
    .values({
      companyId,
      parentId: debtorsId,
      name: 'Acme Retail',
      nature: 'ASSET',
      createdBy: USER,
    })
    .returning();
  const [party] = await db
    .insert(parties)
    .values({
      companyId,
      accountId: partyAccount!.id,
      partyType: 'CUSTOMER',
      name: 'Acme Retail',
      registrationType: 'REGULAR',
      gstin: '27AAAAA0000A1Z5',
      stateCode: '27',
      createdBy: USER,
    })
    .returning();
  const [unit] = await db.select().from(units).where(eq(units.code, 'NOS'));
  const [product] = await db
    .insert(products)
    .values({ companyId, name: 'Widget', unitId: unit!.id, createdBy: USER })
    .returning();
  const [series] = await db
    .insert(numberSeries)
    .values({
      companyId,
      financialYear: FY,
      docType: 'SALES_INVOICE',
      name: 'Sales',
      prefix: 'INV/',
      padWidth: 4,
      isDefault: true,
      createdBy: USER,
    })
    .returning();

  return {
    ...fresh,
    db,
    companyId,
    seriesId: series!.id,
    partyId: party!.id,
    productId: product!.id,
    unitId: unit!.id,
    cashId: await accountId('CASH'),
    salesId: await accountId('SALES'),
  };
}

/** A valid intra-state sales invoice header: ₹100 taxable + 9% CGST + 9% SGST = ₹118. */
export function invoiceValues(
  w: World,
  overrides: Partial<typeof salesInvoices.$inferInsert> = {},
): typeof salesInvoices.$inferInsert {
  return {
    companyId: w.companyId,
    financialYear: FY,
    seriesId: w.seriesId,
    docNo: 1,
    docNumber: 'INV/0001',
    date: '2026-05-10',
    partyId: w.partyId,
    partyName: 'Acme Retail',
    placeOfSupply: '27',
    igstApplicable: false,
    taxableTotalPaise: 10_000,
    cgstTotalPaise: 900,
    sgstTotalPaise: 900,
    grandTotalPaise: 11_800,
    createdBy: USER,
    ...overrides,
  };
}
