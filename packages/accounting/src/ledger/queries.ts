import { accounts, type Db, journalEntries, ledgerEntries } from '@repo/database';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { assertIsoDate } from '../fiscal';

/*
 * Read-side ledger repository. All arithmetic happens in SQL over ledger_entries (the only
 * source of truth); cancellations are already netted out by their reversing entries.
 * Balances are signed debit-positive: balance = Σdebit − Σcredit.
 */

export interface Balance {
  readonly debitPaise: number;
  readonly creditPaise: number;
  /** Σdebit − Σcredit: positive = debit balance, negative = credit balance. */
  readonly balancePaise: number;
}

/**
 * Balance of an account as of a date (inclusive). For a group account, the total over every
 * ledger beneath it.
 */
export async function accountBalance(
  db: Db,
  q: { companyId: string; accountId: string; asOf: string },
): Promise<Balance> {
  assertIsoDate(q.asOf, 'asOf');
  const [row] = await db.values<[number, number]>(sql`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM accounts WHERE id = ${q.accountId} AND company_id = ${q.companyId}
      UNION ALL
      SELECT a.id FROM accounts a JOIN tree t ON a.parent_id = t.id
    )
    SELECT coalesce(sum(debit_paise), 0), coalesce(sum(credit_paise), 0)
    FROM ledger_entries
    WHERE company_id = ${q.companyId} AND date <= ${q.asOf}
      AND account_id IN (SELECT id FROM tree)`);
  const [debitPaise, creditPaise] = row ?? [0, 0];
  return { debitPaise, creditPaise, balancePaise: debitPaise - creditPaise };
}

export interface StatementLine {
  readonly date: string;
  readonly journalEntryId: string;
  readonly lineNo: number;
  readonly voucherType: string;
  readonly sourceDocType: string | null;
  readonly sourceDocId: string | null;
  readonly narration: string | null;
  readonly debitPaise: number;
  readonly creditPaise: number;
  /** Signed debit-positive balance after this line, including the opening balance. */
  readonly runningBalancePaise: number;
}

export interface LedgerStatement {
  readonly openingBalancePaise: number;
  readonly lines: readonly StatementLine[];
  readonly closingBalancePaise: number;
}

/** Ledger account statement for [from, to], with opening balance and running balance. */
export async function ledgerStatement(
  db: Db,
  q: { companyId: string; accountId: string; from: string; to: string },
): Promise<LedgerStatement> {
  assertIsoDate(q.from, 'from');
  assertIsoDate(q.to, 'to');
  const [opening] = await db.values<[number]>(sql`
    SELECT coalesce(sum(debit_paise - credit_paise), 0) FROM ledger_entries
    WHERE company_id = ${q.companyId} AND account_id = ${q.accountId} AND date < ${q.from}`);
  const openingBalancePaise = opening?.[0] ?? 0;

  const order = [asc(ledgerEntries.date), asc(ledgerEntries.journalEntryId), asc(ledgerEntries.lineNo)];
  const rows = await db
    .select({
      date: ledgerEntries.date,
      journalEntryId: ledgerEntries.journalEntryId,
      lineNo: ledgerEntries.lineNo,
      voucherType: journalEntries.voucherType,
      sourceDocType: journalEntries.sourceDocType,
      sourceDocId: journalEntries.sourceDocId,
      narration: sql<string | null>`coalesce(${ledgerEntries.narration}, ${journalEntries.narration})`,
      debitPaise: ledgerEntries.debitPaise,
      creditPaise: ledgerEntries.creditPaise,
      runningBalancePaise: sql<number>`${openingBalancePaise} + sum(${ledgerEntries.debitPaise} - ${ledgerEntries.creditPaise}) OVER (ORDER BY ${ledgerEntries.date}, ${ledgerEntries.journalEntryId}, ${ledgerEntries.lineNo} ROWS UNBOUNDED PRECEDING)`,
    })
    .from(ledgerEntries)
    .innerJoin(journalEntries, eq(journalEntries.id, ledgerEntries.journalEntryId))
    .where(
      and(
        eq(ledgerEntries.companyId, q.companyId),
        eq(ledgerEntries.accountId, q.accountId),
        gte(ledgerEntries.date, q.from),
        lte(ledgerEntries.date, q.to),
      ),
    )
    .orderBy(...order);

  return {
    openingBalancePaise,
    lines: rows,
    closingBalancePaise: rows.at(-1)?.runningBalancePaise ?? openingBalancePaise,
  };
}

export interface TrialBalanceRow {
  readonly accountId: string;
  readonly name: string;
  readonly nature: string;
  /** Closing balance on the side it falls: exactly one of these is non-zero. */
  readonly debitPaise: number;
  readonly creditPaise: number;
}

export interface TrialBalance {
  readonly asOf: string;
  readonly rows: readonly TrialBalanceRow[];
  readonly totalDebitPaise: number;
  readonly totalCreditPaise: number;
}

/** Closing balance of every ledger with a non-zero balance as of a date (inclusive). */
export async function trialBalance(
  db: Db,
  q: { companyId: string; asOf: string },
): Promise<TrialBalance> {
  assertIsoDate(q.asOf, 'asOf');
  const balance = sql<number>`sum(${ledgerEntries.debitPaise}) - sum(${ledgerEntries.creditPaise})`;
  const rows = await db
    .select({
      accountId: accounts.id,
      name: accounts.name,
      nature: accounts.nature,
      balance,
    })
    .from(ledgerEntries)
    .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
    .where(and(eq(ledgerEntries.companyId, q.companyId), lte(ledgerEntries.date, q.asOf)))
    .groupBy(accounts.id)
    .having(sql`${balance} <> 0`)
    .orderBy(accounts.nature, accounts.name);

  const out = rows.map(({ balance: b, ...r }) => ({
    ...r,
    debitPaise: b > 0 ? b : 0,
    creditPaise: b < 0 ? -b : 0,
  }));
  return {
    asOf: q.asOf,
    rows: out,
    totalDebitPaise: out.reduce((s, r) => s + r.debitPaise, 0),
    totalCreditPaise: out.reduce((s, r) => s + r.creditPaise, 0),
  };
}
