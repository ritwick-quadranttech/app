-- Append-only ledgers and logs: no UPDATE, no DELETE.
--> statement-breakpoint
CREATE TRIGGER `audit_logs_no_update` BEFORE UPDATE ON `audit_logs` BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_logs_no_delete` BEFORE DELETE ON `audit_logs` BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `journal_entries_no_update` BEFORE UPDATE ON `journal_entries` BEGIN SELECT RAISE(ABORT, 'journal_entries is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `journal_entries_no_delete` BEFORE DELETE ON `journal_entries` BEGIN SELECT RAISE(ABORT, 'journal_entries is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_no_update` BEFORE UPDATE ON `ledger_entries` BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_no_delete` BEFORE DELETE ON `ledger_entries` BEGIN SELECT RAISE(ABORT, 'ledger_entries is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `stock_movements_no_update` BEFORE UPDATE ON `stock_movements` BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `stock_movements_no_delete` BEFORE DELETE ON `stock_movements` BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
--> statement-breakpoint
-- Financial records are never deleted; documents are CANCELLED with reversing entries.
--> statement-breakpoint
CREATE TRIGGER `sales_invoices_no_delete` BEFORE DELETE ON `sales_invoices` BEGIN SELECT RAISE(ABORT, 'sales_invoices rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `sales_returns_no_delete` BEFORE DELETE ON `sales_returns` BEGIN SELECT RAISE(ABORT, 'sales_returns rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_invoices_no_delete` BEFORE DELETE ON `purchase_invoices` BEGIN SELECT RAISE(ABORT, 'purchase_invoices rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_returns_no_delete` BEFORE DELETE ON `purchase_returns` BEGIN SELECT RAISE(ABORT, 'purchase_returns rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `receipts_no_delete` BEFORE DELETE ON `receipts` BEGIN SELECT RAISE(ABORT, 'receipts rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_no_delete` BEFORE DELETE ON `payments` BEGIN SELECT RAISE(ABORT, 'payments rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `stock_adjustments_no_delete` BEFORE DELETE ON `stock_adjustments` BEGIN SELECT RAISE(ABORT, 'stock_adjustments rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `sales_invoice_items_no_delete` BEFORE DELETE ON `sales_invoice_items` BEGIN SELECT RAISE(ABORT, 'sales_invoice_items rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `sales_return_items_no_delete` BEFORE DELETE ON `sales_return_items` BEGIN SELECT RAISE(ABORT, 'sales_return_items rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_invoice_items_no_delete` BEFORE DELETE ON `purchase_invoice_items` BEGIN SELECT RAISE(ABORT, 'purchase_invoice_items rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_return_items_no_delete` BEFORE DELETE ON `purchase_return_items` BEGIN SELECT RAISE(ABORT, 'purchase_return_items rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `stock_adjustment_items_no_delete` BEFORE DELETE ON `stock_adjustment_items` BEGIN SELECT RAISE(ABORT, 'stock_adjustment_items rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `bill_allocations_no_delete` BEFORE DELETE ON `bill_allocations` BEGIN SELECT RAISE(ABORT, 'bill_allocations rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `einvoices_no_delete` BEFORE DELETE ON `einvoices` BEGIN SELECT RAISE(ABORT, 'einvoices rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `ewaybills_no_delete` BEFORE DELETE ON `ewaybills` BEGIN SELECT RAISE(ABORT, 'ewaybills rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
CREATE TRIGGER `number_series_no_delete` BEFORE DELETE ON `number_series` BEGIN SELECT RAISE(ABORT, 'number_series rows cannot be deleted; cancel the document instead'); END;
--> statement-breakpoint
-- Cancellation is final.
--> statement-breakpoint
CREATE TRIGGER `sales_invoices_cancel_is_final` BEFORE UPDATE ON `sales_invoices` WHEN OLD.status = 'CANCELLED' BEGIN SELECT RAISE(ABORT, 'sales_invoices: a cancelled document cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER `sales_returns_cancel_is_final` BEFORE UPDATE ON `sales_returns` WHEN OLD.status = 'CANCELLED' BEGIN SELECT RAISE(ABORT, 'sales_returns: a cancelled document cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_invoices_cancel_is_final` BEFORE UPDATE ON `purchase_invoices` WHEN OLD.status = 'CANCELLED' BEGIN SELECT RAISE(ABORT, 'purchase_invoices: a cancelled document cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER `purchase_returns_cancel_is_final` BEFORE UPDATE ON `purchase_returns` WHEN OLD.status = 'CANCELLED' BEGIN SELECT RAISE(ABORT, 'purchase_returns: a cancelled document cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER `receipts_cancel_is_final` BEFORE UPDATE ON `receipts` WHEN OLD.status = 'CANCELLED' BEGIN SELECT RAISE(ABORT, 'receipts: a cancelled document cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_cancel_is_final` BEFORE UPDATE ON `payments` WHEN OLD.status = 'CANCELLED' BEGIN SELECT RAISE(ABORT, 'payments: a cancelled document cannot be modified'); END;
--> statement-breakpoint
CREATE TRIGGER `stock_adjustments_cancel_is_final` BEFORE UPDATE ON `stock_adjustments` WHEN OLD.status = 'CANCELLED' BEGIN SELECT RAISE(ABORT, 'stock_adjustments: a cancelled document cannot be modified'); END;
--> statement-breakpoint
-- Number series only move forward, so a number is never issued twice.
--> statement-breakpoint
CREATE TRIGGER `number_series_forward_only` BEFORE UPDATE OF next_no ON `number_series` WHEN NEW.next_no < OLD.next_no BEGIN SELECT RAISE(ABORT, 'number_series.next_no cannot move backwards'); END;
