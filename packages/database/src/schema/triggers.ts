/**
 * Every trigger the schema relies on, in one place. drizzle-kit neither knows about triggers nor
 * preserves them: rebuilding a table (to change a CHECK) silently drops its triggers. Whenever a
 * migration rebuilds a table, follow it with a custom migration whose body is
 * renderTriggerMigration() (scripts/write-trigger-migration.ts does this).
 * schema/integrity.test.ts fails if any trigger listed here is missing from a migrated database.
 */

/** Ledgers and logs: no UPDATE, no DELETE. */
export const APPEND_ONLY_TABLES = [
  'audit_logs',
  'journal_entries',
  'ledger_entries',
  'stock_movements',
  'gst_transactions',
] as const;

/** Document headers: never deleted; CANCELLED is final. */
export const DOCUMENT_TABLES = [
  'sales_invoices',
  'sales_returns',
  'purchase_invoices',
  'purchase_returns',
  'receipts',
  'payments',
  'contra_vouchers',
  'expenses',
  'journal_vouchers',
  'stock_adjustments',
] as const;

/** Never deleted. */
export const NO_DELETE_TABLES = [
  ...DOCUMENT_TABLES,
  'sales_invoice_items',
  'sales_return_items',
  'purchase_invoice_items',
  'purchase_return_items',
  'expense_items',
  'journal_voucher_lines',
  'stock_adjustment_items',
  'bill_allocations',
  'einvoices',
  'ewaybills',
  'number_series',
] as const;

export interface TriggerDefinition {
  readonly name: string;
  readonly table: string;
  readonly sql: string;
}

const abort = (message: string) => `BEGIN SELECT RAISE(ABORT, '${message}'); END`;

export const TRIGGERS: readonly TriggerDefinition[] = [
  ...APPEND_ONLY_TABLES.flatMap((table) => [
    {
      name: `${table}_no_update`,
      table,
      sql: `BEFORE UPDATE ON \`${table}\` ${abort(`${table} is append-only`)}`,
    },
    {
      name: `${table}_no_delete`,
      table,
      sql: `BEFORE DELETE ON \`${table}\` ${abort(`${table} is append-only`)}`,
    },
  ]),
  ...NO_DELETE_TABLES.map((table) => ({
    name: `${table}_no_delete`,
    table,
    sql: `BEFORE DELETE ON \`${table}\` ${abort(`${table} rows cannot be deleted; cancel the document instead`)}`,
  })),
  ...DOCUMENT_TABLES.map((table) => ({
    name: `${table}_cancel_is_final`,
    table,
    sql: `BEFORE UPDATE ON \`${table}\` WHEN OLD.status = 'CANCELLED' ${abort(`${table}: a cancelled document cannot be modified`)}`,
  })),
  {
    name: 'number_series_forward_only',
    table: 'number_series',
    sql: `BEFORE UPDATE OF next_no ON \`number_series\` WHEN NEW.next_no < OLD.next_no ${abort('number_series.next_no cannot move backwards')}`,
  },
];

/** Drops and recreates every trigger, so it is correct whatever tables were rebuilt before it. */
export function renderTriggerMigration(): string {
  return `${TRIGGERS.flatMap((t) => [
    `DROP TRIGGER IF EXISTS \`${t.name}\`;`,
    `CREATE TRIGGER \`${t.name}\` ${t.sql};`,
  ]).join('\n--> statement-breakpoint\n')}\n`;
}
