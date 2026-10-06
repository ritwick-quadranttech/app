import {
  accounts,
  auditLogs,
  newId,
  numberSeries,
  parties,
  products,
  taxCategories,
  taxRates,
  units,
} from '@repo/database';
import {
  assertPermission,
} from '@repo/shared';
import {
  type PartyInput,
  PartySchema,
  type ProductInput,
  ProductSchema,
  type TaxCategoryInput,
  TaxCategorySchema,
  type TaxRateInput,
  TaxRateSchema,
  type UnitInput,
  UnitSchema,
} from '@repo/validation';
import { withPosting } from '@repo/accounting';
import { and, eq, isNull } from 'drizzle-orm';
import { getDatabaseClient } from '../bridge';
import type { UserSession } from './auth';

// ------------------- Parties (Customers & Suppliers) -------------------

export async function createParty(
  actor: UserSession,
  companyId: string,
  rawInput: PartyInput,
): Promise<{ partyId: string; accountId: string }> {
  assertPermission(actor.role, 'MASTERS_CREATE');
  const input = PartySchema.parse(rawInput);
  const client = getDatabaseClient();

  // Find parent group account: SUNDRY_DEBTORS for customer, SUNDRY_CREDITORS for supplier
  const parentCode = input.partyType === 'SUPPLIER' ? 'SUNDRY_CREDITORS' : 'SUNDRY_DEBTORS';
  const nature = input.partyType === 'SUPPLIER' ? 'LIABILITY' : 'ASSET';

  const [parentAccount] = await client.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.companyId, companyId), eq(accounts.systemCode, parentCode)));

  const partyId = newId();
  const accountId = newId();

  await client.transaction(async (tx) => {
    // 1. Create party's ledger account
    await tx.insert(accounts).values({
      id: accountId,
      companyId,
      parentId: parentAccount?.id ?? null,
      name: input.name,
      nature,
      isGroup: false,
      isActive: true,
      createdBy: actor.id,
    });

    // 2. Insert party
    await tx.insert(parties).values({
      id: partyId,
      companyId,
      accountId,
      partyType: input.partyType,
      name: input.name,
      gstin: input.gstin || null,
      pan: input.pan || null,
      registrationType: input.registrationType,
      stateCode: input.stateCode || null,
      billingAddress: input.billingAddress || null,
      shippingAddress: input.shippingAddress || null,
      city: input.city || null,
      pincode: input.pincode || null,
      phone: input.phone || null,
      email: input.email || null,
      creditDays: input.creditDays,
      creditLimitPaise: input.creditLimitPaise,
      createdBy: actor.id,
    });

    // 3. Write audit log
    await tx.insert(auditLogs).values({
      companyId,
      userId: actor.id,
      action: 'CREATE',
      entity: 'parties',
      entityId: partyId,
      afterJson: JSON.stringify(input),
      createdBy: actor.id,
    });
  });

  // 4. Post Opening Balance if non-zero
  if (input.openingBalancePaise !== 0) {
    await postPartyOpeningBalance(actor, companyId, accountId, input.openingBalancePaise);
  }

  return { partyId, accountId };
}

export async function listParties(
  companyId: string,
  partyType?: 'CUSTOMER' | 'SUPPLIER',
) {
  const client = getDatabaseClient();
  const conditions = [eq(parties.companyId, companyId), isNull(parties.deletedAt)];
  if (partyType) {
    conditions.push(eq(parties.partyType, partyType));
  }

  return client.db
    .select()
    .from(parties)
    .where(and(...conditions))
    .orderBy(parties.name);
}

// ------------------- Products & Services -------------------

export async function createProduct(
  actor: UserSession,
  companyId: string,
  rawInput: ProductInput,
): Promise<{ productId: string }> {
  assertPermission(actor.role, 'MASTERS_CREATE');
  const input = ProductSchema.parse(rawInput);
  const client = getDatabaseClient();
  const productId = newId();

  await client.transaction(async (tx) => {
    await tx.insert(products).values({
      id: productId,
      companyId,
      name: input.name,
      sku: input.sku || null,
      description: input.description || null,
      hsnSac: input.hsnSac || null,
      isService: input.isService,
      unitId: input.unitId,
      taxCategoryId: input.taxCategoryId || null,
      saleRatePaise: input.saleRatePaise,
      purchaseRatePaise: input.purchaseRatePaise,
      mrpPaise: input.mrpPaise,
      trackInventory: input.trackInventory,
      isActive: true,
      createdBy: actor.id,
    });

    await tx.insert(auditLogs).values({
      companyId,
      userId: actor.id,
      action: 'CREATE',
      entity: 'products',
      entityId: productId,
      afterJson: JSON.stringify(input),
      createdBy: actor.id,
    });
  });

  // Post Opening Stock if specified
  if (input.trackInventory && !input.isService && input.openingStockQtyX1000 > 0) {
    await postProductOpeningStock(
      actor,
      companyId,
      productId,
      input.openingStockQtyX1000,
      input.openingStockRatePaise,
    );
  }

  return { productId };
}

export async function listProducts(companyId: string) {
  const client = getDatabaseClient();
  return client.db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      hsnSac: products.hsnSac,
      isService: products.isService,
      unitId: products.unitId,
      unitCode: units.code,
      taxCategoryId: products.taxCategoryId,
      saleRatePaise: products.saleRatePaise,
      purchaseRatePaise: products.purchaseRatePaise,
      trackInventory: products.trackInventory,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(units, eq(products.unitId, units.id))
    .where(and(eq(products.companyId, companyId), isNull(products.deletedAt)))
    .orderBy(products.name);
}

// ------------------- Units -------------------

export async function createUnit(
  actor: UserSession,
  companyId: string,
  rawInput: UnitInput,
): Promise<{ unitId: string }> {
  assertPermission(actor.role, 'MASTERS_CREATE');
  const input = UnitSchema.parse(rawInput);
  const client = getDatabaseClient();
  const unitId = newId();

  await client.transaction(async (tx) => {
    await tx.insert(units).values({
      id: unitId,
      companyId,
      code: input.code.toUpperCase(),
      name: input.name,
      uqc: input.uqc.toUpperCase(),
      decimals: input.decimals,
      createdBy: actor.id,
    });

    await tx.insert(auditLogs).values({
      companyId,
      userId: actor.id,
      action: 'CREATE',
      entity: 'units',
      entityId: unitId,
      afterJson: JSON.stringify(input),
      createdBy: actor.id,
    });
  });

  return { unitId };
}

export async function listUnits(companyId: string) {
  const client = getDatabaseClient();
  return client.db
    .select()
    .from(units)
    .where(and(eq(units.companyId, companyId), isNull(units.deletedAt)))
    .orderBy(units.code);
}

// ------------------- Tax Categories & Rates -------------------

export async function createTaxCategory(
  actor: UserSession,
  companyId: string,
  rawInput: TaxCategoryInput,
): Promise<{ categoryId: string }> {
  assertPermission(actor.role, 'MASTERS_CREATE');
  const input = TaxCategorySchema.parse(rawInput);
  const client = getDatabaseClient();
  const categoryId = newId();

  await client.transaction(async (tx) => {
    await tx.insert(taxCategories).values({
      id: categoryId,
      companyId,
      code: input.code,
      name: input.name,
      createdBy: actor.id,
    });

    await tx.insert(auditLogs).values({
      companyId,
      userId: actor.id,
      action: 'CREATE',
      entity: 'tax_categories',
      entityId: categoryId,
      afterJson: JSON.stringify(input),
      createdBy: actor.id,
    });
  });

  return { categoryId };
}

export async function listTaxCategories(companyId: string) {
  const client = getDatabaseClient();
  return client.db
    .select()
    .from(taxCategories)
    .where(and(eq(taxCategories.companyId, companyId), isNull(taxCategories.deletedAt)))
    .orderBy(taxCategories.name);
}

export async function createTaxRate(
  actor: UserSession,
  companyId: string,
  rawInput: TaxRateInput,
): Promise<{ taxRateId: string }> {
  assertPermission(actor.role, 'MASTERS_CREATE');
  const input = TaxRateSchema.parse(rawInput);
  const client = getDatabaseClient();
  const taxRateId = newId();

  await client.transaction(async (tx) => {
    await tx.insert(taxRates).values({
      id: taxRateId,
      companyId,
      taxCategoryId: input.taxCategoryId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo || null,
      igstBp: input.igstBp,
      cgstBp: input.cgstBp,
      sgstBp: input.sgstBp,
      cessBp: input.cessBp,
      cessPerUnitPaise: input.cessPerUnitPaise,
      createdBy: actor.id,
    });

    await tx.insert(auditLogs).values({
      companyId,
      userId: actor.id,
      action: 'CREATE',
      entity: 'tax_rates',
      entityId: taxRateId,
      afterJson: JSON.stringify(input),
      createdBy: actor.id,
    });
  });

  return { taxRateId };
}

export async function listTaxRates(companyId: string) {
  const client = getDatabaseClient();
  return client.db
    .select({
      id: taxRates.id,
      taxCategoryId: taxRates.taxCategoryId,
      categoryName: taxCategories.name,
      effectiveFrom: taxRates.effectiveFrom,
      effectiveTo: taxRates.effectiveTo,
      igstBp: taxRates.igstBp,
      cgstBp: taxRates.cgstBp,
      sgstBp: taxRates.sgstBp,
      cessBp: taxRates.cessBp,
    })
    .from(taxRates)
    .innerJoin(taxCategories, eq(taxRates.taxCategoryId, taxCategories.id))
    .where(and(eq(taxRates.companyId, companyId), isNull(taxRates.deletedAt)))
    .orderBy(taxRates.effectiveFrom);
}

// ------------------- Opening Balances Postings -------------------

async function postPartyOpeningBalance(
  actor: UserSession,
  companyId: string,
  partyAccountId: string,
  balancePaise: number,
): Promise<void> {
  const client = getDatabaseClient();

  // Find CAPITAL account
  const [capital] = await client.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.companyId, companyId), eq(accounts.systemCode, 'CAPITAL')));

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

  if (!capital || !series) return;

  const abs = Math.abs(balancePaise);
  // Positive: Customer owes money (Dr Party, Cr Capital)
  // Negative: Supplier owed money (Dr Capital, Cr Party)
  const debitAccountId = balancePaise > 0 ? partyAccountId : capital.id;
  const creditAccountId = balancePaise > 0 ? capital.id : partyAccountId;

  await withPosting(client, { userId: actor.id }, (posting) =>
    posting.postJournalVoucher({
      companyId,
      seriesId: series.id,
      date: '2026-04-01',
      narration: 'Opening balance posting',
      lines: [
        { accountId: debitAccountId, debitPaise: abs, creditPaise: 0 },
        { accountId: creditAccountId, debitPaise: 0, creditPaise: abs },
      ],
    }),
  );
}

async function postProductOpeningStock(
  actor: UserSession,
  companyId: string,
  productId: string,
  qtyX1000: number,
  ratePaise: number,
): Promise<void> {
  const client = getDatabaseClient();

  const [series] = await client.db
    .select({ id: numberSeries.id })
    .from(numberSeries)
    .where(
      and(
        eq(numberSeries.companyId, companyId),
        eq(numberSeries.docType, 'STOCK_ADJUSTMENT'),
        eq(numberSeries.financialYear, '2026-27'),
      ),
    );

  if (!series) return;

  await withPosting(client, { userId: actor.id }, (posting) =>
    posting.postOpeningStock({
      companyId,
      seriesId: series.id,
      date: '2026-04-01',
      kind: 'OPENING',
      reason: 'Opening stock count',
      lines: [
        {
          id: newId(),
          productId,
          qtyX1000,
          ratePaise,
        },
      ],
    }),
  );
}
