import { db } from "../db/client";
import { invoices, invoicePayments } from "../db/schema";
import { eq } from "drizzle-orm";

export type EnhancedInvoiceRecord = {
  id: string;
  amount: { value: string; asset: { symbol: string } };
  payTo: { chain: string; address: string };
  memo?: string;
  createdAt: number;
  status: "open" | "paid" | "expired";
  supportedRails?: string[];
  payments?: Array<{
    id?: string;
    rail: string;
    routeId?: string;
    chain: string;
    hash?: string;
    from: string;
    amount: string;
    symbol: string;
    chainId?: number;
    status: "pending" | "bridging" | "swapping" | "succeeded" | "failed";
    routeProgress?: any[];
  }>;
};

function toInvoiceRow(r: EnhancedInvoiceRecord) {
  return {
    id: r.id,
    amountValue: r.amount.value,
    amountSymbol: r.amount.asset.symbol,
    payToChain: r.payTo.chain,
    payToAddress: r.payTo.address,
    memo: r.memo,
    createdAt: r.createdAt,
    status: r.status,
    supportedRails: r.supportedRails ? JSON.stringify(r.supportedRails) : null,
  } as typeof invoices.$inferInsert;
}

function fromInvoiceRow(row: typeof invoices.$inferSelect): EnhancedInvoiceRecord {
  return {
    id: row.id,
    amount: { value: row.amountValue, asset: { symbol: row.amountSymbol } },
    payTo: { chain: row.payToChain, address: row.payToAddress },
    memo: row.memo ?? undefined,
    createdAt: row.createdAt,
    status: row.status as any,
    supportedRails: row.supportedRails ? JSON.parse(row.supportedRails) : undefined,
  };
}

export const InvoiceRepo = {
  async create(inv: EnhancedInvoiceRecord) {
    await db.insert(invoices).values(toInvoiceRow(inv));
  },
  async upsert(inv: EnhancedInvoiceRecord) {
    // drizzle sqlite doesn't have onConflict helper universally; do naive replace
    // delete then insert
    await db.delete(invoices).where(eq(invoices.id, inv.id));
    await db.insert(invoices).values(toInvoiceRow(inv));
  },
  async getById(id: string): Promise<EnhancedInvoiceRecord | null> {
    const rows = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!rows[0]) return null;
    const base = fromInvoiceRow(rows[0]);
    const pays = await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, id));
    base.payments = pays.map((p) => ({
      id: p.id,
      rail: p.rail!,
      routeId: p.routeId ?? undefined,
      chain: p.chain!,
      hash: p.hash ?? undefined,
      from: p.fromId!,
      amount: p.amountValue!,
      symbol: p.symbol!,
      chainId: p.chainId ?? undefined,
      status: p.status as any,
      routeProgress: p.routeProgress ? JSON.parse(p.routeProgress) : undefined,
    }));
    return base;
  },
  async list(): Promise<EnhancedInvoiceRecord[]> {
    const rows = await db.select().from(invoices);
    return rows.map(fromInvoiceRow);
  },
  async addPayment(invoiceId: string, payment: NonNullable<EnhancedInvoiceRecord["payments"]>[number]) {
    const id = payment.id || `${invoiceId}-${Date.now()}`;
    await db.insert(invoicePayments).values({
      id,
      invoiceId,
      rail: payment.rail,
      routeId: payment.routeId ?? null,
      chain: payment.chain,
      hash: payment.hash ?? null,
      fromId: payment.from,
      amountValue: payment.amount,
      symbol: payment.symbol,
      chainId: payment.chainId ?? null,
      status: payment.status,
      routeProgress: payment.routeProgress ? JSON.stringify(payment.routeProgress) : null,
    });
    return id;
  },
  async updateStatus(id: string, status: EnhancedInvoiceRecord["status"]) {
    await db.update(invoices).set({ status }).where(eq(invoices.id, id));
  },
  async updatePayment(paymentId: string, updates: { status?: EnhancedInvoiceRecord["payments"][number]["status"]; routeProgress?: any[] }) {
    await db
      .update(invoicePayments)
      .set({
        status: updates.status ?? undefined,
        routeProgress: updates.routeProgress ? JSON.stringify(updates.routeProgress) : undefined,
      })
      .where(eq(invoicePayments.id, paymentId));
  },
};


