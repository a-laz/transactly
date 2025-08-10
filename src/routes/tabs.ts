// src/routes/tabs.ts
import { Hono } from "hono";

// ---- Types / Store ----
type Money = { value: string; symbol: "ETH" | "USDC" | "NEAR" };
type Participant = { id: string; address: string }; // wallet/account
type Charge = { id: string; by: string; amount: Money; memo?: string; ts: number };

export type Tab = {
  id: string;
  name: string;
  owner: Participant;              // who receives settlement
  symbol: Money["symbol"];
  participants: Participant[];     // includes owner
  items: Charge[];
  status: "open" | "settled";
  settlement?: { invoiceIds: string[]; links: string[] };
};

// in-memory stores
const TABS = new Map<string, Tab>();

// simple id
const rid = () => Math.random().toString(36).slice(2, 10);

// We’ll call into your existing invoice creator.
// Export a tiny interface the transaction router can provide.
export type CreateInvoiceFn = (args: {
  amount: Money;
  payTo: { chain: "sepolia" | "near"; address: string };
  memo?: string;
}) => Promise<{ id: string; link: string }>;

export default function makeTabsRouter(createInvoice: CreateInvoiceFn) {
  const app = new Hono();

  // ---- UI: lightweight Tabs home ----
  app.get("/tabs", (c) => {
    const list = [...TABS.values()].sort((a, b) => b.items.length - a.items.length);
    return c.html(`
      <html><body style="font-family:sans-serif;max-width:720px;margin:32px auto">
        <a href="/" style="text-decoration:none"><button>Home</button></a>
        <h2>Tabs</h2>
        <div style="border:1px solid #eee;padding:16px;border-radius:12px;margin:12px 0">
          <h3>Start a Tab</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <input id="tabName" placeholder="Team lunch" />
            <select id="symbol"><option>ETH</option><option>USDC</option><option>NEAR</option></select>
            <input id="ownerId" placeholder="owner-id (you)" />
            <input id="ownerAddr" placeholder="owner address (receives settlement)" />
            <textarea id="participants" rows="3" placeholder="participantId:address per line"></textarea>
          </div>
          <div style="margin-top:10px">
            <button onclick="startTab()">Create</button>
            <span id="msg" style="margin-left:8px;color:#666"></span>
          </div>
        </div>
        <h3>Open Tabs</h3>
        <div id="list">
          ${list.map(t => `
            <div style="border:1px solid #eee;padding:12px;border-radius:10px;margin:8px 0">
              <b>${t.name}</b> • ${t.symbol} • ${t.status} • items: ${t.items.length}
              <a href="/tab/${t.id}" style="margin-left:8px"><button>Open</button></a>
            </div>
          `).join("")}
        </div>
        <script>
          async function startTab(){
            const body = {
              name: document.getElementById('tabName').value,
              symbol: document.getElementById('symbol').value,
              owner: { id: document.getElementById('ownerId').value, address: document.getElementById('ownerAddr').value },
              participants: document.getElementById('participants').value
                .split('\\n').map(l => l.trim()).filter(Boolean)
                .map(l => { const [id,address] = l.split(':'); return { id, address }; })
            };
            const res = await fetch('/tab', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
            const j = await res.json();
            document.getElementById('msg').textContent = res.ok ? ('Created: /tab/' + j.id) : (j.error||'Failed');
            if(res.ok) location.href = '/tab/' + j.id;
          }
        </script>
      </body></html>
    `);
  });

  // ---- API: create tab ----
  app.post("/tab", async (c) => {
    const body = await c.req.json() as {
      name: string; symbol: Money["symbol"];
      owner: Participant; participants: Participant[];
    };
    if (!body?.name || !body?.symbol || !body?.owner?.address) {
      return c.json({ error: "name, symbol, owner{address} required" }, 400);
    }
    const tab: Tab = {
      id: rid(),
      name: body.name,
      symbol: body.symbol,
      owner: body.owner,
      participants: Array.isArray(body.participants) ? [body.owner, ...body.participants.filter(p => p.id !== body.owner.id)] : [body.owner],
      items: [],
      status: "open",
    };
    TABS.set(tab.id, tab);
    return c.json({ id: tab.id, tab });
  });

  // ---- UI: tab page ----
  app.get("/tab/:id", (c) => {
    const t = TABS.get(c.req.param("id"));
    if (!t) return c.text("Tab not found", 404);
    const total = t.items.reduce((s, x) => s + Number(x.amount.value), 0);
    return c.html(`
      <html><body style="font-family:sans-serif;max-width:720px;margin:32px auto">
        <a href="/tabs" style="text-decoration:none"><button>Tabs</button></a>
        <a href="/" style="text-decoration:none;margin-left:8px"><button>Home</button></a>
        <h2>${t.name} <small style="color:#666">(${t.status})</small></h2>
        <div>Participants: ${t.participants.map(p => p.id).join(", ")}</div>
        <div style="margin-top:8px">Total: <b>${total.toFixed(4)} ${t.symbol}</b></div>

        <div style="border:1px solid #eee;padding:12px;border-radius:10px;margin:12px 0">
          <h3>Add Charge</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <input id="by" placeholder="who (id)" />
            <input id="amount" placeholder="0.01" />
            <input id="memo" placeholder="memo (optional)" />
          </div>
          <div style="margin-top:8px">
            <button onclick="addCharge()">Add</button>
            <button style="margin-left:8px;background:#0f766e" onclick="settle()">Settle</button>
            <span id="msg" style="margin-left:8px;color:#666"></span>
          </div>
        </div>

        <h3>Items</h3>
        <div id="items">${t.items.map(i => `<div>• ${i.by} — ${i.amount.value} ${i.amount.symbol} — ${i.memo||""}</div>`).join("")}</div>

        <div id="settlement"></div>

        <script>
          async function addCharge(){
            const res = await fetch('/tab/${t.id}/charge', {
              method:'POST', headers:{'content-type':'application/json'},
              body: JSON.stringify({ by: document.getElementById('by').value, amount: { value: document.getElementById('amount').value, symbol: '${t.symbol}' }, memo: document.getElementById('memo').value })
            });
            const j = await res.json();
            document.getElementById('msg').textContent = res.ok ? 'Added' : (j.error||'Failed');
            if(res.ok) location.reload();
          }
          async function settle(){
            const res = await fetch('/tab/${t.id}/settle', { method:'POST' });
            const j = await res.json();
            if(!res.ok){ alert(j.error || 'Failed'); return; }
            const links = j.links.map(l => '<div><a href=\"'+l+'\" target=\"_blank\">'+l+'</a></div>').join('');
            document.getElementById('settlement').innerHTML = '<h3>Pay Links</h3>' + links;
          }
        </script>
      </body></html>
    `);
  });

  // ---- API: add charge ----
  app.post("/tab/:id/charge", async (c) => {
    const id = c.req.param("id");
    const t = TABS.get(id);
    if (!t) return c.json({ error: "not found" }, 404);
    if (t.status !== "open") return c.json({ error: "tab settled" }, 400);

    const { by, amount, memo } = await c.req.json() as { by: string; amount: Money; memo?: string };
    if (!by || !amount?.value) return c.json({ error: "by, amount{value} required" }, 400);

    t.items.push({ id: rid(), by, amount: { value: String(amount.value), symbol: t.symbol }, memo, ts: Date.now() });
    return c.json({ ok: true, tab: t });
  });

  // ---- API: settle (equal split to owner) ----
  app.post("/tab/:id/settle", async (c) => {
    const id = c.req.param("id");
    const t = TABS.get(id);
    if (!t) return c.json({ error: "not found" }, 404);
    if (t.status !== "open") return c.json({ error: "already settled" }, 400);
    if (!t.participants.length) return c.json({ error: "no participants" }, 400);

    const total = t.items.reduce((s, x) => s + Number(x.amount.value), 0);
    const each = total / t.participants.length;

    const invoiceIds: string[] = [];
    const links: string[] = [];
    for (const p of t.participants) {
      if (p.id === t.owner.id) continue; // owner doesn’t pay themselves
      const inv = await createInvoice({
        amount: { value: each.toFixed(6), symbol: t.symbol },
        payTo: { chain: "sepolia", address: t.owner.address },
        memo: `Tab: ${t.name} — ${p.id}`,
      });
      invoiceIds.push(inv.id);
      links.push(inv.link);
    }

    t.status = "settled";
    t.settlement = { invoiceIds, links };
    return c.json({ ok: true, id: t.id, invoiceIds, links });
  });

  return app;
}
