CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`rail` text NOT NULL,
	`route_id` text,
	`chain` text NOT NULL,
	`hash` text,
	`from_id` text NOT NULL,
	`amount_value` text NOT NULL,
	`symbol` text NOT NULL,
	`chain_id` integer,
	`status` text NOT NULL,
	`route_progress` text
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`amount_value` text NOT NULL,
	`amount_symbol` text NOT NULL,
	`pay_to_chain` text NOT NULL,
	`pay_to_address` text NOT NULL,
	`memo` text,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`status` text NOT NULL,
	`supported_rails` text
);
--> statement-breakpoint
CREATE TABLE `tab_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tab_id` text NOT NULL,
	`by` text NOT NULL,
	`amount_value` text NOT NULL,
	`symbol` text NOT NULL,
	`memo` text,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tab_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`tab_id` text NOT NULL,
	`nick` text NOT NULL,
	`address` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`owner_address` text NOT NULL,
	`symbol` text NOT NULL,
	`settlement_chain` text NOT NULL,
	`status` text NOT NULL,
	`settlement_invoice_ids` text,
	`settlement_links` text
);
