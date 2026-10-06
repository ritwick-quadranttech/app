ALTER TABLE `companies` ADD `einvoice_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`payment_method` text DEFAULT 'CREDIT' NOT NULL,
	`payment_status` text DEFAULT 'UNPAID' NOT NULL,
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
	CONSTRAINT "sales_invoices_payment_method" CHECK("payment_method" IN ('CASH', 'ONLINE', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'CREDIT', 'OTHER')),
	CONSTRAINT "sales_invoices_payment_status" CHECK("payment_status" IN ('PAID', 'UNPAID')),
	CONSTRAINT "sales_invoices_cash_account" CHECK(("payment_type" = 'CASH') = ("cash_bank_account_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_sales_invoices`("id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "payment_type", "cash_bank_account_id") SELECT "id", "company_id", "financial_year", "series_id", "doc_no", "doc_number", "date", "status", "cancel_reason", "cancelled_at", "cancelled_by", "notes", "created_at", "updated_at", "created_by", "party_id", "party_name", "party_gstin", "party_state_code", "billing_address", "shipping_address", "place_of_supply", "igst_applicable", "reverse_charge", "due_date", "discount_total_paise", "taxable_total_paise", "cgst_total_paise", "sgst_total_paise", "igst_total_paise", "cess_total_paise", "round_off_paise", "grand_total_paise", "payment_type", "cash_bank_account_id" FROM `sales_invoices`;--> statement-breakpoint
DROP TABLE `sales_invoices`;--> statement-breakpoint
ALTER TABLE `__new_sales_invoices` RENAME TO `sales_invoices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sales_invoices_company_date_idx` ON `sales_invoices` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoices_doc_no_uq` ON `sales_invoices` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoices_doc_number_uq` ON `sales_invoices` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `sales_invoices_party_id_idx` ON `sales_invoices` (`party_id`,`date`);--> statement-breakpoint
CREATE INDEX `sales_invoices_cash_bank_account_id_idx` ON `sales_invoices` (`cash_bank_account_id`);