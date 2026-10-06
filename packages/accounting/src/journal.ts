import type { VoucherType } from '@repo/database';
import { UnbalancedJournalError } from './errors';
import { assertPaise, sumPaise } from './money';

export interface JournalLine {
  readonly accountId: string;
  readonly debitPaise: number;
  readonly creditPaise: number;
  readonly narration?: string;
}

export interface Journal {
  readonly voucherType: VoucherType;
  readonly date: string;
  readonly narration: string | null;
  readonly lines: readonly JournalLine[];
}

/**
 * Throws UnbalancedJournalError if Σdebit ≠ Σcredit, or if any line is two-sided, empty or
 * negative. Every posting path calls this before anything is written.
 */
export function assertBalanced(journal: Journal): void {
  journal.lines.forEach((line, i) => {
    assertPaise(line.debitPaise, `line ${i + 1} debit`);
    assertPaise(line.creditPaise, `line ${i + 1} credit`);
    if (line.debitPaise !== 0 && line.creditPaise !== 0) {
      throw new UnbalancedJournalError(
        `Line ${i + 1} has both a debit and a credit.`,
        line.debitPaise,
        line.creditPaise,
      );
    }
    if (line.debitPaise === 0 && line.creditPaise === 0) {
      throw new UnbalancedJournalError(`Line ${i + 1} is empty.`, 0, 0);
    }
  });
  const debit = sumPaise(journal.lines.map((l) => l.debitPaise));
  const credit = sumPaise(journal.lines.map((l) => l.creditPaise));
  if (debit !== credit) {
    throw new UnbalancedJournalError(
      `Journal does not balance: debit ${debit} ≠ credit ${credit} paise.`,
      debit,
      credit,
    );
  }
}

/** Exact mirror image: every debit becomes a credit and vice versa. */
export function reverseJournal(journal: Journal, voucherType = journal.voucherType): Journal {
  return {
    ...journal,
    voucherType,
    lines: journal.lines.map((l) => ({ ...l, debitPaise: l.creditPaise, creditPaise: l.debitPaise })),
  };
}

/**
 * Accumulates journal lines. Zero amounts are skipped; a negative amount posts to the opposite
 * side (so a signed round-off can be passed straight through). build() asserts balance.
 */
export class JournalBuilder {
  readonly #lines: JournalLine[] = [];

  constructor(
    private readonly voucherType: VoucherType,
    private readonly date: string,
    private readonly narration: string | null = null,
  ) {}

  debit(accountId: string, amountPaise: number, narration?: string): this {
    return this.#add(accountId, amountPaise, 0, narration);
  }

  credit(accountId: string, amountPaise: number, narration?: string): this {
    return this.#add(accountId, 0, amountPaise, narration);
  }

  /** Adds a line exactly as given, without normalising. Used for user-entered vouchers. */
  line(line: JournalLine): this {
    this.#lines.push(line);
    return this;
  }

  build(): Journal {
    const journal: Journal = {
      voucherType: this.voucherType,
      date: this.date,
      narration: this.narration,
      lines: [...this.#lines],
    };
    assertBalanced(journal);
    return journal;
  }

  #add(accountId: string, debit: number, credit: number, narration?: string): this {
    assertPaise(debit, 'debit', { allowNegative: true });
    assertPaise(credit, 'credit', { allowNegative: true });
    const net = debit - credit;
    if (net === 0) return this;
    this.#lines.push({
      accountId,
      debitPaise: net > 0 ? net : 0,
      creditPaise: net < 0 ? -net : 0,
      ...(narration === undefined ? {} : { narration }),
    });
    return this;
  }
}
