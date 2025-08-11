CREATE TABLE `webhooks_dlq` (
	`id` text PRIMARY KEY NOT NULL,
	`outbox_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`target_url` text NOT NULL,
	`payload` text NOT NULL,
	`error` text,
	`attempts` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhooks_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`target_url` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
