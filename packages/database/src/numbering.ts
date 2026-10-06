import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { numberSeries } from './schema';

export class NumberSeriesError extends Error {
  override name = 'NumberSeriesError';
}

export interface AllocatedNumber {
  readonly docNo: number;
  /** As printed: prefix + zero-padded number + suffix. */
  readonly docNumber: string;
  readonly financialYear: string;
}

export function formatDocNumber(
  series: { prefix: string; suffix: string; padWidth: number },
  docNo: number,
): string {
  return `${series.prefix}${String(docNo).padStart(series.padWidth, '0')}${series.suffix}`;
}

/**
 * Takes the next number from a series. MUST be called with the `tx` of the transaction that
 * inserts the document: if that insert fails, the rollback also returns the number, so the
 * series stays gap-free. The single UPDATE … RETURNING is atomic, so two allocations can never
 * observe the same next_no.
 */
export async function allocateDocumentNumber(tx: Db, seriesId: string): Promise<AllocatedNumber> {
  const [row] = await tx
    .update(numberSeries)
    .set({ nextNo: sql`${numberSeries.nextNo} + 1` })
    .where(and(eq(numberSeries.id, seriesId), eq(numberSeries.isActive, true)))
    .returning({
      allocated: sql<number>`${numberSeries.nextNo} - 1`,
      prefix: numberSeries.prefix,
      suffix: numberSeries.suffix,
      padWidth: numberSeries.padWidth,
      financialYear: numberSeries.financialYear,
    });

  if (!row) throw new NumberSeriesError(`Number series ${seriesId} not found or inactive.`);

  return {
    docNo: row.allocated,
    docNumber: formatDocNumber(row, row.allocated),
    financialYear: row.financialYear,
  };
}
