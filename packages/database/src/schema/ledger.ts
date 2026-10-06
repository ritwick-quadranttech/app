import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { SOURCE_DOC_TYPES, VOUCHER_TYPES } from './enums';
import { auditColumns, inList, isFinancialYear, isIsoDate, isoDate, paise, pk } from './columns';
import { companies } from './core';
import { accounts } from './masters';
import { numberSeries } from './numbering';

/**
 * A balanced double-entry voucher. Append-only: a cancellation posts a new entry with
 * `reverses_entry_id` pointing at the original. Balance (Σdebit = Σcredit) is enforced by the
 * accounting engine, since SQLite cannot express a cross-row CHECK.
 */
export const journalEntries = sqliteTable(
  'journal_entries',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    date: isoDate('date').notNull(),
    voucherType: text('voucher_type', { enum: VOUCHER_TYPES }).notNull(),
    /** Set for manually entered vouchers (JOURNAL / CONTRA / OPENING). */
    seriesId: text('series_id').references(() => numberSeries.id),
    docNo: integer('doc_no'),
    docNumber: text('doc_number'),
    /** Set for entries posted automatically from a document. */
    sourceDocType: text('source_doc_type', { enum: SOURCE_DOC_TYPES }),
    sourceDocId: text('source_doc_id'),
    reversesEntryId: text('reverses_entry_id').references((): AnySQLiteColumn => journalEntries.id),
    narration: text('narration'),
    ...auditColumns(),
  },
  (t) => [
    index('journal_entries_company_date_idx').on(t.companyId, t.date),
    index('journal_entries_series_id_idx').on(t.seriesId),
    index('journal_entries_source_idx').on(t.sourceDocType, t.sourceDocId),
    uniqueIndex('journal_entries_reverses_uq')
      .on(t.reversesEntryId)
      .where(sql`${t.reversesEntryId} IS NOT NULL`),
    uniqueIndex('journal_entries_doc_no_uq')
      .on(t.seriesId, t.financialYear, t.docNo)
      .where(sql`${t.seriesId} IS NOT NULL`),
    check('journal_entries_fy', isFinancialYear(t.financialYear)),
    check('journal_entries_date', isIsoDate(t.date)),
    check('journal_entries_voucher_type', inList(t.voucherType, VOUCHER_TYPES)),
    check(
      'journal_entries_source_doc_type',
      sql`${t.sourceDocType} IS NULL OR ${inList(t.sourceDocType, SOURCE_DOC_TYPES)}`,
    ),
    check(
      'journal_entries_source_pair',
      sql`(${t.sourceDocType} IS NULL) = (${t.sourceDocId} IS NULL)`,
    ),
    check(
      'journal_entries_numbering',
      sql`(${t.seriesId} IS NULL) = (${t.docNo} IS NULL) AND (${t.docNo} IS NULL) = (${t.docNumber} IS NULL)`,
    ),
    check(
      'journal_entries_origin',
      sql`${t.sourceDocType} IS NOT NULL OR ${t.seriesId} IS NOT NULL OR ${t.reversesEntryId} IS NOT NULL`,
    ),
  ],
);

/** One debit or credit line of a journal entry. Append-only. */
export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    journalEntryId: text('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id),
    lineNo: integer('line_no').notNull(),
    /** Denormalised from the journal entry for ledger / day-book queries. */
    date: isoDate('date').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    debitPaise: paise('debit_paise').notNull().default(0),
    creditPaise: paise('credit_paise').notNull().default(0),
    narration: text('narration'),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('ledger_entries_journal_line_uq').on(t.journalEntryId, t.lineNo),
    index('ledger_entries_account_date_idx').on(t.accountId, t.date),
    index('ledger_entries_company_date_idx').on(t.companyId, t.date),
    check('ledger_entries_fy', isFinancialYear(t.financialYear)),
    check('ledger_entries_date', isIsoDate(t.date)),
    check('ledger_entries_non_negative', sql`${t.debitPaise} >= 0 AND ${t.creditPaise} >= 0`),
    // Exactly one side is non-zero: a line can be neither both nor empty.
    check('ledger_entries_one_side', sql`(${t.debitPaise} = 0) <> (${t.creditPaise} = 0)`),
  ],
);
