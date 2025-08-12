CREATE TABLE `api_key_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`superseded_at` integer
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
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
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quotas` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`period` text NOT NULL,
	`limit` integer NOT NULL,
	`burst` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`period` text NOT NULL,
	`period_start_ms` integer NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`last_hit_ms` integer
);
