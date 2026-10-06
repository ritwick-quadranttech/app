# Phase 4 Crash Resilience & Batch Atomicity Test

This test verifies SQLite transaction atomicity when the Tauri application is abruptly terminated (e.g. process killed, power cut, panic) mid-batch.

---

## Architecture Context
In Phase 4, write atomicity is preserved through two guarantees:
1. **TypeScript Side**: Statements are buffered inside a `UnitOfWork` during the transaction lifecycle and dispatched to Rust in a single IPC call: `db_execute_batch(statements)`.
2. **Rust / SQLite Side**: All statements inside `db_execute_batch` are executed within a native SQLite `BEGIN IMMEDIATE ... COMMIT` block. SQLite is opened in **WAL mode** (`PRAGMA journal_mode = WAL`) with `PRAGMA foreign_keys = ON`.
3. If the process is killed at any point prior to SQLite `COMMIT`:
   - Either the batch never began writing to the SQLite write-ahead log.
   - Or uncommitted frames in the WAL file (`.sqlite-wal`) are discarded/rolled back upon reconnection. Zero partial records ever appear in the database.

---

## Step-by-Step Test Procedure

### 1. Preparation
1. Start the application:
   ```bash
   pnpm --filter @repo/desktop tauri:dev
   ```
2. Create or open a company (e.g. `Universal Trading Co.`).
3. Locate the company's database in AppData:
   - Windows: `%APPDATA%\com.example.desktop\companies\<company_id>.sqlite`
   - Linux: `~/.local/share/com.example.desktop/companies/<company_id>.sqlite`
   - macOS: `~/Library/Application Support/com.example.desktop/companies/<company_id>.sqlite`

### 2. Verify Baseline State
Open SQLite CLI against the company database file:
```bash
sqlite3 "<path_to_company>.sqlite" "SELECT count(*) FROM journal_entries; SELECT count(*) FROM ledger_entries;"
```
Note the baseline counts (e.g. `0` and `0`, or `N` and `M`).

### 3. Simulate Abrupt Kill Mid-Batch
We simulate an abrupt kill during batch execution:
1. Initiate a multi-row posting batch (e.g. click **"Post Test Journal Voucher"** in the UI or run a large multi-line posting).
2. Kill the process immediately via terminal:
   - **Windows PowerShell**:
     ```powershell
     Stop-Process -Name "desktop" -Force
     ```
   - **Linux / macOS**:
     ```bash
     pkill -9 desktop
     ```

### 4. Verify Database Integrity After Crash
Re-open the SQLite database using SQLite CLI (which forces SQLite WAL recovery / rollback check):
```bash
sqlite3 "<path_to_company>.sqlite" "PRAGMA integrity_check;"
sqlite3 "<path_to_company>.sqlite" "PRAGMA foreign_key_check;"
sqlite3 "<path_to_company>.sqlite" "SELECT count(*) FROM journal_entries; SELECT count(*) FROM ledger_entries;"
```

### 5. Expected Results
- `PRAGMA integrity_check` returns `ok`.
- `PRAGMA foreign_key_check` returns zero violations.
- The row counts for `journal_entries` and `ledger_entries` match the **baseline counts exactly**.
- No orphaned `journal_entries` exist without their corresponding `ledger_entries`.
- `number_series.next_no` was rolled back to its previous value, ensuring sequence gap-free continuity.
