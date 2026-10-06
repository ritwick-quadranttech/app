CREATE TABLE `contra_vouchers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`mode` text NOT NULL,
	`reference_no` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contra_vouchers_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "contra_vouchers_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "contra_vouchers_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "contra_vouchers_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "contra_vouchers_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "contra_vouchers_amount" CHECK("amount_paise" > 0),
	CONSTRAINT "contra_vouchers_mode" CHECK("mode" IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE', 'OTHER')),
	CONSTRAINT "contra_vouchers_accounts_differ" CHECK("from_account_id" <> "to_account_id")
);
--> statement-breakpoint
CREATE INDEX `contra_vouchers_company_date_idx` ON `contra_vouchers` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `contra_vouchers_doc_no_uq` ON `contra_vouchers` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `contra_vouchers_doc_number_uq` ON `contra_vouchers` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `contra_vouchers_from_account_id_idx` ON `contra_vouchers` (`from_account_id`);--> statement-breakpoint
CREATE INDEX `contra_vouchers_to_account_id_idx` ON `contra_vouchers` (`to_account_id`);--> statement-breakpoint
CREATE TABLE `expense_items` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`expense_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`account_id` text NOT NULL,
	`description` text,
	`hsn_sac` text,
	`taxable_value_paise` integer NOT NULL,
	`cgst_bp` integer DEFAULT 0 NOT NULL,
	`sgst_bp` integer DEFAULT 0 NOT NULL,
	`igst_bp` integer DEFAULT 0 NOT NULL,
	`cess_bp` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`cess_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_items_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "expense_items_line_no" CHECK("line_no" >= 1),
	CONSTRAINT "expense_items_amounts_non_negative" CHECK("taxable_value_paise" >= 0 AND "cgst_paise" >= 0 AND "sgst_paise" >= 0 AND "igst_paise" >= 0 AND "cess_paise" >= 0),
	CONSTRAINT "expense_items_total" CHECK("total_paise" = "taxable_value_paise" + "cgst_paise" + "sgst_paise" + "igst_paise" + "cess_paise")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_items_parent_line_uq` ON `expense_items` (`expense_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `expense_items_company_id_idx` ON `expense_items` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `expense_items_account_id_idx` ON `expense_items` (`account_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`credit_account_id` text NOT NULL,
	`party_id` text,
	`supplier_gstin` text,
	`supplier_invoice_no` text,
	`place_of_supply` text,
	`igst_applicable` integer DEFAULT false NOT NULL,
	`itc_eligible` integer DEFAULT true NOT NULL,
	`taxable_total_paise` integer NOT NULL,
	`cgst_total_paise` integer DEFAULT 0 NOT NULL,
	`sgst_total_paise` integer DEFAULT 0 NOT NULL,
	`igst_total_paise` integer DEFAULT 0 NOT NULL,
	`cess_total_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expenses_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "expenses_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "expenses_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "expenses_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "expenses_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "expenses_place_of_supply" CHECK("place_of_supply" IS NULL OR "place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "expenses_totals_non_negative" CHECK("taxable_total_paise" >= 0 AND "cgst_total_paise" >= 0 AND "sgst_total_paise" >= 0 AND "igst_total_paise" >= 0 AND "cess_total_paise" >= 0),
	CONSTRAINT "expenses_tax_regime" CHECK(("igst_applicable" = 1 AND "cgst_total_paise" = 0 AND "sgst_total_paise" = 0) OR ("igst_applicable" = 0 AND "igst_total_paise" = 0)),
	CONSTRAINT "expenses_total" CHECK("total_paise" > 0 AND "total_paise" = "taxable_total_paise" + "cgst_total_paise" + "sgst_total_paise" + "igst_total_paise" + "cess_total_paise")
);
--> statement-breakpoint
CREATE INDEX `expenses_company_date_idx` ON `expenses` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_doc_no_uq` ON `expenses` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_doc_number_uq` ON `expenses` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `expenses_credit_account_id_idx` ON `expenses` (`credit_account_id`);--> statement-breakpoint
CREATE INDEX `expenses_party_id_idx` ON `expenses` (`party_id`);--> statement-breakpoint
CREATE TABLE `journal_voucher_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`journal_voucher_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`account_id` text NOT NULL,
	`debit_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`narration` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journal_voucher_id`) REFERENCES `journal_vouchers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_voucher_lines_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "journal_voucher_lines_non_negative" CHECK("debit_paise" >= 0 AND "credit_paise" >= 0),
	CONSTRAINT "journal_voucher_lines_one_side" CHECK(("debit_paise" = 0) <> ("credit_paise" = 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_voucher_lines_parent_line_uq` ON `journal_voucher_lines` (`journal_voucher_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `journal_voucher_lines_company_id_idx` ON `journal_voucher_lines` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `journal_voucher_lines_account_id_idx` ON `journal_voucher_lines` (`account_id`);--> statement-breakpoint
CREATE TABLE `journal_vouchers` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_vouchers_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "journal_vouchers_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "journal_vouchers_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "journal_vouchers_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "journal_vouchers_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `journal_vouchers_company_date_idx` ON `journal_vouchers` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_vouchers_doc_no_uq` ON `journal_vouchers` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_vouchers_doc_number_uq` ON `journal_vouchers` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE TABLE `gst_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`date` text NOT NULL,
	`source_doc_type` text NOT NULL,
	`source_doc_id` text NOT NULL,
	`source_line_id` text,
	`direction` text NOT NULL,
	`supply_kind` text NOT NULL,
	`party_id` text,
	`party_gstin` text,
	`place_of_supply` text,
	`reverse_charge` integer DEFAULT false NOT NULL,
	`itc_eligible` integer DEFAULT false NOT NULL,
	`hsn_sac` text,
	`gst_rate_bp` integer NOT NULL,
	`cess_rate_bp` integer DEFAULT 0 NOT NULL,
	`taxable_value_paise` integer NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`cess_paise` integer DEFAULT 0 NOT NULL,
	`reverses_gst_transaction_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverses_gst_transaction_id`) REFERENCES `gst_transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gst_transactions_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "gst_transactions_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "gst_transactions_source_doc_type" CHECK("source_doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'CONTRA', 'EXPENSE', 'JOURNAL_VOUCHER', 'STOCK_ADJUSTMENT')),
	CONSTRAINT "gst_transactions_direction" CHECK("direction" IN ('OUTWARD', 'INWARD')),
	CONSTRAINT "gst_transactions_supply_kind" CHECK("supply_kind" IN ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE')),
	CONSTRAINT "gst_transactions_rates" CHECK("gst_rate_bp" >= 0 AND "cess_rate_bp" >= 0),
	CONSTRAINT "gst_transactions_signs" CHECK(("taxable_value_paise" >= 0 AND "cgst_paise" >= 0 AND "sgst_paise" >= 0 AND "igst_paise" >= 0 AND "cess_paise" >= 0) OR ("taxable_value_paise" <= 0 AND "cgst_paise" <= 0 AND "sgst_paise" <= 0 AND "igst_paise" <= 0 AND "cess_paise" <= 0))
);
--> statement-breakpoint
CREATE INDEX `gst_transactions_company_date_idx` ON `gst_transactions` (`company_id`,`date`);--> statement-breakpoint
CREATE INDEX `gst_transactions_source_idx` ON `gst_transactions` (`source_doc_type`,`source_doc_id`);--> statement-breakpoint
CREATE INDEX `gst_transactions_party_id_idx` ON `gst_transactions` (`party_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gst_transactions_reverses_uq` ON `gst_transactions` (`reverses_gst_transaction_id`) WHERE "gst_transactions"."reverses_gst_transaction_id" IS NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_number_series` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`doc_type` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`suffix` text DEFAULT '' NOT NULL,
	`next_no` integer DEFAULT 1 NOT NULL,
	`pad_width` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "number_series_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "number_series_doc_type" CHECK("doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'CONTRA', 'EXPENSE', 'JOURNAL_VOUCHER', 'STOCK_ADJUSTMENT')),
	CONSTRAINT "number_series_next_no" CHECK("next_no" >= 1),
	CONSTRAINT "number_series_pad_width" CHECK("pad_width" BETWEEN 0 AND 12)
);
--> statement-breakpoint
INSERT INTO `__new_number_series`("id", "company_id", "financial_year", "doc_type", "name", "prefix", "suffix", "next_no", "pad_width", "is_default", "is_active", "created_at", "updated_at", "created_by") SELECT "id", "company_id", "financial_year", "doc_type", "name", "prefix", "suffix", "next_no", "pad_width", "is_default", "is_active", "created_at", "updated_at", "created_by" FROM `number_series`;--> statement-breakpoint
DROP TABLE `number_series`;--> statement-breakpoint
ALTER TABLE `__new_number_series` RENAME TO `number_series`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `number_series_company_id_idx` ON `number_series` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE UNIQUE INDEX `number_series_uq` ON `number_series` (`company_id`,`financial_year`,`doc_type`,`prefix`,`suffix`);--> statement-breakpoint
CREATE UNIQUE INDEX `number_series_default_uq` ON `number_series` (`company_id`,`financial_year`,`doc_type`) WHERE "number_series"."is_default" = 1;--> statement-breakpoint
CREATE TABLE `__new_journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`date` text NOT NULL,
	`voucher_type` text NOT NULL,
	`series_id` text,
	`doc_no` integer,
	`doc_number` text,
	`source_doc_type` text,
	`source_doc_id` text,
	`reverses_entry_id` text,
	`narration` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverses_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_entries_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "journal_entries_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "journal_entries_voucher_type" CHECK("voucher_type" IN ('SALES', 'SALES_RETURN', 'PURCHASE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'JOURNAL', 'CONTRA', 'EXPENSE', 'OPENING')),
	CONSTRAINT "journal_entries_source_doc_type" CHECK("source_doc_type" IS NULL OR "source_doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'CONTRA', 'EXPENSE', 'JOURNAL_VOUCHER', 'STOCK_ADJUSTMENT')),
	CONSTRAINT "journal_entries_source_pair" CHECK(("source_doc_type" IS NULL) = ("source_doc_id" IS NULL)),
	CONSTRAINT "journal_entries_numbering" CHECK(("series_id" IS NULL) = ("doc_no" IS NULL) AND ("doc_no" IS NULL) = ("doc_number" IS NULL)),
	CONSTRAINT "journal_entries_origin" CHECK("source_doc_type" IS NOT NULL OR "series_id" IS NOT NULL OR "reverses_entry_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_journal_entries`("id", "company_id", "financial_year", "date", "voucher_type", "series_id", "doc_no", "doc_number", "source_doc_type", "source_doc_id", "reverses_entry_id", "narration", "created_at", "updated_at", "created_by") SELECT "id", "company_id", "financial_year", "date", "voucher_type", "series_id", "doc_no", "doc_number", "source_doc_type", "source_doc_id", "reverses_entry_id", "narration", "created_at", "updated_at", "created_by" FROM `journal_entries`;--> statement-breakpoint
DROP TABLE `journal_entries`;--> statement-breakpoint
ALTER TABLE `__new_journal_entries` RENAME TO `journal_entries`;--> statement-breakpoint
CREATE INDEX `journal_entries_company_date_idx` ON `journal_entries` (`company_id`,`date`);--> statement-breakpoint
CREATE INDEX `journal_entries_series_id_idx` ON `journal_entries` (`series_id`);--> statement-breakpoint
CREATE INDEX `journal_entries_source_idx` ON `journal_entries` (`source_doc_type`,`source_doc_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_reverses_uq` ON `journal_entries` (`reverses_entry_id`) WHERE "journal_entries"."reverses_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_doc_no_uq` ON `journal_entries` (`series_id`,`financial_year`,`doc_no`) WHERE "journal_entries"."series_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_purchase_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`party_id` text NOT NULL,
	`party_name` text NOT NULL,
	`party_gstin` text,
	`party_state_code` text,
	`billing_address` text,
	`shipping_address` text,
	`place_of_supply` text NOT NULL,
	`igst_applicable` integer NOT NULL,
	`reverse_charge` integer DEFAULT false NOT NULL,
	`due_date` text,
	`discount_total_paise` integer DEFAULT 0 NOT NULL,
	`taxable_total_paise` integer NOT NULL,
	`cgst_total_paise` integer DEFAULT 0 NOT NULL,
	`sgst_total_paise` integer DEFAULT 0 NOT NULL,
	`igst_total_paise` integer DEFAULT 0 NOT NULL,
	`cess_total_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`grand_total_paise` integer NOT NULL,
	`supplier_invoice_no` text NOT NULL,
	`supplier_invoice_date` text NOT NULL,
	`itc_eligible` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_invoices_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "purchase_invoices_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_invoices_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "purchase_invoices_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "purchase_invoices_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "purchase_invoices_place_of_supply" CHECK("place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "purchase_invoices_due_date" CHECK("due_date" IS NULL OR "due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_invoices_totals_non_negative" CHECK("discount_total_paise" >= 0 AND "taxable_total_paise" >= 0 AND "cgst_total_paise" >= 0 AND "sgst_total_paise" >= 0 AND "igst_total_paise" >= 0 AND "cess_total_paise" >= 0 AND "grand_total_paise" >= 0),
	CONSTRAINT "purchase_invoices_tax_regime" CHECK(("igst_applicable" = 1 AND "cgst_total_paise" = 0 AND "sgst_total_paise" = 0) OR ("igst_applicable" = 0 AND "igst_total_paise" = 0)),
	CONSTRAINT "purchase_invoices_grand_total" CHECK("grand_total_paise" = "taxable_total_paise" + CASE WHEN "reverse_charge" = 1 THEN 0 ELSE "cgst_total_paise" + "sgst_total_paise" + "igst_total_paise" + "cess_total_paise" END + "round_off_paise"),
	CONSTRAINT "purchase_invoices_supplier_invoice_date" CHECK("supplier_invoice_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_purchase_invoices`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "supplier_invoice_no", "supplier_invoice_date", "itc_eligible") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "supplier_invoice_no", "supplier_invoice_date", "itc_eligible" FROM `purchase_invoices`;--> statement-breakpoint
DROP TABLE `purchase_invoices`;--> statement-breakpoint
ALTER TABLE `__new_purchase_invoices` RENAME TO `purchase_invoices`;--> statement-breakpoint
CREATE INDEX `purchase_invoices_company_date_idx` ON `purchase_invoices` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_doc_no_uq` ON `purchase_invoices` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_doc_number_uq` ON `purchase_invoices` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_party_id_idx` ON `purchase_invoices` (`party_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_supplier_bill_uq` ON `purchase_invoices` (`company_id`,`party_id`,`financial_year`,`supplier_invoice_no`) WHERE "purchase_invoices"."status" = 'POSTED';--> statement-breakpoint
CREATE TABLE `__new_purchase_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`party_id` text NOT NULL,
	`party_name` text NOT NULL,
	`party_gstin` text,
	`party_state_code` text,
	`billing_address` text,
	`shipping_address` text,
	`place_of_supply` text NOT NULL,
	`igst_applicable` integer NOT NULL,
	`reverse_charge` integer DEFAULT false NOT NULL,
	`due_date` text,
	`discount_total_paise` integer DEFAULT 0 NOT NULL,
	`taxable_total_paise` integer NOT NULL,
	`cgst_total_paise` integer DEFAULT 0 NOT NULL,
	`sgst_total_paise` integer DEFAULT 0 NOT NULL,
	`igst_total_paise` integer DEFAULT 0 NOT NULL,
	`cess_total_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`grand_total_paise` integer NOT NULL,
	`original_invoice_id` text,
	`reason` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_returns_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "purchase_returns_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_returns_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "purchase_returns_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "purchase_returns_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "purchase_returns_place_of_supply" CHECK("place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "purchase_returns_due_date" CHECK("due_date" IS NULL OR "due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_returns_totals_non_negative" CHECK("discount_total_paise" >= 0 AND "taxable_total_paise" >= 0 AND "cgst_total_paise" >= 0 AND "sgst_total_paise" >= 0 AND "igst_total_paise" >= 0 AND "cess_total_paise" >= 0 AND "grand_total_paise" >= 0),
	CONSTRAINT "purchase_returns_tax_regime" CHECK(("igst_applicable" = 1 AND "cgst_total_paise" = 0 AND "sgst_total_paise" = 0) OR ("igst_applicable" = 0 AND "igst_total_paise" = 0)),
	CONSTRAINT "purchase_returns_grand_total" CHECK("grand_total_paise" = "taxable_total_paise" + CASE WHEN "reverse_charge" = 1 THEN 0 ELSE "cgst_total_paise" + "sgst_total_paise" + "igst_total_paise" + "cess_total_paise" END + "round_off_paise")
);
--> statement-breakpoint
INSERT INTO `__new_purchase_returns`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "original_invoice_id", "reason") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "original_invoice_id", "reason" FROM `purchase_returns`;--> statement-breakpoint
DROP TABLE `purchase_returns`;--> statement-breakpoint
ALTER TABLE `__new_purchase_returns` RENAME TO `purchase_returns`;--> statement-breakpoint
CREATE INDEX `purchase_returns_company_date_idx` ON `purchase_returns` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_returns_doc_no_uq` ON `purchase_returns` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_returns_doc_number_uq` ON `purchase_returns` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `purchase_returns_party_id_idx` ON `purchase_returns` (`party_id`,`date`);--> statement-breakpoint
CREATE INDEX `purchase_returns_original_invoice_id_idx` ON `purchase_returns` (`original_invoice_id`);--> statement-breakpoint
CREATE TABLE `__new_sales_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`party_id` text NOT NULL,
	`party_name` text NOT NULL,
	`party_gstin` text,
	`party_state_code` text,
	`billing_address` text,
	`shipping_address` text,
	`place_of_supply` text NOT NULL,
	`igst_applicable` integer NOT NULL,
	`reverse_charge` integer DEFAULT false NOT NULL,
	`due_date` text,
	`discount_total_paise` integer DEFAULT 0 NOT NULL,
	`taxable_total_paise` integer NOT NULL,
	`cgst_total_paise` integer DEFAULT 0 NOT NULL,
	`sgst_total_paise` integer DEFAULT 0 NOT NULL,
	`igst_total_paise` integer DEFAULT 0 NOT NULL,
	`cess_total_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`grand_total_paise` integer NOT NULL,
	`payment_type` text DEFAULT 'CREDIT' NOT NULL,
	`cash_bank_account_id` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_bank_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_invoices_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "sales_invoices_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_invoices_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "sales_invoices_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "sales_invoices_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "sales_invoices_place_of_supply" CHECK("place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "sales_invoices_due_date" CHECK("due_date" IS NULL OR "due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_invoices_totals_non_negative" CHECK("discount_total_paise" >= 0 AND "taxable_total_paise" >= 0 AND "cgst_total_paise" >= 0 AND "sgst_total_paise" >= 0 AND "igst_total_paise" >= 0 AND "cess_total_paise" >= 0 AND "grand_total_paise" >= 0),
	CONSTRAINT "sales_invoices_tax_regime" CHECK(("igst_applicable" = 1 AND "cgst_total_paise" = 0 AND "sgst_total_paise" = 0) OR ("igst_applicable" = 0 AND "igst_total_paise" = 0)),
	CONSTRAINT "sales_invoices_grand_total" CHECK("grand_total_paise" = "taxable_total_paise" + CASE WHEN "reverse_charge" = 1 THEN 0 ELSE "cgst_total_paise" + "sgst_total_paise" + "igst_total_paise" + "cess_total_paise" END + "round_off_paise"),
	CONSTRAINT "sales_invoices_payment_type" CHECK("payment_type" IN ('CREDIT', 'CASH')),
	CONSTRAINT "sales_invoices_cash_account" CHECK(("payment_type" = 'CASH') = ("cash_bank_account_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_sales_invoices`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise" FROM `sales_invoices`;--> statement-breakpoint
DROP TABLE `sales_invoices`;--> statement-breakpoint
ALTER TABLE `__new_sales_invoices` RENAME TO `sales_invoices`;--> statement-breakpoint
CREATE INDEX `sales_invoices_company_date_idx` ON `sales_invoices` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoices_doc_no_uq` ON `sales_invoices` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoices_doc_number_uq` ON `sales_invoices` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `sales_invoices_party_id_idx` ON `sales_invoices` (`party_id`,`date`);--> statement-breakpoint
CREATE INDEX `sales_invoices_cash_bank_account_id_idx` ON `sales_invoices` (`cash_bank_account_id`);--> statement-breakpoint
CREATE TABLE `__new_sales_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`party_id` text NOT NULL,
	`party_name` text NOT NULL,
	`party_gstin` text,
	`party_state_code` text,
	`billing_address` text,
	`shipping_address` text,
	`place_of_supply` text NOT NULL,
	`igst_applicable` integer NOT NULL,
	`reverse_charge` integer DEFAULT false NOT NULL,
	`due_date` text,
	`discount_total_paise` integer DEFAULT 0 NOT NULL,
	`taxable_total_paise` integer NOT NULL,
	`cgst_total_paise` integer DEFAULT 0 NOT NULL,
	`sgst_total_paise` integer DEFAULT 0 NOT NULL,
	`igst_total_paise` integer DEFAULT 0 NOT NULL,
	`cess_total_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`grand_total_paise` integer NOT NULL,
	`original_invoice_id` text,
	`reason` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_returns_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "sales_returns_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_returns_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "sales_returns_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "sales_returns_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "sales_returns_place_of_supply" CHECK("place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "sales_returns_due_date" CHECK("due_date" IS NULL OR "due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_returns_totals_non_negative" CHECK("discount_total_paise" >= 0 AND "taxable_total_paise" >= 0 AND "cgst_total_paise" >= 0 AND "sgst_total_paise" >= 0 AND "igst_total_paise" >= 0 AND "cess_total_paise" >= 0 AND "grand_total_paise" >= 0),
	CONSTRAINT "sales_returns_tax_regime" CHECK(("igst_applicable" = 1 AND "cgst_total_paise" = 0 AND "sgst_total_paise" = 0) OR ("igst_applicable" = 0 AND "igst_total_paise" = 0)),
	CONSTRAINT "sales_returns_grand_total" CHECK("grand_total_paise" = "taxable_total_paise" + CASE WHEN "reverse_charge" = 1 THEN 0 ELSE "cgst_total_paise" + "sgst_total_paise" + "igst_total_paise" + "cess_total_paise" END + "round_off_paise")
);
--> statement-breakpoint
INSERT INTO `__new_sales_returns`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "original_invoice_id", "reason") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "original_invoice_id", "reason" FROM `sales_returns`;--> statement-breakpoint
DROP TABLE `sales_returns`;--> statement-breakpoint
ALTER TABLE `__new_sales_returns` RENAME TO `sales_returns`;--> statement-breakpoint
CREATE INDEX `sales_returns_company_date_idx` ON `sales_returns` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_returns_doc_no_uq` ON `sales_returns` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_returns_doc_number_uq` ON `sales_returns` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `sales_returns_party_id_idx` ON `sales_returns` (`party_id`,`date`);--> statement-breakpoint
CREATE INDEX `sales_returns_original_invoice_id_idx` ON `sales_returns` (`original_invoice_id`);--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`cash_bank_account_id` text NOT NULL,
	`counter_account_id` text NOT NULL,
	`party_id` text,
	`amount_paise` integer NOT NULL,
	`mode` text NOT NULL,
	`reference_no` text,
	`reference_date` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_bank_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counter_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "payments_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "payments_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "payments_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "payments_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "payments_amount" CHECK("amount_paise" > 0),
	CONSTRAINT "payments_mode" CHECK("mode" IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE', 'OTHER')),
	CONSTRAINT "payments_accounts_differ" CHECK("cash_bank_account_id" <> "counter_account_id"),
	CONSTRAINT "payments_reference_date" CHECK("reference_date" IS NULL OR "reference_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_payments`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "cash_bank_account_id", "counter_account_id", "party_id", "amount_paise", "mode", "reference_no", "reference_date") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "cash_bank_account_id", "counter_account_id", "party_id", "amount_paise", "mode", "reference_no", "reference_date" FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
CREATE INDEX `payments_company_date_idx` ON `payments` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_doc_no_uq` ON `payments` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_doc_number_uq` ON `payments` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `payments_cash_bank_account_id_idx` ON `payments` (`cash_bank_account_id`);--> statement-breakpoint
CREATE INDEX `payments_counter_account_id_idx` ON `payments` (`counter_account_id`);--> statement-breakpoint
CREATE INDEX `payments_party_id_idx` ON `payments` (`party_id`);--> statement-breakpoint
CREATE TABLE `__new_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`cash_bank_account_id` text NOT NULL,
	`counter_account_id` text NOT NULL,
	`party_id` text,
	`amount_paise` integer NOT NULL,
	`mode` text NOT NULL,
	`reference_no` text,
	`reference_date` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cash_bank_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counter_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receipts_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "receipts_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "receipts_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "receipts_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "receipts_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "receipts_amount" CHECK("amount_paise" > 0),
	CONSTRAINT "receipts_mode" CHECK("mode" IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE', 'OTHER')),
	CONSTRAINT "receipts_accounts_differ" CHECK("cash_bank_account_id" <> "counter_account_id"),
	CONSTRAINT "receipts_reference_date" CHECK("reference_date" IS NULL OR "reference_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_receipts`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "cash_bank_account_id", "counter_account_id", "party_id", "amount_paise", "mode", "reference_no", "reference_date") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "cash_bank_account_id", "counter_account_id", "party_id", "amount_paise", "mode", "reference_no", "reference_date" FROM `receipts`;--> statement-breakpoint
DROP TABLE `receipts`;--> statement-breakpoint
ALTER TABLE `__new_receipts` RENAME TO `receipts`;--> statement-breakpoint
CREATE INDEX `receipts_company_date_idx` ON `receipts` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_doc_no_uq` ON `receipts` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_doc_number_uq` ON `receipts` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `receipts_cash_bank_account_id_idx` ON `receipts` (`cash_bank_account_id`);--> statement-breakpoint
CREATE INDEX `receipts_counter_account_id_idx` ON `receipts` (`counter_account_id`);--> statement-breakpoint
CREATE INDEX `receipts_party_id_idx` ON `receipts` (`party_id`);--> statement-breakpoint
CREATE TABLE `__new_stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`date` text NOT NULL,
	`product_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`qty_x1000` integer NOT NULL,
	`rate_paise` integer NOT NULL,
	`source_doc_type` text NOT NULL,
	`source_doc_id` text NOT NULL,
	`source_line_id` text,
	`reverses_movement_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverses_movement_id`) REFERENCES `stock_movements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_movements_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "stock_movements_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "stock_movements_type" CHECK("movement_type" IN ('OPENING', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
	CONSTRAINT "stock_movements_source_doc_type" CHECK("source_doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'CONTRA', 'EXPENSE', 'JOURNAL_VOUCHER', 'STOCK_ADJUSTMENT')),
	CONSTRAINT "stock_movements_rate" CHECK("rate_paise" >= 0),
	CONSTRAINT "stock_movements_sign" CHECK("qty_x1000" <> 0 AND (("movement_type" IN ('OPENING', 'PURCHASE', 'SALE_RETURN', 'ADJUSTMENT_IN')) = ("qty_x1000" > 0)) = ("reverses_movement_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_stock_movements`("id", "company_id", "financial_year", "date", "product_id", "movement_type", "qty_x1000", "rate_paise", "source_doc_type", "source_doc_id", "source_line_id", "reverses_movement_id", "created_at", "updated_at", "created_by") SELECT "id", "company_id", "financial_year", "date", "product_id", "movement_type", "qty_x1000", "rate_paise", "source_doc_type", "source_doc_id", "source_line_id", "reverses_movement_id", "created_at", "updated_at", "created_by" FROM `stock_movements`;--> statement-breakpoint
DROP TABLE `stock_movements`;--> statement-breakpoint
ALTER TABLE `__new_stock_movements` RENAME TO `stock_movements`;--> statement-breakpoint
CREATE INDEX `stock_movements_company_date_idx` ON `stock_movements` (`company_id`,`date`);--> statement-breakpoint
CREATE INDEX `stock_movements_product_date_idx` ON `stock_movements` (`product_id`,`date`);--> statement-breakpoint
CREATE INDEX `stock_movements_source_idx` ON `stock_movements` (`source_doc_type`,`source_doc_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_reverses_uq` ON `stock_movements` (`reverses_movement_id`) WHERE "stock_movements"."reverses_movement_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`gstin` text,
	`pan` text,
	`state_code` text NOT NULL,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`pincode` text,
	`phone` text,
	`email` text,
	`fy_start_month` integer DEFAULT 4 NOT NULL,
	`books_begin_date` text NOT NULL,
	`negative_stock_policy` text DEFAULT 'WARN' NOT NULL,
	`locked_until` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "companies_negative_stock_policy" CHECK("negative_stock_policy" IN ('ALLOW', 'WARN', 'BLOCK')),
	CONSTRAINT "companies_locked_until" CHECK("locked_until" IS NULL OR "locked_until" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "companies_state_code" CHECK("state_code" GLOB '[0-9][0-9]'),
	CONSTRAINT "companies_gstin_len" CHECK("gstin" IS NULL OR length("gstin") = 15),
	CONSTRAINT "companies_fy_start_month" CHECK("fy_start_month" BETWEEN 1 AND 12),
	CONSTRAINT "companies_books_begin_date" CHECK("books_begin_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_companies`("id", "name", "legal_name", "gstin", "pan", "state_code", "address_line1", "address_line2", "city", "pincode", "phone", "email", "fy_start_month", "books_begin_date", "created_at", "updated_at", "created_by", "deleted_at") SELECT "id", "name", "legal_name", "gstin", "pan", "state_code", "address_line1", "address_line2", "city", "pincode", "phone", "email", "fy_start_month", "books_begin_date", "created_at", "updated_at", "created_by", "deleted_at" FROM `companies`;--> statement-breakpoint
DROP TABLE `companies`;--> statement-breakpoint
ALTER TABLE `__new_companies` RENAME TO `companies`;--> statement-breakpoint
CREATE TABLE `__new_stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`series_id` text NOT NULL,
	`doc_no` integer NOT NULL,
	`doc_number` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`cancelled_by` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`kind` text DEFAULT 'ADJUSTMENT' NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_adjustments_fy" CHECK("financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "stock_adjustments_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "stock_adjustments_doc_no" CHECK("doc_no" >= 1),
	CONSTRAINT "stock_adjustments_status" CHECK("status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "stock_adjustments_cancellation" CHECK(("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND trim("cancel_reason") <> '' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)),
	CONSTRAINT "stock_adjustments_kind" CHECK("kind" IN ('ADJUSTMENT', 'OPENING'))
);
--> statement-breakpoint
INSERT INTO `__new_stock_adjustments`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "reason") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "reason" FROM `stock_adjustments`;--> statement-breakpoint
DROP TABLE `stock_adjustments`;--> statement-breakpoint
ALTER TABLE `__new_stock_adjustments` RENAME TO `stock_adjustments`;--> statement-breakpoint
CREATE INDEX `stock_adjustments_company_date_idx` ON `stock_adjustments` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_adjustments_doc_no_uq` ON `stock_adjustments` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_adjustments_doc_number_uq` ON `stock_adjustments` (`company_id`,`financial_year`,`doc_number`);