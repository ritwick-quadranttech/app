import type { DatabaseClient } from '@repo/database';
import { type Actor, PostingService } from './posting/service';

export * from './errors';
export { assertPaise, lineValuePaise, sumPaise } from './money';
export { assertIsoDate, financialYearOf } from './fiscal';
export { assertBalanced, type Journal, JournalBuilder, type JournalLine, reverseJournal } from './journal';
export * from './rules/types';
export {
  postPurchaseInvoice,
  postPurchaseReturn,
  postSalesInvoice,
  postSalesReturn,
  tradeGrandTotal,
  tradeTotals,
} from './rules/trade';
export { postContra, postExpense, postJournalVoucher, postPayment, postReceipt } from './rules/vouchers';
export { postOpeningStock, postStockAdjustment } from './rules/stock';
export * from './posting/inputs';
export {
  type Actor,
  type CancelledDocument,
  DOCUMENT_TABLES,
  type PostedDocument,
  PostingService,
  type PostingWarning,
} from './posting/service';
export * from './ledger/queries';
export * from './settings';

/** Runs `fn` with a PostingService bound to a fresh transaction: all of it commits, or none. */
export function withPosting<T>(
  client: DatabaseClient,
  actor: Actor,
  fn: (posting: PostingService) => Promise<T>,
): Promise<T> {
  return client.transaction((tx) => fn(new PostingService(tx, actor)));
}
