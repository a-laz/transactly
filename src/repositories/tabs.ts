import { db } from "../db/client";
import { tabItems, tabParticipants, tabs } from "../db/schema";
import { eq } from "drizzle-orm";

export type Money = { value: string; symbol: "ETH" | "USDC" | "NEAR" };
export type Participant = { id: string; address: string };
export type Charge = { id: string; by: string; amount: Money; memo?: string; ts: number };

export type TabRecord = {
  id: string;
  name: string;
  owner: Participant;
  symbol: Money["symbol"];
  settlementChain: "sepolia" | "near";
  participants: Participant[];
  items: Charge[];
  status: "open" | "settled";
  settlement?: { invoiceIds: string[]; links: string[]; pairs?: Array<{ debtor: string; creditor: string; link: string }> };
};

function toTabRow(t: TabRecord) {
  return {
    id: t.id,
    name: t.name,
    ownerId: t.owner.id,
    ownerAddress: t.owner.address,
    symbol: t.symbol,
    settlementChain: t.settlementChain,
    status: t.status,
    settlementInvoiceIds: t.settlement?.invoiceIds ? JSON.stringify(t.settlement.invoiceIds) : null,
    settlementLinks: t.settlement?.links ? JSON.stringify(t.settlement.links) : null,
  } as typeof tabs.$inferInsert;
}

function fromTabRow(row: typeof tabs.$inferSelect): TabRecord {
  return {
    id: row.id,
    name: row.name,
    owner: { id: row.ownerId, address: row.ownerAddress },
    symbol: row.symbol as any,
    settlementChain: row.settlementChain as any,
    participants: [],
    items: [],
    status: row.status as any,
    settlement: {
      invoiceIds: row.settlementInvoiceIds ? JSON.parse(row.settlementInvoiceIds) : [],
      links: row.settlementLinks ? JSON.parse(row.settlementLinks) : [],
    },
  };
}

export const TabsRepo = {
  async create(tab: TabRecord) {
    await db.insert(tabs).values(toTabRow(tab));
    // participants
    for (const p of tab.participants) {
      await db.insert(tabParticipants).values({ id: `${tab.id}-${p.address.toLowerCase()}`, tabId: tab.id, nick: p.id, address: p.address });
    }
  },
  async getById(id: string): Promise<TabRecord | null> {
    const rows = await db.select().from(tabs).where(eq(tabs.id, id));
    if (!rows[0]) return null;
    const base = fromTabRow(rows[0]);
    const parts = await db.select().from(tabParticipants).where(eq(tabParticipants.tabId, id));
    base.participants = parts.map((p) => ({ id: p.nick, address: p.address }));
    const items = await db.select().from(tabItems).where(eq(tabItems.tabId, id));
    base.items = items.map((i) => ({ id: i.id, by: i.by, amount: { value: i.amountValue, symbol: i.symbol as any }, memo: i.memo ?? undefined, ts: i.ts }));
    return base;
  },
  async list() {
    const rows = await db.select().from(tabs);
    return rows.map(fromTabRow);
  },
  async addParticipant(tabId: string, p: Participant) {
    await db.insert(tabParticipants).values({ id: `${tabId}-${p.address.toLowerCase()}`, tabId, nick: p.id, address: p.address });
  },
  async addItem(tabId: string, item: Charge) {
    await db.insert(tabItems).values({ id: item.id, tabId, by: item.by, amountValue: item.amount.value, symbol: item.amount.symbol, memo: item.memo ?? null, ts: item.ts });
  },
  async updateSettlement(tabId: string, settlement: NonNullable<TabRecord["settlement"]>) {
    await db.update(tabs)
      .set({ settlementInvoiceIds: JSON.stringify(settlement.invoiceIds), settlementLinks: JSON.stringify(settlement.links), status: "settled" })
      .where(eq(tabs.id, tabId));
  },
};


