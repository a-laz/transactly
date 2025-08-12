import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// invoices
export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  amountValue: text("amount_value").notNull(),
  amountSymbol: text("amount_symbol").notNull(),
  payToChain: text("pay_to_chain").notNull(),
  payToAddress: text("pay_to_address").notNull(),
  memo: text("memo"),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
  status: text("status").notNull(), // open | paid | expired
  supportedRails: text("supported_rails"), // json string
});

export const invoicePayments = sqliteTable("invoice_payments", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }), // references invoices.id
  rail: text("rail").notNull(),
  routeId: text("route_id"),
  chain: text("chain").notNull(),
  hash: text("hash"),
  fromId: text("from_id").notNull(),
  amountValue: text("amount_value").notNull(),
  symbol: text("symbol").notNull(),
  chainId: integer("chain_id"),
  status: text("status").notNull(), // pending | bridging | swapping | succeeded | failed
  routeProgress: text("route_progress"), // json string
});

// tabs
export const tabs = sqliteTable("tabs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  ownerAddress: text("owner_address").notNull(),
  symbol: text("symbol").notNull(), // ETH | USDC | NEAR
  settlementChain: text("settlement_chain").notNull(), // sepolia | near
  status: text("status").notNull(), // open | settled
  settlementInvoiceIds: text("settlement_invoice_ids"), // json string
  settlementLinks: text("settlement_links"), // json string
});

export const tabParticipants = sqliteTable("tab_participants", {
  id: text("id").primaryKey(),
  tabId: text("tab_id").notNull().references(() => tabs.id, { onDelete: 'cascade' }), // references tabs.id
  nick: text("nick").notNull(),
  address: text("address").notNull(),
});

export const tabItems = sqliteTable("tab_items", {
  id: text("id").primaryKey(),
  tabId: text("tab_id").notNull().references(() => tabs.id, { onDelete: 'cascade' }),
  by: text("by").notNull(),
  amountValue: text("amount_value").notNull(),
  symbol: text("symbol").notNull(),
  memo: text("memo"),
  ts: integer("ts").notNull(),
});

// webhooks (outbox + dead-letter queue)
export const webhooksOutbox = sqliteTable("webhooks_outbox", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  targetUrl: text("target_url").notNull(),
  payload: text("payload").notNull(), // json string
  status: text("status").notNull(), // pending | delivering | delivered | failed | dead
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at"), // ms epoch
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
});

export const webhooksDlq = sqliteTable("webhooks_dlq", {
  id: text("id").primaryKey(),
  outboxId: text("outbox_id").notNull().references(() => webhooksOutbox.id, { onDelete: 'cascade' }),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  targetUrl: text("target_url").notNull(),
  payload: text("payload").notNull(),
  error: text("error"),
  attempts: integer("attempts").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
});

// ---------------
// Orgs/Projects/Keys/Quotas
// ---------------
export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  salt: text("salt").notNull(),
  status: text("status").notNull().default('active'), // active | revoked
  alias: text("alias"),
  scope: text("scope"),
  rateLimitOverride: text("rate_limit_override_json"), // json
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
  expiresAt: integer("expires_at"),
  lastUsedAt: integer("last_used_at"),
});

export const apiKeyVersions = sqliteTable("api_key_versions", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
  supersededAt: integer("superseded_at"),
});

export const quotas = sqliteTable("quotas", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  period: text("period").notNull(), // minute | hour | day
  limit: integer("limit").notNull(),
  burst: integer("burst").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
});

export const usageCounters = sqliteTable("usage_counters", {
  id: text("id").primaryKey(),
  apiKeyId: text("api_key_id").notNull(),
  period: text("period").notNull(),
  periodStartMs: integer("period_start_ms").notNull(),
  hits: integer("hits").notNull().default(0),
  lastHitMs: integer("last_hit_ms"),
});


