import { DocumentValidationError } from '../errors';
import { JournalBuilder } from '../journal';
import { assertPaise, lineValuePaise, sumPaise } from '../money';
import type { PostingResult, StockAdjustmentDocument, SystemAccounts } from './types';

function validate(doc: StockAdjustmentDocument): void {
  if (doc.lines.length === 0) throw new DocumentValidationError('At least one line is required.');
  doc.lines.forEach((l, i) => {
    if (!Number.isSafeInteger(l.qtyX1000) || l.qtyX1000 === 0) {
      throw new DocumentValidationError(`line ${i + 1}: quantity must be a non-zero integer (×1000).`);
    }
    if (doc.kind === 'OPENING' && l.qtyX1000 < 0) {
      throw new DocumentValidationError(`line ${i + 1}: opening stock cannot be negative.`);
    }
    assertPaise(l.ratePaise, `line ${i + 1} rate`);
  });
}

/**
 * Stock adjustment: quantity only. Under periodic inventory, the value effect shows up in
 * closing-stock valuation (Phase 8), so there is no journal.
 */
export function postStockAdjustment(doc: StockAdjustmentDocument): PostingResult {
  if (doc.kind !== 'ADJUSTMENT') throw new DocumentValidationError('Use postOpeningStock.');
  validate(doc);
  return {
    journal: null,
    stockMovements: doc.lines.map((l) => ({
      productId: l.productId,
      movementType: l.qtyX1000 > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      qtyX1000: l.qtyX1000,
      ratePaise: l.ratePaise,
      sourceLineId: l.id,
    })),
    gstTransactions: [],
  };
}

/** Opening stock:  Dr Stock-in-hand   Cr Capital   (Σ qty × rate). */
export function postOpeningStock(doc: StockAdjustmentDocument, acc: SystemAccounts): PostingResult {
  if (doc.kind !== 'OPENING') throw new DocumentValidationError('Use postStockAdjustment.');
  validate(doc);
  const value = sumPaise(doc.lines.map((l) => lineValuePaise(l.qtyX1000, l.ratePaise)));
  return {
    journal: new JournalBuilder('OPENING', doc.date, `Opening stock ${doc.docNumber}`)
      .debit(acc.STOCK_IN_HAND, value)
      .credit(acc.CAPITAL, value)
      .build(),
    stockMovements: doc.lines.map((l) => ({
      productId: l.productId,
      movementType: 'OPENING',
      qtyX1000: l.qtyX1000,
      ratePaise: l.ratePaise,
      sourceLineId: l.id,
    })),
    gstTransactions: [],
  };
}
