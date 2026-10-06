import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  sqliteView,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  INWARD_MOVEMENT_TYPES,
  SOURCE_DOC_TYPES,
  STOCK_ADJUSTMENT_KINDS,
  STOCK_MOVEMENT_TYPES,
} from './enums';
import {
  auditColumns,
  inList,
  isFinancialYear,
  isIsoDate,
  isoDate,
  paise,
  pk,
  qtyX1000,
} from './columns';
import { companies } from './core';
import { documentColumns, documentConstraints } from './documents';
import { products } from './masters';

/** Manual stock corrections (kind ADJUSTMENT) and opening stock (kind OPENING). */
export const stockAdjustments = sqliteTable(
  'stock_adjustments',
  {
    ...documentColumns(),
    kind: text('kind', { enum: STOCK_ADJUSTMENT_KINDS }).notNull().default('ADJUSTMENT'),
    reason: text('reason').notNull(),
  },
  (t) => [
    ...documentConstraints('stock_adjustments', t),
    check('stock_adjustments_kind', inList(t.kind, STOCK_ADJUSTMENT_KINDS)),
  ],
);

export const stockAdjustmentItems = sqliteTable(
  'stock_adjustment_items',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    adjustmentId: text('adjustment_id')
      .notNull()
      .references(() => stockAdjustments.id),
    lineNo: integer('line_no').notNull(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    /** Signed: positive adds stock, negative removes it. */
    qtyX1000: qtyX1000('qty_x1000').notNull(),
    ratePaise: paise('rate_paise').notNull(),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('stock_adjustment_items_parent_line_uq').on(t.adjustmentId, t.lineNo),
    index('stock_adjustment_items_company_id_idx').on(t.companyId, t.financialYear),
    index('stock_adjustment_items_product_id_idx').on(t.productId),
    check('stock_adjustment_items_fy', isFinancialYear(t.financialYear)),
    check('stock_adjustment_items_qty', sql`${t.qtyX1000} <> 0`),
    check('stock_adjustment_items_rate', sql`${t.ratePaise} >= 0`),
  ],
);

/**
 * The stock ledger. Append-only; current stock is SUM(qty_x1000) (see product_stock).
 * A cancelled document posts opposite-signed movements with `reverses_movement_id` set.
 */
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: pk(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id),
    financialYear: text('financial_year').notNull(),
    date: isoDate('date').notNull(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    movementType: text('movement_type', { enum: STOCK_MOVEMENT_TYPES }).notNull(),
    /** Signed quantity × 1000: positive in, negative out. */
    qtyX1000: qtyX1000('qty_x1000').notNull(),
    /** Unit rate (cost for inward, sale rate for outward). */
    ratePaise: paise('rate_paise').notNull(),
    sourceDocType: text('source_doc_type', { enum: SOURCE_DOC_TYPES }).notNull(),
    sourceDocId: text('source_doc_id').notNull(),
    sourceLineId: text('source_line_id'),
    reversesMovementId: text('reverses_movement_id').references(
      (): AnySQLiteColumn => stockMovements.id,
    ),
    ...auditColumns(),
  },
  (t) => [
    index('stock_movements_company_date_idx').on(t.companyId, t.date),
    index('stock_movements_product_date_idx').on(t.productId, t.date),
    index('stock_movements_source_idx').on(t.sourceDocType, t.sourceDocId),
    uniqueIndex('stock_movements_reverses_uq')
      .on(t.reversesMovementId)
      .where(sql`${t.reversesMovementId} IS NOT NULL`),
    check('stock_movements_fy', isFinancialYear(t.financialYear)),
    check('stock_movements_date', isIsoDate(t.date)),
    check('stock_movements_type', inList(t.movementType, STOCK_MOVEMENT_TYPES)),
    check('stock_movements_source_doc_type', inList(t.sourceDocType, SOURCE_DOC_TYPES)),
    check('stock_movements_rate', sql`${t.ratePaise} >= 0`),
    // Inward types add stock, outward types remove it; a reversal flips the sign.
    check(
      'stock_movements_sign',
      sql`${t.qtyX1000} <> 0 AND ((${inList(t.movementType, INWARD_MOVEMENT_TYPES)}) = (${t.qtyX1000} > 0)) = (${t.reversesMovementId} IS NULL)`,
    ),
  ],
);

/** Current stock per product: an aggregate over the stock ledger, never a stored column. */
export const productStock = sqliteView('product_stock').as((qb) =>
  qb
    .select({
      companyId: stockMovements.companyId,
      productId: stockMovements.productId,
      qtyX1000: sql<number>`coalesce(sum(${stockMovements.qtyX1000}), 0)`.as('qty_x1000'),
    })
    .from(stockMovements)
    .groupBy(stockMovements.companyId, stockMovements.productId),
);
