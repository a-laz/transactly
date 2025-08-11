import { db } from "../db/client";
import { webhooksDlq, webhooksOutbox } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";

export type WebhookEvent = {
  id: string;
  type: string;
  targetUrl: string;
  payload: unknown;
};

export const WebhookRepo = {
  async enqueue(e: WebhookEvent) {
    const now = Date.now();
    await db.insert(webhooksOutbox).values({
      id: e.id,
      eventId: e.id,
      eventType: e.type,
      targetUrl: e.targetUrl,
      payload: JSON.stringify(e.payload),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
  async pickNext(limit = 10) {
    const now = Date.now();
    const rows = await db
      .select()
      .from(webhooksOutbox)
      .where(and(eq(webhooksOutbox.status, "pending"), sql`${webhooksOutbox.nextAttemptAt} <= ${now}`))
      .limit(limit);
    return rows;
  },
  async markDelivering(id: string) {
    await db.update(webhooksOutbox).set({ status: "delivering", updatedAt: Date.now() }).where(eq(webhooksOutbox.id, id));
  },
  async markDelivered(id: string) {
    await db.update(webhooksOutbox).set({ status: "delivered", updatedAt: Date.now() }).where(eq(webhooksOutbox.id, id));
  },
  async bumpRetry(id: string, attempts: number, nextMs: number, lastError?: string) {
    await db
      .update(webhooksOutbox)
      .set({ attempts, nextAttemptAt: nextMs, status: "pending", lastError: lastError || null, updatedAt: Date.now() })
      .where(eq(webhooksOutbox.id, id));
  },
  async deadLetter(row: typeof webhooksOutbox.$inferSelect, error: string) {
    const id = `${row.id}-dlq`;
    await db.insert(webhooksDlq).values({
      id,
      outboxId: row.id,
      eventId: row.eventId,
      eventType: row.eventType,
      targetUrl: row.targetUrl,
      payload: row.payload,
      attempts: row.attempts,
      error,
    });
    await db.update(webhooksOutbox).set({ status: "dead", updatedAt: Date.now(), lastError: error }).where(eq(webhooksOutbox.id, row.id));
  },
};


