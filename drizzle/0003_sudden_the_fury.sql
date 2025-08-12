PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_key_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`superseded_at` integer,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_key_versions`("id", "api_key_id", "prefix", "key_hash", "salt", "created_at", "superseded_at") SELECT "id", "api_key_id", "prefix", "key_hash", "salt", "created_at", "superseded_at" FROM `api_key_versions`;--> statement-breakpoint
DROP TABLE `api_key_versions`;--> statement-breakpoint
ALTER TABLE `__new_api_key_versions` RENAME TO `api_key_versions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`salt` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`alias` text,
	`scope` text,
	`rate_limit_override_json` text,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "project_id", "prefix", "key_hash", "salt", "status", "alias", "scope", "rate_limit_override_json", "created_at", "expires_at", "last_used_at") SELECT "id", "project_id", "prefix", "key_hash", "salt", "status", "alias", "scope", "rate_limit_override_json", "created_at", "expires_at", "last_used_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
CREATE TABLE `__new_invoice_payments` (
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
	`route_progress` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_invoice_payments`("id", "invoice_id", "rail", "route_id", "chain", "hash", "from_id", "amount_value", "symbol", "chain_id", "status", "route_progress") SELECT "id", "invoice_id", "rail", "route_id", "chain", "hash", "from_id", "amount_value", "symbol", "chain_id", "status", "route_progress" FROM `invoice_payments`;--> statement-breakpoint
DROP TABLE `invoice_payments`;--> statement-breakpoint
ALTER TABLE `__new_invoice_payments` RENAME TO `invoice_payments`;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "org_id", "name", "created_at") SELECT "id", "org_id", "name", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE TABLE `__new_tab_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tab_id` text NOT NULL,
	`by` text NOT NULL,
	`amount_value` text NOT NULL,
	`symbol` text NOT NULL,
	`memo` text,
	`ts` integer NOT NULL,
	FOREIGN KEY (`tab_id`) REFERENCES `tabs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tab_items`("id", "tab_id", "by", "amount_value", "symbol", "memo", "ts") SELECT "id", "tab_id", "by", "amount_value", "symbol", "memo", "ts" FROM `tab_items`;--> statement-breakpoint
DROP TABLE `tab_items`;--> statement-breakpoint
ALTER TABLE `__new_tab_items` RENAME TO `tab_items`;--> statement-breakpoint
CREATE TABLE `__new_tab_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`tab_id` text NOT NULL,
	`nick` text NOT NULL,
	`address` text NOT NULL,
	FOREIGN KEY (`tab_id`) REFERENCES `tabs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tab_participants`("id", "tab_id", "nick", "address") SELECT "id", "tab_id", "nick", "address" FROM `tab_participants`;--> statement-breakpoint
DROP TABLE `tab_participants`;--> statement-breakpoint
ALTER TABLE `__new_tab_participants` RENAME TO `tab_participants`;--> statement-breakpoint
CREATE TABLE `__new_webhooks_dlq` (
	`id` text PRIMARY KEY NOT NULL,
	`outbox_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`target_url` text NOT NULL,
	`payload` text NOT NULL,
	`error` text,
	`attempts` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`outbox_id`) REFERENCES `webhooks_outbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_webhooks_dlq`("id", "outbox_id", "event_id", "event_type", "target_url", "payload", "error", "attempts", "created_at") SELECT "id", "outbox_id", "event_id", "event_type", "target_url", "payload", "error", "attempts", "created_at" FROM `webhooks_dlq`;--> statement-breakpoint
DROP TABLE `webhooks_dlq`;--> statement-breakpoint
ALTER TABLE `__new_webhooks_dlq` RENAME TO `webhooks_dlq`;