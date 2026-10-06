import {
  accounts,
  allocateDocumentNumber,
  auditLogs,
  companies,
  contraVouchers,
  type Db,
  expenseItems,
  expenses,
  einvoices,
  gstTransactions,
  journalEntries,
  journalVoucherLines,
  journalVouchers,
  ledgerEntries,
  newId,
  numberSeries,
  parties,
  payments,
  type PaymentMode,
  products,
  purchaseInvoiceItems,
  purchaseInvoices,
  purchaseReturnItems,
  purchaseReturns,
  receipts,
  salesInvoiceItems,
  salesInvoices,
  salesReturnItems,
  salesReturns,
  type SourceDocType,
  stockAdjustmentItems,
  stockAdjustments,
  stockMovements,
} from '@repo/database';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  AlreadyCancelledError,
  DocumentNotFoundError,
  DocumentValidationError,
  InvalidAccountError,
  NegativeStockError,
  PeriodLockedError,
  type StockShortfall,
} from '../errors';
import { assertIsoDate, financialYearOf } from '../fiscal';
import { assertBalanced, type Journal, reverseJournal } from '../journal';
import { sumPaise } from '../money';
import { postOpeningStock, postStockAdjustment } from '../rules/stock';
import {
  postPurchaseInvoice,
  postPurchaseReturn,
  postSalesInvoice,
  postSalesReturn,
  tradeGrandTotal,
  tradeTotals,
} from '../rules/trade';
import {
  SYSTEM_ACCOUNT_CODES,
  type PostingResult,
  type StockMovementDraft,
  type SystemAccounts,
  type TradeDocument,
  type TradeLine,
} from '../rules/types';
import {
  postContra,
  postExpense,
  postJournalVoucher,
  postPayment,
  postReceipt,
} from '../rules/vouchers';
import type {
  CashVoucherInput,
  ContraInput,
  ExpenseInput,
  JournalVoucherInput,
  PurchaseInvoiceInput,
  PurchaseReturnInput,
  SalesInvoiceInput,
  SalesReturnInput,
  StockAdjustmentInput,
  TradeDocumentInput,
} from './inputs';

export interface Actor {
  readonly userId: string;
}

export interface PostingWarning {
  readonly code: 'NEGATIVE_STOCK';
  readonly shortfalls: readonly StockShortfall[];
}

export interface PostedDocument {
  readonly docType: SourceDocType;
  readonly id: string;
  readonly docNo: number;
  readonly docNumber: string;
  readonly financialYear: string;
  readonly journalEntryId: string | null;
  readonly warnings: readonly PostingWarning[];
}

export interface CancelledDocument {
  readonly docType: SourceDocType;
  readonly id: string;
  readonly reversalJournalEntryIds: readonly string[];
  readonly warnings: readonly PostingWarning[];
}

type Company = typeof companies.$inferSelect;

/** Header table of each document type (for cancellation). */
export const DOCUMENT_TABLES = {
  SALES_INVOICE: 'sales_invoices',
  SALES_RETURN: 'sales_returns',
  PURCHASE_INVOICE: 'purchase_invoices',
  PURCHASE_RETURN: 'purchase_returns',
  RECEIPT: 'receipts',
  PAYMENT: 'payments',
  CONTRA: 'contra_vouchers',
  EXPENSE: 'expenses',
  JOURNAL_VOUCHER: 'journal_vouchers',
  STOCK_ADJUSTMENT: 'stock_adjustments',
} as const satisfies Record<SourceDocType, string>;

const CASH_MODES: readonly PaymentMode[] = ['CASH'];
const BANK_MODES: readonly PaymentMode[] = ['UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE'];

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/**
 * Writes documents and everything they post — items, journal + ledger lines, stock movements,
 * GST register rows and the audit log — through ONE transaction handle. It never opens or
 * commits a transaction itself: run it inside `client.transaction(tx => …)` (or use
 * `withPosting`), and any error rolls back every row the call wrote.
 */
export class PostingService {
  constructor(
    private readonly tx: Db,
    private readonly actor: Actor,
  ) {}

  // ================= sales =================

  async postSalesInvoice(input: SalesInvoiceInput): Promise<PostedDocument> {
    const p = await this.#prepareTrade('SALES_INVOICE', input);
    const paymentMethod = input.paymentMethod ?? (input.cashBankAccountId ? 'CASH' : 'CREDIT');
    const paymentStatus = input.paymentStatus ?? (input.cashBankAccountId ? 'PAID' : 'UNPAID');
    if (paymentMethod === 'CREDIT' && paymentStatus === 'PAID') {
      throw new DocumentValidationError('A credit invoice cannot be marked paid.');
    }
    if (paymentStatus === 'PAID' && input.cashBankAccountId === undefined) {
      throw new DocumentValidationError('Choose a cash or bank account for a paid invoice.');
    }
    if (paymentStatus === 'UNPAID' && input.cashBankAccountId !== undefined) {
      throw new DocumentValidationError('An unpaid invoice cannot debit a cash or bank account.');
    }
    if (input.cashBankAccountId !== undefined) {
      await this.#cashOrBank(p.company.id, input.cashBankAccountId);
    }
    const result = postSalesInvoice(
      { ...p.doc, cashBankAccountId: orNull(input.cashBankAccountId) },
      p.accounts,
    );
    const header = {
      ...p.header,
      paymentType: input.cashBankAccountId === undefined ? ('CREDIT' as const) : ('CASH' as const),
      paymentMethod,
      paymentStatus,
      cashBankAccountId: orNull(input.cashBankAccountId),
    };
    await this.tx.insert(salesInvoices).values(header);
    const items = p.items((id) => ({ invoiceId: id }));
    await this.tx.insert(salesInvoiceItems).values(items);
    const posted = await this.#record(p.ctx, result, { header, items });
    await this.tx.insert(einvoices).values({
      companyId: p.company.id,
      financialYear: posted.financialYear,
      sourceDocId: posted.id,
      sourceDocType: 'SALES_INVOICE',
      status: p.company.einvoiceEnabled && p.doc.partyGstin ? 'PENDING' : 'NOT_REQUIRED',
      createdBy: this.actor.userId,
    });
    return posted;
  }

  async postSalesReturn(input: SalesReturnInput): Promise<PostedDocument> {
    const p = await this.#prepareTrade('SALES_RETURN', input);
    if (input.originalInvoiceId !== undefined) {
      await this.#assertOriginal(
        DOCUMENT_TABLES.SALES_INVOICE,
        input.originalInvoiceId,
        p.company.id,
        input.partyId,
      );
    }
    const result = postSalesReturn(p.doc, p.accounts);
    const header = {
      ...p.header,
      originalInvoiceId: orNull(input.originalInvoiceId),
      reason: orNull(input.reason),
    };
    await this.tx.insert(salesReturns).values(header);
    const items = p.items((id) => ({ returnId: id }));
    await this.tx.insert(salesReturnItems).values(items);
    return this.#record(p.ctx, result, { header, items });
  }

  // ================= purchases =================

  async postPurchaseInvoice(input: PurchaseInvoiceInput): Promise<PostedDocument> {
    assertIsoDate(input.supplierInvoiceDate, 'supplier invoice date');
    if (!input.supplierInvoiceNo.trim()) {
      throw new DocumentValidationError('Supplier invoice number is required.');
    }
    const p = await this.#prepareTrade('PURCHASE_INVOICE', input);
    const itcEligible = input.itcEligible ?? true;
    const result = postPurchaseInvoice({ ...p.doc, itcEligible }, p.accounts);
    const header = {
      ...p.header,
      supplierInvoiceNo: input.supplierInvoiceNo.trim(),
      supplierInvoiceDate: input.supplierInvoiceDate,
      itcEligible,
    };
    await this.tx.insert(purchaseInvoices).values(header);
    const items = p.items((id) => ({ invoiceId: id }));
    await this.tx.insert(purchaseInvoiceItems).values(items);
    return this.#record(p.ctx, result, { header, items });
  }

  async postPurchaseReturn(input: PurchaseReturnInput): Promise<PostedDocument> {
    const p = await this.#prepareTrade('PURCHASE_RETURN', input);
    let itcEligible = true;
    if (input.originalInvoiceId !== undefined) {
      await this.#assertOriginal(
        DOCUMENT_TABLES.PURCHASE_INVOICE,
        input.originalInvoiceId,
        p.company.id,
        input.partyId,
      );
      const [original] = await this.tx
        .select({ itcEligible: purchaseInvoices.itcEligible })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.originalInvoiceId));
      itcEligible = original?.itcEligible ?? true;
    }
    const result = postPurchaseReturn({ ...p.doc, itcEligible }, p.accounts);
    const header = {
      ...p.header,
      originalInvoiceId: orNull(input.originalInvoiceId),
      reason: orNull(input.reason),
    };
    await this.tx.insert(purchaseReturns).values(header);
    const items = p.items((id) => ({ returnId: id }));
    await this.tx.insert(purchaseReturnItems).values(items);
    return this.#record(p.ctx, result, { header, items });
  }

  // ================= cash & bank =================

  postReceipt(input: CashVoucherInput): Promise<PostedDocument> {
    return this.#postCashVoucher('RECEIPT', input);
  }

  postPayment(input: CashVoucherInput): Promise<PostedDocument> {
    return this.#postCashVoucher('PAYMENT', input);
  }

  async postContra(input: ContraInput): Promise<PostedDocument> {
    const o = await this.#open('CONTRA', input);
    await this.#cashOrBank(o.company.id, input.fromAccountId);
    await this.#cashOrBank(o.company.id, input.toAccountId);
    const result = postContra({
      date: input.date,
      docNumber: o.number.docNumber,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountPaise: input.amountPaise,
      narration: orNull(input.notes),
    });
    const header = {
      ...o.header,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountPaise: input.amountPaise,
      mode: input.mode,
      referenceNo: orNull(input.referenceNo),
    };
    await this.tx.insert(contraVouchers).values(header);
    return this.#record(o.ctx, result, { header });
  }

  async postExpense(input: ExpenseInput): Promise<PostedDocument> {
    const o = await this.#open('EXPENSE', input);
    const accounts = await this.#systemAccounts(o.company.id);
    if (input.partyId !== undefined) await this.#party(o.company.id, input.partyId);
    const igstApplicable = input.igstApplicable ?? false;
    const lines = input.lines.map((l) => ({
      id: newId(),
      accountId: l.accountId,
      hsnSac: orNull(l.hsnSac),
      taxableValuePaise: l.taxableValuePaise,
      cgstBp: l.cgstBp ?? 0,
      sgstBp: l.sgstBp ?? 0,
      igstBp: l.igstBp ?? 0,
      cessBp: l.cessBp ?? 0,
      cgstPaise: l.cgstPaise ?? 0,
      sgstPaise: l.sgstPaise ?? 0,
      igstPaise: l.igstPaise ?? 0,
      cessPaise: l.cessPaise ?? 0,
    }));
    this.#assertTaxRegime(igstApplicable, lines);
    const itcEligible = input.itcEligible ?? true;
    const result = postExpense(
      {
        date: input.date,
        docNumber: o.number.docNumber,
        creditAccountId: input.creditAccountId,
        partyId: orNull(input.partyId),
        supplierGstin: orNull(input.supplierGstin),
        placeOfSupply: orNull(input.placeOfSupply),
        itcEligible,
        narration: orNull(input.notes),
        lines,
      },
      accounts,
    );
    const sum = (pick: (l: (typeof lines)[number]) => number) => sumPaise(lines.map(pick));
    const header = {
      ...o.header,
      creditAccountId: input.creditAccountId,
      partyId: orNull(input.partyId),
      supplierGstin: orNull(input.supplierGstin),
      supplierInvoiceNo: orNull(input.supplierInvoiceNo),
      placeOfSupply: orNull(input.placeOfSupply),
      igstApplicable,
      itcEligible,
      taxableTotalPaise: sum((l) => l.taxableValuePaise),
      cgstTotalPaise: sum((l) => l.cgstPaise),
      sgstTotalPaise: sum((l) => l.sgstPaise),
      igstTotalPaise: sum((l) => l.igstPaise),
      cessTotalPaise: sum((l) => l.cessPaise),
      totalPaise: sum(
        (l) => l.taxableValuePaise + l.cgstPaise + l.sgstPaise + l.igstPaise + l.cessPaise,
      ),
    };
    await this.tx.insert(expenses).values(header);
    const items = lines.map((l, i) => ({
      ...l,
      companyId: o.company.id,
      financialYear: o.number.financialYear,
      expenseId: o.id,
      lineNo: i + 1,
      description: orNull(input.lines[i]?.description),
      totalPaise: l.taxableValuePaise + l.cgstPaise + l.sgstPaise + l.igstPaise + l.cessPaise,
      createdBy: this.actor.userId,
    }));
    await this.tx.insert(expenseItems).values(items);
    return this.#record(o.ctx, result, { header, items });
  }

  async postJournalVoucher(input: JournalVoucherInput): Promise<PostedDocument> {
    const o = await this.#open('JOURNAL_VOUCHER', input);
    const lines = input.lines.map((l) => ({
      accountId: l.accountId,
      debitPaise: l.debitPaise ?? 0,
      creditPaise: l.creditPaise ?? 0,
      ...(l.narration === undefined ? {} : { narration: l.narration }),
    }));
    const result = postJournalVoucher({
      date: input.date,
      docNumber: o.number.docNumber,
      narration: orNull(input.notes),
      lines,
    });
    await this.tx.insert(journalVouchers).values(o.header);
    const items = lines.map((l, i) => ({
      companyId: o.company.id,
      financialYear: o.number.financialYear,
      journalVoucherId: o.id,
      lineNo: i + 1,
      accountId: l.accountId,
      debitPaise: l.debitPaise,
      creditPaise: l.creditPaise,
      narration: l.narration ?? null,
      createdBy: this.actor.userId,
    }));
    await this.tx.insert(journalVoucherLines).values(items);
    return this.#record(o.ctx, result, { header: o.header, items });
  }

  // ================= inventory =================

  postStockAdjustment(input: StockAdjustmentInput): Promise<PostedDocument> {
    return this.#postStockDocument('ADJUSTMENT', input);
  }

  postOpeningStock(input: StockAdjustmentInput): Promise<PostedDocument> {
    return this.#postStockDocument('OPENING', input);
  }

  // ================= cancellation =================

  /**
   * Cancels a posted document. Nothing is deleted: the document is marked CANCELLED and every
   * journal entry, stock movement and GST row it posted gets an exact reversal linked to the
   * original. The reversals carry the original date, so reports as of any date return to their
   * pre-posting state.
   */
  async cancel(docType: SourceDocType, docId: string, reason: string): Promise<CancelledDocument> {
    if (!reason.trim()) throw new DocumentValidationError('A cancellation reason is required.');
    const table = sql.identifier(DOCUMENT_TABLES[docType]);
    const [row] = await this.tx.values<[string, string, string, string]>(
      sql`SELECT company_id, date, status, financial_year FROM ${table} WHERE id = ${docId}`,
    );
    if (!row) throw new DocumentNotFoundError(`${docType} ${docId} not found.`);
    const [companyId, date, status] = row;
    if (status === 'CANCELLED')
      throw new AlreadyCancelledError(`${docType} ${docId} is already cancelled.`);

    const company = await this.#company(companyId);
    this.#assertPeriodOpen(company, date);

    const now = Date.now();
    await this.tx.run(
      sql`UPDATE ${table} SET status = 'CANCELLED', cancel_reason = ${reason.trim()},
          cancelled_at = ${now}, cancelled_by = ${this.actor.userId}, updated_at = ${now}
          WHERE id = ${docId}`,
    );
    if (docType === 'SALES_INVOICE') {
      await this.tx
        .update(einvoices)
        .set({ status: 'CANCELLED', updatedAt: new Date(now) })
        .where(and(eq(einvoices.sourceDocType, 'SALES_INVOICE'), eq(einvoices.sourceDocId, docId)));
    }

    // Journal entries → mirror-image entries.
    const reversalJournalEntryIds: string[] = [];
    const entries = await this.tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.sourceDocType, docType),
          eq(journalEntries.sourceDocId, docId),
          isNull(journalEntries.reversesEntryId),
        ),
      );
    for (const entry of entries) {
      const lines = await this.tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.journalEntryId, entry.id))
        .orderBy(ledgerEntries.lineNo);
      const reversal = reverseJournal({
        voucherType: entry.voucherType,
        date: entry.date,
        narration: entry.narration,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debitPaise: l.debitPaise,
          creditPaise: l.creditPaise,
        })),
      });
      assertBalanced(reversal);
      reversalJournalEntryIds.push(
        await this.#insertJournal(
          { ...reversal, narration: `Cancelled: ${reason.trim()}` },
          {
            companyId,
            financialYear: entry.financialYear,
            docType,
            docId,
            reversesEntryId: entry.id,
          },
        ),
      );
    }

    // Stock movements → opposite-signed movements of the same type.
    const movements = await this.tx
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.sourceDocType, docType),
          eq(stockMovements.sourceDocId, docId),
          isNull(stockMovements.reversesMovementId),
        ),
      );
    const warnings = await this.#applyStockPolicy(
      company,
      movements.map((m) => ({ ...m, qtyX1000: -m.qtyX1000 })),
    );
    if (movements.length > 0) {
      await this.tx.insert(stockMovements).values(
        movements.map((m) => ({
          ...m,
          id: newId(),
          qtyX1000: -m.qtyX1000,
          reversesMovementId: m.id,
          createdAt: new Date(now),
          updatedAt: new Date(now),
          createdBy: this.actor.userId,
        })),
      );
    }

    // GST register → negated rows.
    const gstRows = await this.tx
      .select()
      .from(gstTransactions)
      .where(
        and(
          eq(gstTransactions.sourceDocType, docType),
          eq(gstTransactions.sourceDocId, docId),
          isNull(gstTransactions.reversesGstTransactionId),
        ),
      );
    if (gstRows.length > 0) {
      await this.tx.insert(gstTransactions).values(
        gstRows.map((g) => ({
          ...g,
          id: newId(),
          taxableValuePaise: -g.taxableValuePaise,
          cgstPaise: -g.cgstPaise,
          sgstPaise: -g.sgstPaise,
          igstPaise: -g.igstPaise,
          cessPaise: -g.cessPaise,
          reversesGstTransactionId: g.id,
          createdAt: new Date(now),
          updatedAt: new Date(now),
          createdBy: this.actor.userId,
        })),
      );
    }

    await this.#audit(
      companyId,
      'CANCEL',
      DOCUMENT_TABLES[docType],
      docId,
      { status: 'POSTED' },
      {
        status: 'CANCELLED',
        cancelReason: reason.trim(),
        reversalJournalEntryIds,
      },
    );

    return { docType, id: docId, reversalJournalEntryIds, warnings };
  }

  // ================= shared steps =================

  async #open(
    docType: SourceDocType,
    input: { companyId: string; seriesId: string; date: string; notes?: string },
  ) {
    assertIsoDate(input.date);
    const company = await this.#company(input.companyId);
    this.#assertPeriodOpen(company, input.date);
    const financialYear = financialYearOf(input.date, company.fyStartMonth);

    const [series] = await this.tx
      .select()
      .from(numberSeries)
      .where(eq(numberSeries.id, input.seriesId));
    if (!series || series.companyId !== company.id) {
      throw new DocumentValidationError(`Number series ${input.seriesId} not found.`);
    }
    if (series.docType !== docType) {
      throw new DocumentValidationError(
        `Series '${series.name}' is for ${series.docType}, not ${docType}.`,
      );
    }
    if (series.financialYear !== financialYear) {
      throw new DocumentValidationError(
        `Series '${series.name}' is for FY ${series.financialYear}, but ${input.date} is in FY ${financialYear}.`,
      );
    }
    const number = await allocateDocumentNumber(this.tx, series.id);
    const id = newId();
    return {
      company,
      number,
      id,
      ctx: { company, docType, id, number, date: input.date },
      header: {
        id,
        companyId: company.id,
        financialYear,
        seriesId: series.id,
        docNo: number.docNo,
        docNumber: number.docNumber,
        date: input.date,
        notes: orNull(input.notes),
        createdBy: this.actor.userId,
      },
    };
  }

  async #prepareTrade(docType: SourceDocType, input: TradeDocumentInput) {
    const o = await this.#open(docType, input);
    if (input.dueDate !== undefined) assertIsoDate(input.dueDate, 'due date');
    const party = await this.#party(o.company.id, input.partyId);
    const accounts = await this.#systemAccounts(o.company.id);
    const productMap = await this.#products(
      o.company.id,
      input.lines.map((l) => l.productId),
    );

    const lines: TradeLine[] = input.lines.map((l) => {
      const product = productMap.get(l.productId);
      if (!product) throw new DocumentValidationError(`Product ${l.productId} not found.`);
      return {
        id: newId(),
        productId: l.productId,
        trackInventory: product.trackInventory,
        hsnSac: l.hsnSac ?? product.hsnSac,
        qtyX1000: l.qtyX1000,
        ratePaise: l.ratePaise,
        taxableValuePaise: l.taxableValuePaise,
        cgstBp: l.cgstBp ?? 0,
        sgstBp: l.sgstBp ?? 0,
        igstBp: l.igstBp ?? 0,
        cessBp: l.cessBp ?? 0,
        cgstPaise: l.cgstPaise ?? 0,
        sgstPaise: l.sgstPaise ?? 0,
        igstPaise: l.igstPaise ?? 0,
        cessPaise: l.cessPaise ?? 0,
      };
    });
    this.#assertTaxRegime(input.igstApplicable, lines);

    const reverseCharge = input.reverseCharge ?? false;
    const doc: TradeDocument = {
      date: input.date,
      docNumber: o.number.docNumber,
      partyId: party.id,
      partyAccountId: party.accountId,
      partyGstin: party.gstin,
      placeOfSupply: input.placeOfSupply ?? party.stateCode ?? o.company.stateCode,
      reverseCharge,
      roundOffPaise: input.roundOffPaise ?? 0,
      lines,
    };
    const totals = tradeTotals(lines);

    return {
      company: o.company,
      accounts,
      doc,
      ctx: o.ctx,
      header: {
        ...o.header,
        partyId: party.id,
        partyName: party.name,
        partyGstin: party.gstin,
        partyStateCode: party.stateCode,
        billingAddress: party.billingAddress,
        shippingAddress: party.shippingAddress,
        placeOfSupply: doc.placeOfSupply,
        igstApplicable: input.igstApplicable,
        reverseCharge,
        dueDate: orNull(input.dueDate),
        discountTotalPaise: sumPaise(input.lines.map((l) => l.discountPaise ?? 0)),
        taxableTotalPaise: totals.taxablePaise,
        cgstTotalPaise: totals.cgstPaise,
        sgstTotalPaise: totals.sgstPaise,
        igstTotalPaise: totals.igstPaise,
        cessTotalPaise: totals.cessPaise,
        roundOffPaise: doc.roundOffPaise,
        grandTotalPaise: tradeGrandTotal(doc),
      },
      /** Item rows; `parent` supplies the FK column to the header. */
      items: <P extends object>(parent: (headerId: string) => P) =>
        lines.map((l, i) => {
          const src = input.lines[i];
          const product = productMap.get(l.productId);
          return {
            ...parent(o.id),
            id: l.id,
            companyId: o.company.id,
            financialYear: o.number.financialYear,
            lineNo: i + 1,
            productId: l.productId,
            description: orNull(src?.description),
            hsnSac: l.hsnSac,
            qtyX1000: l.qtyX1000,
            unitId: src?.unitId ?? product?.unitId ?? '',
            ratePaise: l.ratePaise,
            discountPaise: src?.discountPaise ?? 0,
            taxableValuePaise: l.taxableValuePaise,
            cgstBp: l.cgstBp,
            sgstBp: l.sgstBp,
            igstBp: l.igstBp,
            cessBp: l.cessBp,
            cgstPaise: l.cgstPaise,
            sgstPaise: l.sgstPaise,
            igstPaise: l.igstPaise,
            cessPaise: l.cessPaise,
            totalPaise: l.taxableValuePaise + l.cgstPaise + l.sgstPaise + l.igstPaise + l.cessPaise,
            createdBy: this.actor.userId,
          };
        }),
    };
  }

  async #postCashVoucher(
    docType: 'RECEIPT' | 'PAYMENT',
    input: CashVoucherInput,
  ): Promise<PostedDocument> {
    if ((input.partyId === undefined) === (input.counterAccountId === undefined)) {
      throw new DocumentValidationError('Give exactly one of partyId or counterAccountId.');
    }
    if (input.referenceDate !== undefined) assertIsoDate(input.referenceDate, 'reference date');
    const o = await this.#open(docType, input);
    const kind = await this.#cashOrBank(o.company.id, input.cashBankAccountId);
    this.#assertModeMatches(input.mode, kind);
    const counterAccountId =
      input.partyId === undefined
        ? (input.counterAccountId as string)
        : (await this.#party(o.company.id, input.partyId)).accountId;

    const doc = {
      date: input.date,
      docNumber: o.number.docNumber,
      cashBankAccountId: input.cashBankAccountId,
      counterAccountId,
      amountPaise: input.amountPaise,
      narration: orNull(input.notes),
    };
    const result = docType === 'RECEIPT' ? postReceipt(doc) : postPayment(doc);
    const header = {
      ...o.header,
      cashBankAccountId: input.cashBankAccountId,
      counterAccountId,
      partyId: orNull(input.partyId),
      amountPaise: input.amountPaise,
      mode: input.mode,
      referenceNo: orNull(input.referenceNo),
      referenceDate: orNull(input.referenceDate),
    };
    await this.tx.insert(docType === 'RECEIPT' ? receipts : payments).values(header);
    return this.#record(o.ctx, result, { header });
  }

  async #postStockDocument(
    kind: 'ADJUSTMENT' | 'OPENING',
    input: StockAdjustmentInput,
  ): Promise<PostedDocument> {
    if (!input.reason.trim()) throw new DocumentValidationError('A reason is required.');
    const o = await this.#open('STOCK_ADJUSTMENT', input);
    const productMap = await this.#products(
      o.company.id,
      input.lines.map((l) => l.productId),
    );
    const lines = input.lines.map((l) => {
      const product = productMap.get(l.productId);
      if (!product) throw new DocumentValidationError(`Product ${l.productId} not found.`);
      if (!product.trackInventory) {
        throw new DocumentValidationError(`Product '${product.name}' does not track inventory.`);
      }
      return { id: newId(), productId: l.productId, qtyX1000: l.qtyX1000, ratePaise: l.ratePaise };
    });
    const doc = {
      date: input.date,
      docNumber: o.number.docNumber,
      kind,
      reason: input.reason.trim(),
      lines,
    };
    const result =
      kind === 'OPENING'
        ? postOpeningStock(doc, await this.#systemAccounts(o.company.id))
        : postStockAdjustment(doc);
    const header = { ...o.header, kind, reason: doc.reason };
    await this.tx.insert(stockAdjustments).values(header);
    const items = lines.map((l, i) => ({
      ...l,
      companyId: o.company.id,
      financialYear: o.number.financialYear,
      adjustmentId: o.id,
      lineNo: i + 1,
      createdBy: this.actor.userId,
    }));
    await this.tx.insert(stockAdjustmentItems).values(items);
    return this.#record(o.ctx, result, { header, items });
  }

  /** Validates and writes everything a posting rule produced, then the audit log. */
  async #record(
    ctx: {
      company: Company;
      docType: SourceDocType;
      id: string;
      date: string;
      number: { docNo: number; docNumber: string; financialYear: string };
    },
    result: PostingResult,
    auditAfter: unknown,
  ): Promise<PostedDocument> {
    const { company, docType, id, date, number } = ctx;
    const base = {
      companyId: company.id,
      financialYear: number.financialYear,
      date,
      sourceDocType: docType,
      sourceDocId: id,
      createdBy: this.actor.userId,
    };

    let journalEntryId: string | null = null;
    if (result.journal && result.journal.lines.length > 0) {
      assertBalanced(result.journal);
      journalEntryId = await this.#insertJournal(result.journal, {
        companyId: company.id,
        financialYear: number.financialYear,
        docType,
        docId: id,
        reversesEntryId: null,
      });
    }

    const warnings = await this.#applyStockPolicy(company, result.stockMovements);
    if (result.stockMovements.length > 0) {
      await this.tx
        .insert(stockMovements)
        .values(result.stockMovements.map((m) => ({ ...base, ...m })));
    }
    if (result.gstTransactions.length > 0) {
      await this.tx
        .insert(gstTransactions)
        .values(result.gstTransactions.map((g) => ({ ...base, ...g })));
    }

    await this.#audit(company.id, 'CREATE', DOCUMENT_TABLES[docType], id, null, auditAfter);

    return {
      docType,
      id,
      docNo: number.docNo,
      docNumber: number.docNumber,
      financialYear: number.financialYear,
      journalEntryId,
      warnings,
    };
  }

  async #insertJournal(
    journal: Journal,
    link: {
      companyId: string;
      financialYear: string;
      docType: SourceDocType;
      docId: string;
      reversesEntryId: string | null;
    },
  ): Promise<string> {
    assertBalanced(journal);
    await this.#assertLedgers(
      link.companyId,
      journal.lines.map((l) => l.accountId),
    );
    const id = newId();
    await this.tx.insert(journalEntries).values({
      id,
      companyId: link.companyId,
      financialYear: link.financialYear,
      date: journal.date,
      voucherType: journal.voucherType,
      sourceDocType: link.docType,
      sourceDocId: link.docId,
      reversesEntryId: link.reversesEntryId,
      narration: journal.narration,
      createdBy: this.actor.userId,
    });
    await this.tx.insert(ledgerEntries).values(
      journal.lines.map((l, i) => ({
        companyId: link.companyId,
        financialYear: link.financialYear,
        journalEntryId: id,
        lineNo: i + 1,
        date: journal.date,
        accountId: l.accountId,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise,
        narration: l.narration ?? null,
        createdBy: this.actor.userId,
      })),
    );
    return id;
  }

  /** Enforces the company's negative stock policy for a set of signed movements. */
  async #applyStockPolicy(
    company: Company,
    drafts: readonly Pick<StockMovementDraft, 'productId' | 'qtyX1000'>[],
  ): Promise<PostingWarning[]> {
    if (company.negativeStockPolicy === 'ALLOW') return [];
    const delta = new Map<string, number>();
    for (const d of drafts) delta.set(d.productId, (delta.get(d.productId) ?? 0) + d.qtyX1000);
    const outward = [...delta].filter(([, q]) => q < 0).map(([p]) => p);
    if (outward.length === 0) return [];

    const current = new Map(
      (
        await this.tx
          .select({
            productId: stockMovements.productId,
            qty: sql<number>`coalesce(sum(${stockMovements.qtyX1000}), 0)`,
          })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.companyId, company.id),
              inArray(stockMovements.productId, outward),
            ),
          )
          .groupBy(stockMovements.productId)
      ).map((r) => [r.productId, r.qty]),
    );

    const shortfalls: StockShortfall[] = outward
      .map((productId) => {
        const available = current.get(productId) ?? 0;
        const requested = -(delta.get(productId) ?? 0);
        return {
          productId,
          availableQtyX1000: available,
          requestedQtyX1000: requested,
          resultingQtyX1000: available - requested,
        };
      })
      .filter((s) => s.resultingQtyX1000 < 0);

    if (shortfalls.length === 0) return [];
    if (company.negativeStockPolicy === 'BLOCK') throw new NegativeStockError(shortfalls);
    return [{ code: 'NEGATIVE_STOCK', shortfalls }];
  }

  async #audit(
    companyId: string,
    action: 'CREATE' | 'CANCEL',
    entity: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.tx.insert(auditLogs).values({
      companyId,
      userId: this.actor.userId,
      action,
      entity,
      entityId,
      beforeJson: before === null ? null : JSON.stringify(before),
      afterJson: JSON.stringify(after),
      createdBy: this.actor.userId,
    });
  }

  // ================= lookups & guards =================

  async #company(companyId: string): Promise<Company> {
    const [company] = await this.tx
      .select()
      .from(companies)
      .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)));
    if (!company) throw new DocumentNotFoundError(`Company ${companyId} not found.`);
    return company;
  }

  #assertPeriodOpen(company: Company, date: string): void {
    if (date < company.booksBeginDate) {
      throw new DocumentValidationError(
        `${date} is before the books begin (${company.booksBeginDate}).`,
      );
    }
    if (company.lockedUntil !== null && date <= company.lockedUntil) {
      throw new PeriodLockedError(date, company.lockedUntil);
    }
  }

  #assertTaxRegime(
    igstApplicable: boolean,
    lines: readonly { cgstPaise: number; sgstPaise: number; igstPaise: number }[],
  ): void {
    const bad = lines.findIndex((l) =>
      igstApplicable ? l.cgstPaise !== 0 || l.sgstPaise !== 0 : l.igstPaise !== 0,
    );
    if (bad >= 0) {
      throw new DocumentValidationError(
        `line ${bad + 1}: ${igstApplicable ? 'inter-state supplies carry IGST only' : 'intra-state supplies carry CGST + SGST only'}.`,
      );
    }
  }

  async #systemAccounts(companyId: string): Promise<SystemAccounts> {
    const rows = await this.tx
      .select({ code: accounts.systemCode, id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.companyId, companyId),
          isNotNull(accounts.systemCode),
          isNull(accounts.deletedAt),
        ),
      );
    const byCode = new Map(rows.map((r) => [r.code, r.id]));
    const missing = SYSTEM_ACCOUNT_CODES.filter((c) => !byCode.has(c));
    if (missing.length > 0) {
      throw new InvalidAccountError(
        `Chart of accounts is missing ${missing.join(', ')}; run seedCompanyDefaults().`,
      );
    }
    return Object.fromEntries(
      SYSTEM_ACCOUNT_CODES.map((c) => [c, byCode.get(c)]),
    ) as SystemAccounts;
  }

  /** Every posted account must be an active, non-group ledger of this company. */
  async #assertLedgers(companyId: string, ids: readonly string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await this.tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          inArray(accounts.id, unique),
          eq(accounts.companyId, companyId),
          eq(accounts.isGroup, false),
          eq(accounts.isActive, true),
          isNull(accounts.deletedAt),
        ),
      );
    const ok = new Set(found.map((r) => r.id));
    const bad = unique.filter((id) => !ok.has(id));
    if (bad.length > 0) {
      throw new InvalidAccountError(`Not a postable ledger of this company: ${bad.join(', ')}.`);
    }
  }

  /** CASH = the Cash ledger; BANK = a ledger under the Bank group. Anything else is rejected. */
  async #cashOrBank(companyId: string, accountId: string): Promise<'CASH' | 'BANK'> {
    const parent = alias(accounts, 'parent');
    const [row] = await this.tx
      .select({ code: accounts.systemCode, parentCode: parent.systemCode })
      .from(accounts)
      .leftJoin(parent, eq(accounts.parentId, parent.id))
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.companyId, companyId),
          eq(accounts.isGroup, false),
          isNull(accounts.deletedAt),
        ),
      );
    if (row?.code === 'CASH') return 'CASH';
    if (row?.parentCode === 'BANK') return 'BANK';
    throw new InvalidAccountError(`Account ${accountId} is not a cash or bank ledger.`);
  }

  #assertModeMatches(mode: PaymentMode, kind: 'CASH' | 'BANK'): void {
    if (CASH_MODES.includes(mode) && kind !== 'CASH') {
      throw new DocumentValidationError(`Mode ${mode} needs the Cash ledger.`);
    }
    if (BANK_MODES.includes(mode) && kind !== 'BANK') {
      throw new DocumentValidationError(`Mode ${mode} needs a bank ledger.`);
    }
  }

  async #party(companyId: string, partyId: string) {
    const [party] = await this.tx
      .select()
      .from(parties)
      .where(
        and(eq(parties.id, partyId), eq(parties.companyId, companyId), isNull(parties.deletedAt)),
      );
    if (!party) throw new DocumentValidationError(`Party ${partyId} not found.`);
    return party;
  }

  async #products(companyId: string, ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, typeof products.$inferSelect>();
    const rows = await this.tx
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, [...new Set(ids)]),
          eq(products.companyId, companyId),
          isNull(products.deletedAt),
        ),
      );
    return new Map(rows.map((r) => [r.id, r]));
  }

  async #assertOriginal(
    table: string,
    id: string,
    companyId: string,
    partyId: string,
  ): Promise<void> {
    const [row] = await this.tx.values<[string, string, string]>(
      sql`SELECT company_id, party_id, status FROM ${sql.identifier(table)} WHERE id = ${id}`,
    );
    if (!row || row[0] !== companyId)
      throw new DocumentValidationError(`Original invoice ${id} not found.`);
    if (row[1] !== partyId)
      throw new DocumentValidationError('Original invoice is for a different party.');
    if (row[2] !== 'POSTED') throw new DocumentValidationError('Original invoice is cancelled.');
  }
}
