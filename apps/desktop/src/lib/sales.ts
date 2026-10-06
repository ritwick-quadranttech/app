import { financialYearOf, withPosting, type SalesInvoiceInput } from '@repo/accounting';
import {
  accounts,
  auditLogs,
  companies,
  einvoices,
  numberSeries,
  parties,
  products,
  salesInvoiceItems,
  salesInvoices,
  taxRates,
  units,
} from '@repo/database';
import { STATE_CODES } from '@repo/gst-engine';
import { renderInvoiceHtml, type InvoiceRenderInput } from '@repo/invoice';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDatabaseClient } from './bridge';

const ACTOR = { userId: 'system' };

export interface SalesWorkspace {
  readonly company: {
    readonly id: string;
    readonly name: string;
    readonly stateCode: string;
    readonly gstin: string | null;
    readonly address: string;
    readonly fyStartMonth: number;
    readonly einvoiceEnabled: boolean;
    readonly lockedUntil: string | null;
  };
  readonly customers: readonly {
    readonly id: string;
    readonly name: string;
    readonly gstin: string | null;
    readonly stateCode: string | null;
    readonly registrationType: string;
    readonly address: string;
  }[];
  readonly products: readonly {
    readonly id: string;
    readonly name: string;
    readonly hsnSac: string | null;
    readonly unitId: string;
    readonly taxCategoryId: string | null;
    readonly saleRatePaise: number | null;
  }[];
  readonly units: readonly { readonly id: string; readonly code: string; readonly name: string }[];
  readonly paymentAccounts: readonly { readonly id: string; readonly name: string }[];
  readonly series: readonly {
    readonly id: string;
    readonly name: string;
    readonly prefix: string;
    readonly suffix: string;
    readonly nextNo: number;
    readonly padWidth: number;
    readonly financialYear: string;
    readonly isDefault: boolean;
  }[];
  readonly taxRates: readonly {
    readonly taxCategoryId: string;
    readonly effectiveFrom: string;
    readonly effectiveTo: string | null;
    readonly cgstBp: number;
    readonly sgstBp: number;
    readonly igstBp: number;
    readonly cessBp: number;
    readonly cessPerUnitPaise: number;
  }[];
  readonly invoices: readonly {
    readonly id: string;
    readonly docNumber: string;
    readonly date: string;
    readonly partyName: string;
    readonly grandTotalPaise: number;
    readonly status: 'POSTED' | 'CANCELLED';
    readonly paymentMethod: string;
    readonly paymentStatus: string;
    readonly einvoiceStatus: string;
    readonly cancelReason: string | null;
  }[];
}

export async function loadSalesWorkspace(companyId: string): Promise<SalesWorkspace> {
  const db = getDatabaseClient().db;
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new Error('Company not found.');

  const [
    customerRows,
    productRows,
    unitRows,
    accountRows,
    cashBankGroups,
    seriesRows,
    rateRows,
    invoiceRows,
    eInvoiceRows,
  ] = await Promise.all([
    db
      .select({
        id: parties.id,
        name: parties.name,
        gstin: parties.gstin,
        stateCode: parties.stateCode,
        registrationType: parties.registrationType,
        billingAddress: parties.billingAddress,
        shippingAddress: parties.shippingAddress,
      })
      .from(parties)
      .where(
        and(
          eq(parties.companyId, companyId),
          inArray(parties.partyType, ['CUSTOMER', 'BOTH']),
          isNull(parties.deletedAt),
        ),
      ),
    db
      .select({
        id: products.id,
        name: products.name,
        hsnSac: products.hsnSac,
        unitId: products.unitId,
        taxCategoryId: products.taxCategoryId,
        saleRatePaise: products.saleRatePaise,
      })
      .from(products)
      .where(
        and(
          eq(products.companyId, companyId),
          eq(products.isActive, true),
          isNull(products.deletedAt),
        ),
      ),
    db
      .select({ id: units.id, code: units.code, name: units.name })
      .from(units)
      .where(and(eq(units.companyId, companyId), isNull(units.deletedAt))),
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        parentId: accounts.parentId,
        systemCode: accounts.systemCode,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.companyId, companyId),
          eq(accounts.nature, 'ASSET'),
          eq(accounts.isGroup, false),
          isNull(accounts.deletedAt),
        ),
      ),
    db
      .select({ id: accounts.id, systemCode: accounts.systemCode })
      .from(accounts)
      .where(
        and(eq(accounts.companyId, companyId), inArray(accounts.systemCode, ['CASH', 'BANK'])),
      ),
    db
      .select({
        id: numberSeries.id,
        name: numberSeries.name,
        prefix: numberSeries.prefix,
        suffix: numberSeries.suffix,
        nextNo: numberSeries.nextNo,
        padWidth: numberSeries.padWidth,
        financialYear: numberSeries.financialYear,
        isDefault: numberSeries.isDefault,
      })
      .from(numberSeries)
      .where(
        and(
          eq(numberSeries.companyId, companyId),
          eq(numberSeries.docType, 'SALES_INVOICE'),
          eq(numberSeries.isActive, true),
        ),
      ),
    db
      .select({
        taxCategoryId: taxRates.taxCategoryId,
        effectiveFrom: taxRates.effectiveFrom,
        effectiveTo: taxRates.effectiveTo,
        cgstBp: taxRates.cgstBp,
        sgstBp: taxRates.sgstBp,
        igstBp: taxRates.igstBp,
        cessBp: taxRates.cessBp,
        cessPerUnitPaise: taxRates.cessPerUnitPaise,
      })
      .from(taxRates)
      .where(and(eq(taxRates.companyId, companyId), isNull(taxRates.deletedAt))),
    db
      .select({
        id: salesInvoices.id,
        docNumber: salesInvoices.docNumber,
        date: salesInvoices.date,
        partyName: salesInvoices.partyName,
        grandTotalPaise: salesInvoices.grandTotalPaise,
        status: salesInvoices.status,
        paymentMethod: salesInvoices.paymentMethod,
        paymentStatus: salesInvoices.paymentStatus,
        cancelReason: salesInvoices.cancelReason,
      })
      .from(salesInvoices)
      .where(eq(salesInvoices.companyId, companyId))
      .orderBy(desc(salesInvoices.date), desc(salesInvoices.docNo))
      .limit(250),
    db
      .select({ sourceDocId: einvoices.sourceDocId, status: einvoices.status })
      .from(einvoices)
      .where(and(eq(einvoices.companyId, companyId), eq(einvoices.sourceDocType, 'SALES_INVOICE'))),
  ]);

  return {
    company: {
      id: company.id,
      name: company.legalName || company.name,
      stateCode: company.stateCode,
      gstin: company.gstin,
      address: [company.addressLine1, company.addressLine2, company.city, company.pincode]
        .filter(Boolean)
        .join(', '),
      fyStartMonth: company.fyStartMonth,
      einvoiceEnabled: company.einvoiceEnabled,
      lockedUntil: company.lockedUntil,
    },
    customers: customerRows.map((customer) => ({
      id: customer.id,
      name: customer.name,
      gstin: customer.gstin,
      stateCode: customer.stateCode,
      registrationType: customer.registrationType,
      address: customer.shippingAddress || customer.billingAddress || '',
    })),
    products: productRows,
    units: unitRows,
    paymentAccounts: accountRows.filter((account) =>
      cashBankGroups.some(
        (group) =>
          (account.systemCode === 'CASH' &&
            group.systemCode === 'CASH' &&
            account.id === group.id) ||
          account.parentId === group.id,
      ),
    ),
    series: seriesRows,
    taxRates: rateRows,
    invoices: invoiceRows.map((invoice) => ({
      ...invoice,
      einvoiceStatus:
        eInvoiceRows.find((row) => row.sourceDocId === invoice.id)?.status ?? 'NOT_REQUIRED',
    })),
  };
}

export async function setCompanyEInvoiceEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const client = getDatabaseClient();
  await client.transaction(async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, companyId));
    if (!company) throw new Error('Company not found.');
    if (company.einvoiceEnabled === enabled) return;
    await tx.update(companies).set({ einvoiceEnabled: enabled }).where(eq(companies.id, companyId));
    await tx.insert(auditLogs).values({
      companyId,
      userId: ACTOR.userId,
      action: 'UPDATE',
      entity: 'companies',
      entityId: companyId,
      beforeJson: JSON.stringify({ einvoiceEnabled: company.einvoiceEnabled }),
      afterJson: JSON.stringify({ einvoiceEnabled: enabled }),
      createdBy: ACTOR.userId,
    });
  });
}

export async function postSalesInvoice(input: SalesInvoiceInput) {
  return withPosting(getDatabaseClient(), ACTOR, (posting) => posting.postSalesInvoice(input));
}

export async function replaceSalesInvoice(invoiceId: string, input: SalesInvoiceInput) {
  return withPosting(getDatabaseClient(), ACTOR, async (posting) => {
    await posting.cancel('SALES_INVOICE', invoiceId, 'Edited and reposted');
    return posting.postSalesInvoice(input);
  });
}

export async function cancelSalesInvoice(invoiceId: string, reason: string): Promise<void> {
  await withPosting(getDatabaseClient(), ACTOR, (posting) =>
    posting.cancel('SALES_INVOICE', invoiceId, reason),
  );
}

export async function loadSalesInvoiceDraft(invoiceId: string) {
  const db = getDatabaseClient().db;
  const [invoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
  if (!invoice) throw new Error('Invoice not found.');
  const lines = await db
    .select()
    .from(salesInvoiceItems)
    .where(eq(salesInvoiceItems.invoiceId, invoiceId));
  return {
    id: invoice.id,
    companyId: invoice.companyId,
    date: invoice.date,
    partyId: invoice.partyId,
    placeOfSupply: invoice.placeOfSupply,
    roundOffPaise: invoice.roundOffPaise,
    notes: invoice.notes ?? '',
    paymentMethod: invoice.paymentMethod,
    paymentStatus: invoice.paymentStatus,
    cashBankAccountId: invoice.cashBankAccountId ?? '',
    seriesId: invoice.seriesId,
    lines: lines.map((line) => ({
      productId: line.productId,
      unitId: line.unitId,
      qtyX1000: line.qtyX1000,
      ratePaise: line.ratePaise,
      discountPaise: line.discountPaise,
      hsnSac: line.hsnSac,
      description: line.description,
    })),
  };
}

export async function renderSalesInvoice(invoiceId: string): Promise<string> {
  const db = getDatabaseClient().db;
  const [invoice] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
  if (!invoice) throw new Error('Invoice not found.');
  const [company] = await db.select().from(companies).where(eq(companies.id, invoice.companyId));
  const lines = await db
    .select({ line: salesInvoiceItems, productName: products.name, unitCode: units.code })
    .from(salesInvoiceItems)
    .innerJoin(products, eq(salesInvoiceItems.productId, products.id))
    .innerJoin(units, eq(salesInvoiceItems.unitId, units.id))
    .where(eq(salesInvoiceItems.invoiceId, invoiceId));
  const [eInvoice] = await db
    .select()
    .from(einvoices)
    .where(and(eq(einvoices.sourceDocType, 'SALES_INVOICE'), eq(einvoices.sourceDocId, invoiceId)));
  if (!company) throw new Error('Company not found.');
  const input: InvoiceRenderInput = {
    company: {
      name: company.legalName || company.name,
      gstin: company.gstin,
      address: [company.addressLine1, company.addressLine2, company.city, company.pincode]
        .filter(Boolean)
        .join(', '),
    },
    customer: {
      name: invoice.partyName,
      gstin: invoice.partyGstin,
      address: invoice.shippingAddress || invoice.billingAddress || '',
    },
    invoiceNumber: invoice.docNumber,
    date: invoice.date,
    placeOfSupply: `${invoice.placeOfSupply}${STATE_CODES[invoice.placeOfSupply] ? ` ${STATE_CODES[invoice.placeOfSupply]}` : ''}`,
    lines: lines.map(({ line, productName, unitCode }) => ({
      description: line.description || productName,
      hsnSac: line.hsnSac,
      qtyX1000: line.qtyX1000,
      unit: unitCode,
      ratePaise: line.ratePaise,
      discountPaise: line.discountPaise,
      taxableValuePaise: line.taxableValuePaise,
      cgstBp: line.cgstBp,
      sgstBp: line.sgstBp,
      igstBp: line.igstBp,
      cessBp: line.cessBp,
      cgstPaise: line.cgstPaise,
      sgstPaise: line.sgstPaise,
      igstPaise: line.igstPaise,
      cessPaise: line.cessPaise,
      totalPaise: line.totalPaise,
    })),
    roundOffPaise: invoice.roundOffPaise,
    taxableTotalPaise: invoice.taxableTotalPaise,
    cgstTotalPaise: invoice.cgstTotalPaise,
    sgstTotalPaise: invoice.sgstTotalPaise,
    igstTotalPaise: invoice.igstTotalPaise,
    cessTotalPaise: invoice.cessTotalPaise,
    grandTotalPaise: invoice.grandTotalPaise,
    notes: invoice.notes,
    eInvoiceResponse:
      eInvoice?.status === 'GENERATED' && eInvoice.irn
        ? { irn: eInvoice.irn, signedQr: eInvoice.signedQr }
        : null,
  };
  return renderInvoiceHtml(input);
}

export function invoiceFinancialYear(date: string, fyStartMonth: number): string {
  return financialYearOf(date, fyStartMonth);
}
