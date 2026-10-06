import {
  accounts,
  companies,
  createDatabaseClient,
  type DatabaseClient,
  type Db,
  migrate,
  NUMBERED_DOC_TYPES,
  type NumberedDocType,
  numberSeries,
  parties,
  products,
  seedCompanyDefaults,
  units,
} from '@repo/database';
import { betterSqliteExecutor } from '@repo/database/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { PostingService, type Actor } from '../posting/service';
import type { TradeLineInput } from '../posting/inputs';
import type { SystemAccountCode } from '../rules/types';

export const ACTOR: Actor = { userId: 'user_test' };
export const FY = '2026-27';

export interface World {
  client: DatabaseClient;
  db: Db;
  sqlite: ReturnType<typeof betterSqliteExecutor>['raw'];
  companyId: string;
  series: Record<NumberedDocType, string>;
  customerId: string;
  supplierId: string;
  customerAccountId: string;
  supplierAccountId: string;
  bankAccountId: string;
  rentAccountId: string;
  widgetId: string;
  serviceId: string;
  account: (code: SystemAccountCode) => Promise<string>;
  /** Runs `fn` with a PostingService in its own transaction. */
  post: <T>(fn: (p: PostingService) => Promise<T>) => Promise<T>;
  count: (table: string) => number;
}

/** A migrated, seeded company (Maharashtra, '27') with parties, products, a bank and series. */
export async function world(
  opts: { negativeStockPolicy?: 'ALLOW' | 'WARN' | 'BLOCK' } = {},
): Promise<World> {
  const executor = betterSqliteExecutor();
  const client = createDatabaseClient(executor);
  const { db } = client;
  await migrate(client);

  const [company] = await db
    .insert(companies)
    .values({
      name: 'Test Traders',
      stateCode: '27',
      booksBeginDate: '2026-04-01',
      negativeStockPolicy: opts.negativeStockPolicy ?? 'ALLOW',
      createdBy: ACTOR.userId,
    })
    .returning();
  const companyId = company!.id;
  await seedCompanyDefaults(client, { companyId, userId: ACTOR.userId });

  const account = async (code: SystemAccountCode) =>
    (
      await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.companyId, companyId), eq(accounts.systemCode, code)))
    )[0]!.id;

  const ledger = async (name: string, parent: SystemAccountCode | null, nature: 'ASSET' | 'LIABILITY' | 'EXPENSE') =>
    (
      await db
        .insert(accounts)
        .values({
          companyId,
          parentId: parent ? await account(parent) : null,
          name,
          nature,
          createdBy: ACTOR.userId,
        })
        .returning()
    )[0]!.id;

  const customerAccountId = await ledger('Acme Retail', 'SUNDRY_DEBTORS', 'ASSET');
  const supplierAccountId = await ledger('Bharat Wholesale', 'SUNDRY_CREDITORS', 'LIABILITY');
  const bankAccountId = await ledger('HDFC Current', 'BANK', 'ASSET');
  const rentAccountId = await ledger('Rent', null, 'EXPENSE');

  const party = async (name: string, accountId: string, partyType: 'CUSTOMER' | 'SUPPLIER', stateCode: string) =>
    (
      await db
        .insert(parties)
        .values({
          companyId,
          accountId,
          partyType,
          name,
          registrationType: 'REGULAR',
          gstin: `${stateCode}AAAAA0000A1Z5`,
          stateCode,
          createdBy: ACTOR.userId,
        })
        .returning()
    )[0]!.id;
  const customerId = await party('Acme Retail', customerAccountId, 'CUSTOMER', '27');
  const supplierId = await party('Bharat Wholesale', supplierAccountId, 'SUPPLIER', '27');

  const [nos] = await db.select().from(units).where(eq(units.code, 'NOS'));
  const product = async (name: string, isService: boolean) =>
    (
      await db
        .insert(products)
        .values({
          companyId,
          name,
          hsnSac: isService ? '998313' : '8471',
          unitId: nos!.id,
          isService,
          trackInventory: !isService,
          createdBy: ACTOR.userId,
        })
        .returning()
    )[0]!.id;
  const widgetId = await product('Widget', false);
  const serviceId = await product('Installation', true);

  const series = {} as Record<NumberedDocType, string>;
  for (const docType of NUMBERED_DOC_TYPES) {
    const [s] = await db
      .insert(numberSeries)
      .values({
        companyId,
        financialYear: FY,
        docType,
        name: docType,
        prefix: `${docType.slice(0, 3)}/`,
        isDefault: true,
        createdBy: ACTOR.userId,
      })
      .returning();
    series[docType] = s!.id;
  }

  return {
    client,
    db,
    sqlite: executor.raw,
    companyId,
    series,
    customerId,
    supplierId,
    customerAccountId,
    supplierAccountId,
    bankAccountId,
    rentAccountId,
    widgetId,
    serviceId,
    account,
    post: (fn) => client.transaction((tx) => fn(new PostingService(tx, ACTOR))),
    count: (table) =>
      (executor.raw.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n,
  };
}

/** Intra-state line: qty × ₹rate, 18% GST split 9% CGST + 9% SGST. */
export function line(productId: string, qty: number, ratePaise: number): TradeLineInput {
  const taxable = qty * ratePaise;
  const half = Math.round(taxable * 0.09);
  return {
    productId,
    qtyX1000: qty * 1000,
    ratePaise,
    taxableValuePaise: taxable,
    cgstBp: 900,
    sgstBp: 900,
    cgstPaise: half,
    sgstPaise: half,
  };
}

/** Inter-state line at 18% IGST. */
export function igstLine(productId: string, qty: number, ratePaise: number): TradeLineInput {
  const taxable = qty * ratePaise;
  return {
    productId,
    qtyX1000: qty * 1000,
    ratePaise,
    taxableValuePaise: taxable,
    igstBp: 1800,
    igstPaise: Math.round(taxable * 0.18),
  };
}
