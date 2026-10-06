CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_settings_key_uq` ON `app_settings` (`key`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`user_id` text NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_logs_action" CHECK("audit_logs"."action" IN ('CREATE', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'CANCEL', 'LOGIN', 'LOGOUT'))
);
--> statement-breakpoint
CREATE INDEX `audit_logs_company_id_idx` ON `audit_logs` (`company_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_id_idx` ON `audit_logs` (`user_id`,`at`);--> statement-breakpoint
CREATE TABLE `companies` (
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
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "companies_state_code" CHECK("companies"."state_code" GLOB '[0-9][0-9]'),
	CONSTRAINT "companies_gstin_len" CHECK("companies"."gstin" IS NULL OR length("companies"."gstin") = 15),
	CONSTRAINT "companies_fy_start_month" CHECK("companies"."fy_start_month" BETWEEN 1 AND 12),
	CONSTRAINT "companies_books_begin_date" CHECK("companies"."books_begin_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE TABLE `financial_years` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`code` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_closed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "financial_years_code" CHECK("financial_years"."code" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "financial_years_dates" CHECK("financial_years"."end_date" > "financial_years"."start_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_years_company_code_uq` ON `financial_years` (`company_id`,`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "users_role" CHECK("users"."role" IN ('ADMIN', 'ACCOUNTANT', 'OPERATOR', 'VIEWER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`) WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`parent_id` text,
	`code` text,
	`name` text NOT NULL,
	`nature` text NOT NULL,
	`is_group` integer DEFAULT false NOT NULL,
	`system_code` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounts_nature" CHECK("accounts"."nature" IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
	CONSTRAINT "accounts_not_own_parent" CHECK("accounts"."parent_id" IS NULL OR "accounts"."parent_id" <> "accounts"."id")
);
--> statement-breakpoint
CREATE INDEX `accounts_company_id_idx` ON `accounts` (`company_id`);--> statement-breakpoint
CREATE INDEX `accounts_parent_id_idx` ON `accounts` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_company_name_uq` ON `accounts` (`company_id`,`name`) WHERE "accounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_company_system_code_uq` ON `accounts` (`company_id`,`system_code`) WHERE "accounts"."system_code" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`account_id` text NOT NULL,
	`party_type` text NOT NULL,
	`name` text NOT NULL,
	`gstin` text,
	`pan` text,
	`registration_type` text NOT NULL,
	`state_code` text,
	`billing_address` text,
	`shipping_address` text,
	`city` text,
	`pincode` text,
	`phone` text,
	`email` text,
	`credit_days` integer,
	`credit_limit_paise` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "parties_party_type" CHECK("parties"."party_type" IN ('CUSTOMER', 'SUPPLIER', 'BOTH')),
	CONSTRAINT "parties_registration_type" CHECK("parties"."registration_type" IN ('REGULAR', 'COMPOSITION', 'UNREGISTERED', 'CONSUMER', 'SEZ', 'OVERSEAS', 'DEEMED_EXPORT')),
	CONSTRAINT "parties_gstin_len" CHECK("parties"."gstin" IS NULL OR length("parties"."gstin") = 15),
	CONSTRAINT "parties_state_code" CHECK("parties"."state_code" IS NULL OR "parties"."state_code" GLOB '[0-9][0-9]'),
	CONSTRAINT "parties_credit_days" CHECK("parties"."credit_days" IS NULL OR "parties"."credit_days" >= 0),
	CONSTRAINT "parties_credit_limit" CHECK("parties"."credit_limit_paise" IS NULL OR "parties"."credit_limit_paise" >= 0)
);
--> statement-breakpoint
CREATE INDEX `parties_company_id_idx` ON `parties` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `parties_account_id_uq` ON `parties` (`account_id`);--> statement-breakpoint
CREATE INDEX `parties_company_name_idx` ON `parties` (`company_id`,`name`);--> statement-breakpoint
CREATE INDEX `parties_company_gstin_idx` ON `parties` (`company_id`,`gstin`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`description` text,
	`hsn_sac` text,
	`is_service` integer DEFAULT false NOT NULL,
	`unit_id` text NOT NULL,
	`tax_category_id` text,
	`sale_rate_paise` integer,
	`purchase_rate_paise` integer,
	`mrp_paise` integer,
	`track_inventory` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_category_id`) REFERENCES `tax_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_rates_non_negative" CHECK(coalesce("products"."sale_rate_paise", 0) >= 0 AND coalesce("products"."purchase_rate_paise", 0) >= 0 AND coalesce("products"."mrp_paise", 0) >= 0),
	CONSTRAINT "products_service_no_stock" CHECK(NOT ("products"."is_service" = 1 AND "products"."track_inventory" = 1))
);
--> statement-breakpoint
CREATE INDEX `products_company_id_idx` ON `products` (`company_id`);--> statement-breakpoint
CREATE INDEX `products_unit_id_idx` ON `products` (`unit_id`);--> statement-breakpoint
CREATE INDEX `products_tax_category_id_idx` ON `products` (`tax_category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_company_name_uq` ON `products` (`company_id`,`name`) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `products_company_sku_uq` ON `products` (`company_id`,`sku`) WHERE "products"."sku" IS NOT NULL AND "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `tax_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tax_categories_company_id_idx` ON `tax_categories` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_categories_company_code_uq` ON `tax_categories` (`company_id`,`code`) WHERE "tax_categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`tax_category_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`igst_bp` integer NOT NULL,
	`cgst_bp` integer NOT NULL,
	`sgst_bp` integer NOT NULL,
	`cess_bp` integer DEFAULT 0 NOT NULL,
	`cess_per_unit_paise` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_category_id`) REFERENCES `tax_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tax_rates_effective_from" CHECK("tax_rates"."effective_from" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "tax_rates_effective_range" CHECK("tax_rates"."effective_to" IS NULL OR ("tax_rates"."effective_to" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND "tax_rates"."effective_to" >= "tax_rates"."effective_from")),
	CONSTRAINT "tax_rates_non_negative" CHECK("tax_rates"."igst_bp" >= 0 AND "tax_rates"."cgst_bp" >= 0 AND "tax_rates"."sgst_bp" >= 0 AND "tax_rates"."cess_bp" >= 0 AND "tax_rates"."cess_per_unit_paise" >= 0),
	CONSTRAINT "tax_rates_split" CHECK("tax_rates"."cgst_bp" = "tax_rates"."sgst_bp" AND "tax_rates"."igst_bp" = "tax_rates"."cgst_bp" + "tax_rates"."sgst_bp")
);
--> statement-breakpoint
CREATE INDEX `tax_rates_company_id_idx` ON `tax_rates` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_rates_category_from_uq` ON `tax_rates` (`tax_category_id`,`effective_from`) WHERE "tax_rates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`uqc` text NOT NULL,
	`decimals` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "units_decimals" CHECK("units"."decimals" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE INDEX `units_company_id_idx` ON `units` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `units_company_code_uq` ON `units` (`company_id`,`code`) WHERE "units"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `number_series` (
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
	CONSTRAINT "number_series_fy" CHECK("number_series"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "number_series_doc_type" CHECK("number_series"."doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'STOCK_ADJUSTMENT', 'JOURNAL', 'CONTRA')),
	CONSTRAINT "number_series_next_no" CHECK("number_series"."next_no" >= 1),
	CONSTRAINT "number_series_pad_width" CHECK("number_series"."pad_width" BETWEEN 0 AND 12)
);
--> statement-breakpoint
CREATE INDEX `number_series_company_id_idx` ON `number_series` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE UNIQUE INDEX `number_series_uq` ON `number_series` (`company_id`,`financial_year`,`doc_type`,`prefix`,`suffix`);--> statement-breakpoint
CREATE UNIQUE INDEX `number_series_default_uq` ON `number_series` (`company_id`,`financial_year`,`doc_type`) WHERE "number_series"."is_default" = 1;--> statement-breakpoint
CREATE TABLE `journal_entries` (
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
	CONSTRAINT "journal_entries_fy" CHECK("journal_entries"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "journal_entries_date" CHECK("journal_entries"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "journal_entries_voucher_type" CHECK("journal_entries"."voucher_type" IN ('SALES', 'SALES_RETURN', 'PURCHASE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'JOURNAL', 'CONTRA', 'OPENING')),
	CONSTRAINT "journal_entries_source_doc_type" CHECK("journal_entries"."source_doc_type" IS NULL OR "journal_entries"."source_doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'STOCK_ADJUSTMENT')),
	CONSTRAINT "journal_entries_source_pair" CHECK(("journal_entries"."source_doc_type" IS NULL) = ("journal_entries"."source_doc_id" IS NULL)),
	CONSTRAINT "journal_entries_numbering" CHECK(("journal_entries"."series_id" IS NULL) = ("journal_entries"."doc_no" IS NULL) AND ("journal_entries"."doc_no" IS NULL) = ("journal_entries"."doc_number" IS NULL)),
	CONSTRAINT "journal_entries_origin" CHECK("journal_entries"."source_doc_type" IS NOT NULL OR "journal_entries"."series_id" IS NOT NULL OR "journal_entries"."reverses_entry_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `journal_entries_company_date_idx` ON `journal_entries` (`company_id`,`date`);--> statement-breakpoint
CREATE INDEX `journal_entries_series_id_idx` ON `journal_entries` (`series_id`);--> statement-breakpoint
CREATE INDEX `journal_entries_source_idx` ON `journal_entries` (`source_doc_type`,`source_doc_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_reverses_uq` ON `journal_entries` (`reverses_entry_id`) WHERE "journal_entries"."reverses_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_doc_no_uq` ON `journal_entries` (`series_id`,`financial_year`,`doc_no`) WHERE "journal_entries"."series_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`journal_entry_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`date` text NOT NULL,
	`account_id` text NOT NULL,
	`debit_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`narration` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_entries_fy" CHECK("ledger_entries"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "ledger_entries_date" CHECK("ledger_entries"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "ledger_entries_non_negative" CHECK("ledger_entries"."debit_paise" >= 0 AND "ledger_entries"."credit_paise" >= 0),
	CONSTRAINT "ledger_entries_one_side" CHECK(("ledger_entries"."debit_paise" = 0) <> ("ledger_entries"."credit_paise" = 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_journal_line_uq` ON `ledger_entries` (`journal_entry_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `ledger_entries_account_date_idx` ON `ledger_entries` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `ledger_entries_company_date_idx` ON `ledger_entries` (`company_id`,`date`);--> statement-breakpoint
CREATE TABLE `purchase_invoice_items` (
	`invoice_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`line_no` integer NOT NULL,
	`product_id` text NOT NULL,
	`description` text,
	`hsn_sac` text,
	`qty_x1000` integer NOT NULL,
	`unit_id` text NOT NULL,
	`rate_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
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
	FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_invoice_items_fy" CHECK("purchase_invoice_items"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "purchase_invoice_items_line_no" CHECK("purchase_invoice_items"."line_no" >= 1),
	CONSTRAINT "purchase_invoice_items_qty" CHECK("purchase_invoice_items"."qty_x1000" > 0),
	CONSTRAINT "purchase_invoice_items_amounts_non_negative" CHECK("purchase_invoice_items"."rate_paise" >= 0 AND "purchase_invoice_items"."discount_paise" >= 0 AND "purchase_invoice_items"."taxable_value_paise" >= 0 AND "purchase_invoice_items"."cgst_paise" >= 0 AND "purchase_invoice_items"."sgst_paise" >= 0 AND "purchase_invoice_items"."igst_paise" >= 0 AND "purchase_invoice_items"."cess_paise" >= 0),
	CONSTRAINT "purchase_invoice_items_rates_non_negative" CHECK("purchase_invoice_items"."cgst_bp" >= 0 AND "purchase_invoice_items"."sgst_bp" >= 0 AND "purchase_invoice_items"."igst_bp" >= 0 AND "purchase_invoice_items"."cess_bp" >= 0),
	CONSTRAINT "purchase_invoice_items_total" CHECK("purchase_invoice_items"."total_paise" = "purchase_invoice_items"."taxable_value_paise" + "purchase_invoice_items"."cgst_paise" + "purchase_invoice_items"."sgst_paise" + "purchase_invoice_items"."igst_paise" + "purchase_invoice_items"."cess_paise")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoice_items_parent_line_uq` ON `purchase_invoice_items` (`invoice_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_items_company_id_idx` ON `purchase_invoice_items` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_items_product_id_idx` ON `purchase_invoice_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_items_unit_id_idx` ON `purchase_invoice_items` (`unit_id`);--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
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
	CONSTRAINT "purchase_invoices_fy" CHECK("purchase_invoices"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "purchase_invoices_date" CHECK("purchase_invoices"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_invoices_doc_no" CHECK("purchase_invoices"."doc_no" >= 1),
	CONSTRAINT "purchase_invoices_status" CHECK("purchase_invoices"."status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "purchase_invoices_cancellation" CHECK(("purchase_invoices"."status" = 'CANCELLED') = ("purchase_invoices"."cancel_reason" IS NOT NULL AND trim("purchase_invoices"."cancel_reason") <> '' AND "purchase_invoices"."cancelled_at" IS NOT NULL AND "purchase_invoices"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "purchase_invoices_place_of_supply" CHECK("purchase_invoices"."place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "purchase_invoices_due_date" CHECK("purchase_invoices"."due_date" IS NULL OR "purchase_invoices"."due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_invoices_totals_non_negative" CHECK("purchase_invoices"."discount_total_paise" >= 0 AND "purchase_invoices"."taxable_total_paise" >= 0 AND "purchase_invoices"."cgst_total_paise" >= 0 AND "purchase_invoices"."sgst_total_paise" >= 0 AND "purchase_invoices"."igst_total_paise" >= 0 AND "purchase_invoices"."cess_total_paise" >= 0 AND "purchase_invoices"."grand_total_paise" >= 0),
	CONSTRAINT "purchase_invoices_tax_regime" CHECK(("purchase_invoices"."igst_applicable" = 1 AND "purchase_invoices"."cgst_total_paise" = 0 AND "purchase_invoices"."sgst_total_paise" = 0) OR ("purchase_invoices"."igst_applicable" = 0 AND "purchase_invoices"."igst_total_paise" = 0)),
	CONSTRAINT "purchase_invoices_grand_total" CHECK("purchase_invoices"."grand_total_paise" = "purchase_invoices"."taxable_total_paise" + "purchase_invoices"."cgst_total_paise" + "purchase_invoices"."sgst_total_paise" + "purchase_invoices"."igst_total_paise" + "purchase_invoices"."cess_total_paise" + "purchase_invoices"."round_off_paise"),
	CONSTRAINT "purchase_invoices_supplier_invoice_date" CHECK("purchase_invoices"."supplier_invoice_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `purchase_invoices_company_date_idx` ON `purchase_invoices` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_doc_no_uq` ON `purchase_invoices` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_doc_number_uq` ON `purchase_invoices` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_party_id_idx` ON `purchase_invoices` (`party_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoices_supplier_bill_uq` ON `purchase_invoices` (`company_id`,`party_id`,`financial_year`,`supplier_invoice_no`) WHERE "purchase_invoices"."status" = 'POSTED';--> statement-breakpoint
CREATE TABLE `purchase_return_items` (
	`return_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`line_no` integer NOT NULL,
	`product_id` text NOT NULL,
	`description` text,
	`hsn_sac` text,
	`qty_x1000` integer NOT NULL,
	`unit_id` text NOT NULL,
	`rate_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
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
	FOREIGN KEY (`return_id`) REFERENCES `purchase_returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_return_items_fy" CHECK("purchase_return_items"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "purchase_return_items_line_no" CHECK("purchase_return_items"."line_no" >= 1),
	CONSTRAINT "purchase_return_items_qty" CHECK("purchase_return_items"."qty_x1000" > 0),
	CONSTRAINT "purchase_return_items_amounts_non_negative" CHECK("purchase_return_items"."rate_paise" >= 0 AND "purchase_return_items"."discount_paise" >= 0 AND "purchase_return_items"."taxable_value_paise" >= 0 AND "purchase_return_items"."cgst_paise" >= 0 AND "purchase_return_items"."sgst_paise" >= 0 AND "purchase_return_items"."igst_paise" >= 0 AND "purchase_return_items"."cess_paise" >= 0),
	CONSTRAINT "purchase_return_items_rates_non_negative" CHECK("purchase_return_items"."cgst_bp" >= 0 AND "purchase_return_items"."sgst_bp" >= 0 AND "purchase_return_items"."igst_bp" >= 0 AND "purchase_return_items"."cess_bp" >= 0),
	CONSTRAINT "purchase_return_items_total" CHECK("purchase_return_items"."total_paise" = "purchase_return_items"."taxable_value_paise" + "purchase_return_items"."cgst_paise" + "purchase_return_items"."sgst_paise" + "purchase_return_items"."igst_paise" + "purchase_return_items"."cess_paise")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_return_items_parent_line_uq` ON `purchase_return_items` (`return_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `purchase_return_items_company_id_idx` ON `purchase_return_items` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `purchase_return_items_product_id_idx` ON `purchase_return_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `purchase_return_items_unit_id_idx` ON `purchase_return_items` (`unit_id`);--> statement-breakpoint
CREATE TABLE `purchase_returns` (
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
	CONSTRAINT "purchase_returns_fy" CHECK("purchase_returns"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "purchase_returns_date" CHECK("purchase_returns"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_returns_doc_no" CHECK("purchase_returns"."doc_no" >= 1),
	CONSTRAINT "purchase_returns_status" CHECK("purchase_returns"."status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "purchase_returns_cancellation" CHECK(("purchase_returns"."status" = 'CANCELLED') = ("purchase_returns"."cancel_reason" IS NOT NULL AND trim("purchase_returns"."cancel_reason") <> '' AND "purchase_returns"."cancelled_at" IS NOT NULL AND "purchase_returns"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "purchase_returns_place_of_supply" CHECK("purchase_returns"."place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "purchase_returns_due_date" CHECK("purchase_returns"."due_date" IS NULL OR "purchase_returns"."due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "purchase_returns_totals_non_negative" CHECK("purchase_returns"."discount_total_paise" >= 0 AND "purchase_returns"."taxable_total_paise" >= 0 AND "purchase_returns"."cgst_total_paise" >= 0 AND "purchase_returns"."sgst_total_paise" >= 0 AND "purchase_returns"."igst_total_paise" >= 0 AND "purchase_returns"."cess_total_paise" >= 0 AND "purchase_returns"."grand_total_paise" >= 0),
	CONSTRAINT "purchase_returns_tax_regime" CHECK(("purchase_returns"."igst_applicable" = 1 AND "purchase_returns"."cgst_total_paise" = 0 AND "purchase_returns"."sgst_total_paise" = 0) OR ("purchase_returns"."igst_applicable" = 0 AND "purchase_returns"."igst_total_paise" = 0)),
	CONSTRAINT "purchase_returns_grand_total" CHECK("purchase_returns"."grand_total_paise" = "purchase_returns"."taxable_total_paise" + "purchase_returns"."cgst_total_paise" + "purchase_returns"."sgst_total_paise" + "purchase_returns"."igst_total_paise" + "purchase_returns"."cess_total_paise" + "purchase_returns"."round_off_paise")
);
--> statement-breakpoint
CREATE INDEX `purchase_returns_company_date_idx` ON `purchase_returns` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_returns_doc_no_uq` ON `purchase_returns` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_returns_doc_number_uq` ON `purchase_returns` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `purchase_returns_party_id_idx` ON `purchase_returns` (`party_id`,`date`);--> statement-breakpoint
CREATE INDEX `purchase_returns_original_invoice_id_idx` ON `purchase_returns` (`original_invoice_id`);--> statement-breakpoint
CREATE TABLE `sales_invoice_items` (
	`invoice_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`line_no` integer NOT NULL,
	`product_id` text NOT NULL,
	`description` text,
	`hsn_sac` text,
	`qty_x1000` integer NOT NULL,
	`unit_id` text NOT NULL,
	`rate_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
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
	FOREIGN KEY (`invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_invoice_items_fy" CHECK("sales_invoice_items"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "sales_invoice_items_line_no" CHECK("sales_invoice_items"."line_no" >= 1),
	CONSTRAINT "sales_invoice_items_qty" CHECK("sales_invoice_items"."qty_x1000" > 0),
	CONSTRAINT "sales_invoice_items_amounts_non_negative" CHECK("sales_invoice_items"."rate_paise" >= 0 AND "sales_invoice_items"."discount_paise" >= 0 AND "sales_invoice_items"."taxable_value_paise" >= 0 AND "sales_invoice_items"."cgst_paise" >= 0 AND "sales_invoice_items"."sgst_paise" >= 0 AND "sales_invoice_items"."igst_paise" >= 0 AND "sales_invoice_items"."cess_paise" >= 0),
	CONSTRAINT "sales_invoice_items_rates_non_negative" CHECK("sales_invoice_items"."cgst_bp" >= 0 AND "sales_invoice_items"."sgst_bp" >= 0 AND "sales_invoice_items"."igst_bp" >= 0 AND "sales_invoice_items"."cess_bp" >= 0),
	CONSTRAINT "sales_invoice_items_total" CHECK("sales_invoice_items"."total_paise" = "sales_invoice_items"."taxable_value_paise" + "sales_invoice_items"."cgst_paise" + "sales_invoice_items"."sgst_paise" + "sales_invoice_items"."igst_paise" + "sales_invoice_items"."cess_paise")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoice_items_parent_line_uq` ON `sales_invoice_items` (`invoice_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `sales_invoice_items_company_id_idx` ON `sales_invoice_items` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `sales_invoice_items_product_id_idx` ON `sales_invoice_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `sales_invoice_items_unit_id_idx` ON `sales_invoice_items` (`unit_id`);--> statement-breakpoint
CREATE TABLE `sales_invoices` (
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
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_invoices_fy" CHECK("sales_invoices"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "sales_invoices_date" CHECK("sales_invoices"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_invoices_doc_no" CHECK("sales_invoices"."doc_no" >= 1),
	CONSTRAINT "sales_invoices_status" CHECK("sales_invoices"."status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "sales_invoices_cancellation" CHECK(("sales_invoices"."status" = 'CANCELLED') = ("sales_invoices"."cancel_reason" IS NOT NULL AND trim("sales_invoices"."cancel_reason") <> '' AND "sales_invoices"."cancelled_at" IS NOT NULL AND "sales_invoices"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "sales_invoices_place_of_supply" CHECK("sales_invoices"."place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "sales_invoices_due_date" CHECK("sales_invoices"."due_date" IS NULL OR "sales_invoices"."due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_invoices_totals_non_negative" CHECK("sales_invoices"."discount_total_paise" >= 0 AND "sales_invoices"."taxable_total_paise" >= 0 AND "sales_invoices"."cgst_total_paise" >= 0 AND "sales_invoices"."sgst_total_paise" >= 0 AND "sales_invoices"."igst_total_paise" >= 0 AND "sales_invoices"."cess_total_paise" >= 0 AND "sales_invoices"."grand_total_paise" >= 0),
	CONSTRAINT "sales_invoices_tax_regime" CHECK(("sales_invoices"."igst_applicable" = 1 AND "sales_invoices"."cgst_total_paise" = 0 AND "sales_invoices"."sgst_total_paise" = 0) OR ("sales_invoices"."igst_applicable" = 0 AND "sales_invoices"."igst_total_paise" = 0)),
	CONSTRAINT "sales_invoices_grand_total" CHECK("sales_invoices"."grand_total_paise" = "sales_invoices"."taxable_total_paise" + "sales_invoices"."cgst_total_paise" + "sales_invoices"."sgst_total_paise" + "sales_invoices"."igst_total_paise" + "sales_invoices"."cess_total_paise" + "sales_invoices"."round_off_paise")
);
--> statement-breakpoint
CREATE INDEX `sales_invoices_company_date_idx` ON `sales_invoices` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoices_doc_no_uq` ON `sales_invoices` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoices_doc_number_uq` ON `sales_invoices` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `sales_invoices_party_id_idx` ON `sales_invoices` (`party_id`,`date`);--> statement-breakpoint
CREATE TABLE `sales_return_items` (
	`return_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`line_no` integer NOT NULL,
	`product_id` text NOT NULL,
	`description` text,
	`hsn_sac` text,
	`qty_x1000` integer NOT NULL,
	`unit_id` text NOT NULL,
	`rate_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
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
	FOREIGN KEY (`return_id`) REFERENCES `sales_returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_return_items_fy" CHECK("sales_return_items"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "sales_return_items_line_no" CHECK("sales_return_items"."line_no" >= 1),
	CONSTRAINT "sales_return_items_qty" CHECK("sales_return_items"."qty_x1000" > 0),
	CONSTRAINT "sales_return_items_amounts_non_negative" CHECK("sales_return_items"."rate_paise" >= 0 AND "sales_return_items"."discount_paise" >= 0 AND "sales_return_items"."taxable_value_paise" >= 0 AND "sales_return_items"."cgst_paise" >= 0 AND "sales_return_items"."sgst_paise" >= 0 AND "sales_return_items"."igst_paise" >= 0 AND "sales_return_items"."cess_paise" >= 0),
	CONSTRAINT "sales_return_items_rates_non_negative" CHECK("sales_return_items"."cgst_bp" >= 0 AND "sales_return_items"."sgst_bp" >= 0 AND "sales_return_items"."igst_bp" >= 0 AND "sales_return_items"."cess_bp" >= 0),
	CONSTRAINT "sales_return_items_total" CHECK("sales_return_items"."total_paise" = "sales_return_items"."taxable_value_paise" + "sales_return_items"."cgst_paise" + "sales_return_items"."sgst_paise" + "sales_return_items"."igst_paise" + "sales_return_items"."cess_paise")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_return_items_parent_line_uq` ON `sales_return_items` (`return_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `sales_return_items_company_id_idx` ON `sales_return_items` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `sales_return_items_product_id_idx` ON `sales_return_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `sales_return_items_unit_id_idx` ON `sales_return_items` (`unit_id`);--> statement-breakpoint
CREATE TABLE `sales_returns` (
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
	CONSTRAINT "sales_returns_fy" CHECK("sales_returns"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "sales_returns_date" CHECK("sales_returns"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_returns_doc_no" CHECK("sales_returns"."doc_no" >= 1),
	CONSTRAINT "sales_returns_status" CHECK("sales_returns"."status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "sales_returns_cancellation" CHECK(("sales_returns"."status" = 'CANCELLED') = ("sales_returns"."cancel_reason" IS NOT NULL AND trim("sales_returns"."cancel_reason") <> '' AND "sales_returns"."cancelled_at" IS NOT NULL AND "sales_returns"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "sales_returns_place_of_supply" CHECK("sales_returns"."place_of_supply" GLOB '[0-9][0-9]'),
	CONSTRAINT "sales_returns_due_date" CHECK("sales_returns"."due_date" IS NULL OR "sales_returns"."due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "sales_returns_totals_non_negative" CHECK("sales_returns"."discount_total_paise" >= 0 AND "sales_returns"."taxable_total_paise" >= 0 AND "sales_returns"."cgst_total_paise" >= 0 AND "sales_returns"."sgst_total_paise" >= 0 AND "sales_returns"."igst_total_paise" >= 0 AND "sales_returns"."cess_total_paise" >= 0 AND "sales_returns"."grand_total_paise" >= 0),
	CONSTRAINT "sales_returns_tax_regime" CHECK(("sales_returns"."igst_applicable" = 1 AND "sales_returns"."cgst_total_paise" = 0 AND "sales_returns"."sgst_total_paise" = 0) OR ("sales_returns"."igst_applicable" = 0 AND "sales_returns"."igst_total_paise" = 0)),
	CONSTRAINT "sales_returns_grand_total" CHECK("sales_returns"."grand_total_paise" = "sales_returns"."taxable_total_paise" + "sales_returns"."cgst_total_paise" + "sales_returns"."sgst_total_paise" + "sales_returns"."igst_total_paise" + "sales_returns"."cess_total_paise" + "sales_returns"."round_off_paise")
);
--> statement-breakpoint
CREATE INDEX `sales_returns_company_date_idx` ON `sales_returns` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_returns_doc_no_uq` ON `sales_returns` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_returns_doc_number_uq` ON `sales_returns` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `sales_returns_party_id_idx` ON `sales_returns` (`party_id`,`date`);--> statement-breakpoint
CREATE INDEX `sales_returns_original_invoice_id_idx` ON `sales_returns` (`original_invoice_id`);--> statement-breakpoint
CREATE TABLE `bill_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`voucher_type` text NOT NULL,
	`voucher_id` text NOT NULL,
	`bill_type` text NOT NULL,
	`bill_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_allocations_fy" CHECK("bill_allocations"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "bill_allocations_voucher_type" CHECK("bill_allocations"."voucher_type" IN ('RECEIPT', 'PAYMENT', 'SALES_RETURN', 'PURCHASE_RETURN')),
	CONSTRAINT "bill_allocations_bill_type" CHECK("bill_allocations"."bill_type" IN ('SALES_INVOICE', 'PURCHASE_INVOICE')),
	CONSTRAINT "bill_allocations_amount" CHECK("bill_allocations"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE INDEX `bill_allocations_company_id_idx` ON `bill_allocations` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `bill_allocations_voucher_idx` ON `bill_allocations` (`voucher_type`,`voucher_id`);--> statement-breakpoint
CREATE INDEX `bill_allocations_bill_idx` ON `bill_allocations` (`bill_type`,`bill_id`);--> statement-breakpoint
CREATE TABLE `payments` (
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
	CONSTRAINT "payments_fy" CHECK("payments"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "payments_date" CHECK("payments"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "payments_doc_no" CHECK("payments"."doc_no" >= 1),
	CONSTRAINT "payments_status" CHECK("payments"."status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "payments_cancellation" CHECK(("payments"."status" = 'CANCELLED') = ("payments"."cancel_reason" IS NOT NULL AND trim("payments"."cancel_reason") <> '' AND "payments"."cancelled_at" IS NOT NULL AND "payments"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "payments_amount" CHECK("payments"."amount_paise" > 0),
	CONSTRAINT "payments_mode" CHECK("payments"."mode" IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'CARD', 'OTHER')),
	CONSTRAINT "payments_accounts_differ" CHECK("payments"."cash_bank_account_id" <> "payments"."counter_account_id"),
	CONSTRAINT "payments_reference_date" CHECK("payments"."reference_date" IS NULL OR "payments"."reference_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `payments_company_date_idx` ON `payments` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_doc_no_uq` ON `payments` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_doc_number_uq` ON `payments` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `payments_cash_bank_account_id_idx` ON `payments` (`cash_bank_account_id`);--> statement-breakpoint
CREATE INDEX `payments_counter_account_id_idx` ON `payments` (`counter_account_id`);--> statement-breakpoint
CREATE INDEX `payments_party_id_idx` ON `payments` (`party_id`);--> statement-breakpoint
CREATE TABLE `receipts` (
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
	CONSTRAINT "receipts_fy" CHECK("receipts"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "receipts_date" CHECK("receipts"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "receipts_doc_no" CHECK("receipts"."doc_no" >= 1),
	CONSTRAINT "receipts_status" CHECK("receipts"."status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "receipts_cancellation" CHECK(("receipts"."status" = 'CANCELLED') = ("receipts"."cancel_reason" IS NOT NULL AND trim("receipts"."cancel_reason") <> '' AND "receipts"."cancelled_at" IS NOT NULL AND "receipts"."cancelled_by" IS NOT NULL)),
	CONSTRAINT "receipts_amount" CHECK("receipts"."amount_paise" > 0),
	CONSTRAINT "receipts_mode" CHECK("receipts"."mode" IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'CARD', 'OTHER')),
	CONSTRAINT "receipts_accounts_differ" CHECK("receipts"."cash_bank_account_id" <> "receipts"."counter_account_id"),
	CONSTRAINT "receipts_reference_date" CHECK("receipts"."reference_date" IS NULL OR "receipts"."reference_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `receipts_company_date_idx` ON `receipts` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_doc_no_uq` ON `receipts` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_doc_number_uq` ON `receipts` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE INDEX `receipts_cash_bank_account_id_idx` ON `receipts` (`cash_bank_account_id`);--> statement-breakpoint
CREATE INDEX `receipts_counter_account_id_idx` ON `receipts` (`counter_account_id`);--> statement-breakpoint
CREATE INDEX `receipts_party_id_idx` ON `receipts` (`party_id`);--> statement-breakpoint
CREATE TABLE `stock_adjustment_items` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`adjustment_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`product_id` text NOT NULL,
	`qty_x1000` integer NOT NULL,
	`rate_paise` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adjustment_id`) REFERENCES `stock_adjustments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_adjustment_items_fy" CHECK("stock_adjustment_items"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "stock_adjustment_items_qty" CHECK("stock_adjustment_items"."qty_x1000" <> 0),
	CONSTRAINT "stock_adjustment_items_rate" CHECK("stock_adjustment_items"."rate_paise" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_adjustment_items_parent_line_uq` ON `stock_adjustment_items` (`adjustment_id`,`line_no`);--> statement-breakpoint
CREATE INDEX `stock_adjustment_items_company_id_idx` ON `stock_adjustment_items` (`company_id`,`financial_year`);--> statement-breakpoint
CREATE INDEX `stock_adjustment_items_product_id_idx` ON `stock_adjustment_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
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
	`reason` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `number_series`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_adjustments_fy" CHECK("stock_adjustments"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "stock_adjustments_date" CHECK("stock_adjustments"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "stock_adjustments_doc_no" CHECK("stock_adjustments"."doc_no" >= 1),
	CONSTRAINT "stock_adjustments_status" CHECK("stock_adjustments"."status" IN ('POSTED', 'CANCELLED')),
	CONSTRAINT "stock_adjustments_cancellation" CHECK(("stock_adjustments"."status" = 'CANCELLED') = ("stock_adjustments"."cancel_reason" IS NOT NULL AND trim("stock_adjustments"."cancel_reason") <> '' AND "stock_adjustments"."cancelled_at" IS NOT NULL AND "stock_adjustments"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `stock_adjustments_company_date_idx` ON `stock_adjustments` (`company_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_adjustments_doc_no_uq` ON `stock_adjustments` (`series_id`,`financial_year`,`doc_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_adjustments_doc_number_uq` ON `stock_adjustments` (`company_id`,`financial_year`,`doc_number`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
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
	CONSTRAINT "stock_movements_fy" CHECK("stock_movements"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "stock_movements_date" CHECK("stock_movements"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "stock_movements_type" CHECK("stock_movements"."movement_type" IN ('OPENING', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
	CONSTRAINT "stock_movements_source_doc_type" CHECK("stock_movements"."source_doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN', 'RECEIPT', 'PAYMENT', 'STOCK_ADJUSTMENT')),
	CONSTRAINT "stock_movements_rate" CHECK("stock_movements"."rate_paise" >= 0),
	CONSTRAINT "stock_movements_sign" CHECK("stock_movements"."qty_x1000" <> 0 AND (("stock_movements"."movement_type" IN ('OPENING', 'PURCHASE', 'SALE_RETURN', 'ADJUSTMENT_IN')) = ("stock_movements"."qty_x1000" > 0)) = ("stock_movements"."reverses_movement_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `stock_movements_company_date_idx` ON `stock_movements` (`company_id`,`date`);--> statement-breakpoint
CREATE INDEX `stock_movements_product_date_idx` ON `stock_movements` (`product_id`,`date`);--> statement-breakpoint
CREATE INDEX `stock_movements_source_idx` ON `stock_movements` (`source_doc_type`,`source_doc_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_reverses_uq` ON `stock_movements` (`reverses_movement_id`) WHERE "stock_movements"."reverses_movement_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `einvoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`source_doc_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`request_json` text,
	`response_json` text,
	`error_code` text,
	`error_message` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`cancel_reason` text,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`source_doc_type` text NOT NULL,
	`irn` text,
	`ack_no` text,
	`ack_date` text,
	`signed_invoice` text,
	`signed_qr` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "einvoices_fy" CHECK("einvoices"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "einvoices_status" CHECK("einvoices"."status" IN ('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'GENERATED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "einvoices_source_doc_type" CHECK("einvoices"."source_doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_RETURN')),
	CONSTRAINT "einvoices_irn_len" CHECK("einvoices"."irn" IS NULL OR length("einvoices"."irn") = 64),
	CONSTRAINT "einvoices_generated_has_irn" CHECK("einvoices"."status" <> 'GENERATED' OR ("einvoices"."irn" IS NOT NULL AND "einvoices"."ack_no" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `einvoices_company_id_idx` ON `einvoices` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `einvoices_source_idx` ON `einvoices` (`source_doc_type`,`source_doc_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `einvoices_active_source_uq` ON `einvoices` (`source_doc_type`,`source_doc_id`) WHERE "einvoices"."status" NOT IN ('FAILED', 'CANCELLED');--> statement-breakpoint
CREATE UNIQUE INDEX `einvoices_irn_uq` ON `einvoices` (`irn`) WHERE "einvoices"."irn" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `ewaybills` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`financial_year` text NOT NULL,
	`source_doc_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`request_json` text,
	`response_json` text,
	`error_code` text,
	`error_message` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`cancel_reason` text,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`source_doc_type` text NOT NULL,
	`einvoice_id` text,
	`ewb_no` text,
	`ewb_date` text,
	`valid_upto` text,
	`transport_mode` text,
	`vehicle_no` text,
	`transporter_id` text,
	`transporter_name` text,
	`transport_doc_no` text,
	`distance_km` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`einvoice_id`) REFERENCES `einvoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ewaybills_fy" CHECK("ewaybills"."financial_year" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "ewaybills_status" CHECK("ewaybills"."status" IN ('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'GENERATED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "ewaybills_source_doc_type" CHECK("ewaybills"."source_doc_type" IN ('SALES_INVOICE', 'SALES_RETURN', 'PURCHASE_INVOICE', 'PURCHASE_RETURN')),
	CONSTRAINT "ewaybills_transport_mode" CHECK("ewaybills"."transport_mode" IS NULL OR "ewaybills"."transport_mode" IN ('ROAD', 'RAIL', 'AIR', 'SHIP')),
	CONSTRAINT "ewaybills_distance" CHECK("ewaybills"."distance_km" IS NULL OR "ewaybills"."distance_km" >= 0),
	CONSTRAINT "ewaybills_generated_has_no" CHECK("ewaybills"."status" <> 'GENERATED' OR "ewaybills"."ewb_no" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `ewaybills_company_id_idx` ON `ewaybills` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `ewaybills_source_idx` ON `ewaybills` (`source_doc_type`,`source_doc_id`);--> statement-breakpoint
CREATE INDEX `ewaybills_einvoice_id_idx` ON `ewaybills` (`einvoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ewaybills_active_source_uq` ON `ewaybills` (`source_doc_type`,`source_doc_id`) WHERE "ewaybills"."status" NOT IN ('FAILED', 'CANCELLED');--> statement-breakpoint
CREATE UNIQUE INDEX `ewaybills_ewb_no_uq` ON `ewaybills` (`ewb_no`) WHERE "ewaybills"."ewb_no" IS NOT NULL;--> statement-breakpoint
CREATE VIEW `product_stock` AS select "company_id", "product_id", coalesce(sum("qty_x1000"), 0) as "qty_x1000" from "stock_movements" group by "stock_movements"."company_id", "stock_movements"."product_id";