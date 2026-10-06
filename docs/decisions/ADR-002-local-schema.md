# ADR-002: Local database schema (Phase 2)

- **Status:** Accepted — table list and enums **provisional** (see below)
- **Date:** 2026-10-06

## Provisional: written without the spec

CLAUDE.md (LOCAL DATABASE section) was not in the repository when Phase 2 was built. The table
list and every enum in `packages/database/src/schema/enums.ts` were inferred for an Indian GST
trading business. **Reconcile against the spec before Phase 3**, in particular:

- `STOCK_MOVEMENT_TYPES` (the spec says to copy its list exactly). Current values:
  `OPENING, PURCHASE, PURCHASE_RETURN, SALE, SALE_RETURN, ADJUSTMENT_IN, ADJUSTMENT_OUT`.
- Whether tables in the spec are missing here (e.g. godowns/warehouses, batches, price lists,
  sync metadata) or present here but not in the spec.

Nothing has shipped, so changes are cheap: edit the schema, delete `migrations/`, and regenerate.

## Tables (30 tables + 1 view)

| Area        | Tables                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------- |
| System      | `companies`, `financial_years`, `users`, `app_settings`, `audit_logs`, `schema_migrations`   |
| Masters     | `accounts` (groups + ledgers), `parties`, `units`, `tax_categories`, `tax_rates`, `products` |
| Numbering   | `number_series`                                                                              |
| Sales       | `sales_invoices`, `sales_invoice_items`, `sales_returns`, `sales_return_items`               |
| Purchases   | `purchase_invoices`, `purchase_invoice_items`, `purchase_returns`, `purchase_return_items`   |
| Cash / bank | `receipts`, `payments`, `bill_allocations`                                                   |
| Inventory   | `stock_adjustments`, `stock_adjustment_items`, `stock_movements`, view `product_stock`       |
| Ledger      | `journal_entries`, `ledger_entries`                                                          |
| GST e-docs  | `einvoices`, `ewaybills`                                                                     |

## Conventions

- **Keys:** ULID `TEXT` primary keys, generated in TypeScript.
- **Columns everywhere:** `created_at`, `updated_at` (epoch ms), `created_by` (user id or `'system'`).
- **Units in column names:** `*_paise` (money, ADR-001), `*_bp` (basis points), `qty_x1000`.
- **Dates:** business dates are `TEXT 'YYYY-MM-DD'`; FY is `TEXT 'YYYY-YY'`. Both CHECKed.
- **Soft delete (`deleted_at`):** masters only. Uniqueness on masters ignores deleted rows.
- **Financial tables** all carry `company_id` and `financial_year`, line items included.
- **Enums:** stored as TEXT and enforced with CHECK constraints (not only in TypeScript).
- **No `ON DELETE CASCADE`** anywhere.

## Integrity enforced by the database

- **No deletes** of documents, line items, allocations or e-docs (triggers). Documents move to
  `CANCELLED`, which needs a reason, timestamp and user, and is final (trigger).
- **Append-only:** `journal_entries`, `ledger_entries`, `stock_movements`, `audit_logs` (triggers).
  Cancellation posts reversing rows (`reverses_entry_id` / `reverses_movement_id`, each reversible
  once).
- **Ledger lines:** debit ≥ 0, credit ≥ 0, exactly one non-zero. Σdebit = Σcredit per entry is a
  cross-row rule and belongs to the accounting engine (Phase 3).
- **Stock sign:** inward types are positive and outward types negative, flipped for reversals.
  Current stock is the `product_stock` view, never a stored column.
- **Document totals:** `grand = taxable + CGST + SGST + IGST + cess + round_off`, and either IGST
  or CGST+SGST, never both. Line `total = taxable + taxes`. (Rounding of the parts is Phase 1.)
- **Numbering:** unique `(series_id, financial_year, doc_no)` and `(company_id, financial_year,
doc_number)`. `number_series.next_no` can only move forward (trigger).

## Gap-free numbering

`allocateDocumentNumber(tx, seriesId)` is a single `UPDATE … SET next_no = next_no + 1 RETURNING`.
Called inside the same transaction as the document insert, a failed insert rolls the number
back as well. Transactions are `BEGIN IMMEDIATE`, so the write lock is taken up front.

## Injected client

`createDatabaseClient(executor)` takes a `SqlExecutor` with one method,
`execute(sql, params, method)`. That is drizzle's `sqlite-proxy` contract: rows come back as
arrays of column values. Repositories depend only on `DatabaseClient` / `Db`.

drizzle's proxy runs `BEGIN`/`COMMIT` as ordinary calls, so over a single connection a
concurrent caller could slip a statement into someone else's transaction. The client therefore
holds an async lock for the whole of `transaction()`, and standalone `db` queries wait for it.
Consequence: inside `transaction(fn)` use only `tx`, never `client.db` (it would deadlock).

**Requirements for the Phase 4 Tauri executor:** one SQLite connection; `PRAGMA foreign_keys = ON`
at open; return positional rows (`all`/`values` → `unknown[][]`, `get` → `unknown[] | undefined`);
SQLite ≥ 3.35 (`RETURNING`).

## Migrations

- `pnpm --filter @repo/database db:generate` runs drizzle-kit, then embeds `migrations/*.sql`
  into `src/migrations/generated.ts` (sha256 per file) so the desktop bundle carries them.
- Triggers and other hand-written SQL go in custom migrations (`db:generate:custom`).
- `migrate(client)` applies all pending migrations in **one** transaction, records them in
  `schema_migrations`, and sets `app_settings.schema_version`. It rejects edited migrations
  (hash mismatch) and databases written by a newer build. FK checks are deferred to commit
  (`PRAGMA foreign_keys` can't change inside a transaction) and verified with
  `foreign_key_check`.
- A test fails if `generated.ts` is stale; CI also runs `db:check`.
