# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline-first GST accounting / billing app for Indian trading businesses. It is a pnpm +
Turborepo monorepo: a Tauri 2 desktop app (React 19 + Vite) backed by a local SQLite database,
a Fastify server (licensing, backup, e-invoice, updates), and a React admin app. Work is
delivered in phases, listed in `docs/roadmap.md`. Architectural decisions live in
`docs/decisions/ADR-*.md`; read them before changing money handling or the schema.

See `AGENTS.md`: the installed `turbo` may differ from what you know, so check its bundled docs
(`node_modules/turbo/docs/`) before changing `turbo.json` or turbo commands.

## Commands

Node 22 (`.nvmrc`, `engine-strict=true`), pnpm 10. Run from the repo root unless noted.

```bash
pnpm install
pnpm lint            # turbo run lint (eslint per workspace, flat config at root)
pnpm typecheck       # tsc --noEmit per workspace
pnpm test            # vitest run per workspace
pnpm build
pnpm format          # prettier --write .  (format:check in CI style)

# One workspace
pnpm --filter @repo/accounting test
pnpm --filter @repo/database typecheck

# A single test file / test name (run inside the package's directory or via --filter)
pnpm --filter @repo/accounting exec vitest run src/posting/service.test.ts
pnpm --filter @repo/accounting exec vitest run -t "cancel posts exact reversals"

# Apps
pnpm --filter @repo/desktop tauri:dev   # desktop app (Vite on fixed port 1420)
pnpm --filter @repo/server dev          # Fastify with tsx watch (PORT/HOST env, default 3000)
pnpm --filter @repo/admin dev
```

CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test`, then
`pnpm --filter @repo/database db:check`. Run all four before calling work done.

### Database migrations (`packages/database`)

- `db:generate` — drizzle-kit generate from `src/schema/`, post-process, then embed the SQL into
  `src/migrations/generated.ts`.
- `db:generate:custom` — empty custom migration for hand-written SQL (triggers etc.).
- `db:triggers` — writes a migration that drops/recreates every trigger in `src/schema/triggers.ts`.
  **Required after any migration that rebuilds a table** (drizzle-kit silently drops triggers on
  table rebuilds, e.g. when a CHECK changes).
- `db:embed` / `db:check` — re-embed, or verify migrations and `generated.ts` match the schema.
  A test also fails if `generated.ts` is stale.

Never edit an applied migration file: `migrate()` stores a sha256 per migration and rejects edits.

## Layout

- `apps/desktop` — Tauri 2 shell (`src-tauri/`, Rust) + React UI (`src/`). The Rust side is
  still the default scaffold; the DB bridge is Phase 4.
- `apps/server` — Fastify; `buildApp()` in `src/app.ts` is separate from `src/index.ts` so tests
  use `app.inject()`. Server imports use `.js` extensions (compiled with `tsc`).
- `apps/admin` — React admin (Phase 14, scaffold only).
- `packages/database` (`@repo/database`) — drizzle schema, migrations, client, seed, numbering.
- `packages/accounting` (`@repo/accounting`) — posting engine, ledger queries.
- `packages/gst-engine`, `invoice`, `shared`, `types`, `validation` — placeholders for later phases.

Internal packages export TypeScript source directly (`"exports": "./src/index.ts"`); there is no
build step for them. The `@repo/*` scope is provisional.

## Architecture

### Money (ADR-001)

All money is an **integer number of paise** everywhere — DB, IPC, APIs, documents. Anything that
can produce a fractional paisa uses `decimal.js` and rounds only at explicit points. Use the
helpers in `packages/accounting/src/money.ts` (`assertPaise`, `sumPaise`, `lineValuePaise`);
ad-hoc `number` maths on amounts is a review blocker. Rounding rules (mode, per-line vs
per-invoice, CGST/SGST odd paisa, round-off) are deferred to Phase 1 `gst-engine`; current
half-up rounding in `lineValuePaise` is marked provisional.

### Database layer (ADR-002)

- **Injected executor.** `createDatabaseClient(executor)` wraps drizzle's `sqlite-proxy`. A driver
  only implements `SqlExecutor.execute(sql, params, method)` returning positional rows. Tests and
  tooling use `@repo/database/better-sqlite3`; the desktop will use a Tauri IPC executor (Phase 4:
  one connection, `PRAGMA foreign_keys = ON`, SQLite ≥ 3.35).
- **Transactions are serialised** by an async mutex and use `BEGIN IMMEDIATE`. Inside
  `client.transaction(tx => …)` use only `tx` — touching `client.db` or nesting
  `client.transaction` deadlocks.
- **Integrity lives in SQLite**, not just TypeScript: enums are TEXT + CHECK, no
  `ON DELETE CASCADE`, and triggers (single source: `src/schema/triggers.ts`) make
  `journal_entries`, `ledger_entries`, `stock_movements`, `gst_transactions`, `audit_logs`
  append-only, forbid deleting documents/line items, make `CANCELLED` final, and keep
  `number_series.next_no` forward-only. `schema/integrity.test.ts` checks every trigger exists.
- **Corrections are reversals.** Cancelling a document posts mirror-image rows linked by
  `reverses_entry_id` / `reverses_movement_id` / `reverses_gst_transaction_id`.
- **Conventions:** ULID text PKs generated in TS (`newId`); `created_at`/`updated_at` epoch ms and
  `created_by` on every table; unit suffixes in column names (`*_paise`, `*_bp` basis points,
  `qty_x1000`); business dates `TEXT 'YYYY-MM-DD'`, financial year `'YYYY-YY'`; soft delete
  (`deleted_at`) on masters only; financial tables (including line items) carry `company_id` and
  `financial_year`. Current stock is the `product_stock` view, never a stored column.
- **Gap-free numbering:** `allocateDocumentNumber(tx, seriesId)` must run in the same
  transaction as the document insert so a failed insert also rolls back the number.
- `migrate(client)` applies pending migrations in one transaction, defers FK checks and verifies
  them with `foreign_key_check`, and refuses databases written by a newer build.
- `seedCompanyDefaults` creates the default chart of accounts (with `system_code`s) and units.

### Accounting engine (`packages/accounting`)

- **Rules are pure** (`src/rules/trade.ts`, `vouchers.ts`, `stock.ts`): document in →
  `PostingResult` out (balanced `Journal`, stock movement drafts, GST register drafts). They post
  to accounts by `SYSTEM_ACCOUNT_CODES` (`src/rules/types.ts`) resolved per company.
- **`PostingService`** (`src/posting/service.ts`) does all writes for a document — header, items,
  number allocation, journal + ledger lines, stock movements, GST rows, audit log — on one `tx`
  handle. It never opens/commits a transaction; call it through `withPosting(client, actor, fn)`
  or inside `client.transaction`. `cancel(docType, id, reason)` writes reversals.
- Every journal passes `assertBalanced` (Σdebit = Σcredit, one-sided non-zero lines) before it is
  written; the DB only enforces per-line rules.
- Inventory is accounted **periodically**: purchases debit Purchase, sales credit Sales; stock is
  valued at period end (Phase 8). Line tax amounts arrive pre-computed and are posted as given.
- Per-company controls (`src/settings.ts`): `negativeStockPolicy` and `lockedUntil` (no posting or
  cancelling on/before that date). Changes are audit-logged.
- Ledger reads: `accountBalance`, `ledgerStatement`, `trialBalance` (`src/ledger/queries.ts`).
- Tests build a migrated in-memory DB with seeded masters via `src/test/world.ts`; the
  trial-balance test is property-based (`fast-check`).

### UI boundary (enforced by ESLint)

`.tsx` files may not import `@repo/database`, drizzle, better-sqlite3, `@tauri-apps/plugin-sql`
etc., nor contain SQL literals or `sql\`` templates. React components reach data through the Tauri
DB bridge / hooks only.

## TypeScript & style

`tsconfig.base.json` is strict plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature` (use `process.env['X']`), and `verbatimModuleSyntax`
(use `import type`). Prettier: single quotes, semicolons, trailing commas, width 100.

## Provisional / known gaps

- The original product spec (meant to be this file) was never in the repo. The table list,
  every enum in `packages/database/src/schema/enums.ts` (notably `STOCK_MOVEMENT_TYPES`), the
  `@repo/*` scope and the Tauri identifier (`com.example.desktop`) were inferred — see ADR-002.
  If the spec turns up, reconcile these first; nothing has shipped, so regenerating migrations
  from scratch is acceptable.
- ADR-002's table list predates later additions (`contra_vouchers`, `expenses`,
  `journal_vouchers`, `gst_transactions`); the schema in `src/schema/` is authoritative.
- Phase 3 (`packages/accounting`) is implemented and marked Done in `docs/roadmap.md`.
