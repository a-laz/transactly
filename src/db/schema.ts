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
  invoiceId: text("invoice_id").notNull(), // references invoices.id
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
  tabId: text("tab_id").notNull(), // references tabs.id
  nick: text("nick").notNull(),
  address: text("address").notNull(),
});

export const tabItems = sqliteTable("tab_items", {
  id: text("id").primaryKey(),
  tabId: text("tab_id").notNull(),
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
  outboxId: text("outbox_id").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  targetUrl: text("target_url").notNull(),
  payload: text("payload").notNull(),
  error: text("error"),
  attempts: integer("attempts").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now') * 1000)`),
});


