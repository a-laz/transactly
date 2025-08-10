// at top of tabs.ts (if not already)
import { Hono } from "hono";

type Money = { value: string; symbol: "ETH" | "USDC" | "NEAR" };
type Participant = { id: string; address: string };
type Charge = { id: string; by: string; amount: Money; memo?: string; ts: number };

export type Tab = {
  id: string;
  name: string;
  owner: Participant;
  symbol: Money["symbol"];
  participants: Participant[];     // includes owner
  items: Charge[];
  status: "open" | "settled";
  settlement?: { invoiceIds: string[]; links: string[] };
};

const TABS = new Map<string, Tab>();
const rid = () => Math.random().toString(36).slice(2, 10);

export type CreateInvoiceFn = (args: {
  amount: Money;
  payTo: { chain: "sepolia" | "near"; address: string };
  memo?: string;
}) => Promise<{ id: string; link: string }>;

export default function makeTabsRouter(createInvoice: CreateInvoiceFn) {
  const app = new Hono();

  // ---------- Tabs home (owner flow) ----------
  app.get("/tabs", (c) => {
    const list = [...TABS.values()].filter(t => t.status === "open");
    return c.html(`
      <html><head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Tabs</title>
        <style>
          body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px;}
          .card{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
          input,select,textarea{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:6px}
          button{padding:10px 14px;border:0;border-radius:10px;background:#111827;color:#fff;cursor:pointer}
          .secondary{background:#6b7280}
          .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
          .muted{color:#6b7280}
        </style>
      </head>
      <body>
        <a href="/" style="text-decoration:none"><button class="secondary">Home</button></a>
        <h2>Tabs</h2>

        <div class="card">
          <h3>Start a Tab</h3>
          <div class="row">
            <input id="tabName" placeholder="Team lunch" />
            <select id="symbol"><option>ETH</option><option>USDC</option><option>NEAR</option></select>
            <input id="ownerId" placeholder="your name (e.g. maria)" />
            <input id="ownerAddr" placeholder="owner address (receives settlement)" />
          </div>
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center">
            <button id="linkWallet" class="secondary">Link Wallet</button>
            <button id="create">Create & Show QR</button>
            <span id="msg" class="muted"></span>
          </div>
        </div>

        <h3>Open Tabs</h3>
        ${list.map(t => `
          <div class="card">
            <b>${t.name}</b> · ${t.symbol} · participants: ${t.participants.length}
            <div style="margin-top:8px">
              <a href="/tab/${t.id}" style="text-decoration:none"><button>Open</button></a>
            </div>
          </div>
        `).join('')}

        <script>
          async function linkWallet(){
            try{
              const r = await fetch('/api/eth-account');
              const j = await r.json();
              if(j.senderAddress){
                document.getElementById('ownerAddr').value = j.senderAddress;
                document.getElementById('msg').textContent = 'Wallet linked';
              } else {
                document.getElementById('msg').textContent = 'No wallet found';
              }
            }catch(e){
              document.getElementById('msg').textContent = 'Link failed';
            }
          }
          async function createTab(){
            const body = {
              name: document.getElementById('tabName').value.trim() || 'My tab',
              symbol: document.getElementById('symbol').value,
              owner: {
                id: document.getElementById('ownerId').value.trim() || 'owner',
                address: document.getElementById('ownerAddr').value.trim()
              },
              participants: [] // will be added by joins
            };
            if(!body.owner.address){ document.getElementById('msg').textContent = 'Enter or link owner address'; return; }
            const r = await fetch('/tab', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
            const j = await r.json();
            if(!r.ok){ document.getElementById('msg').textContent = j.error || 'Failed'; return; }
            location.href = '/tab/' + j.id;
          }
          document.getElementById('linkWallet').addEventListener('click', linkWallet);
          document.getElementById('create').addEventListener('click', createTab);
        </script>
      </body></html>
    `);
  });

  // ---------- Create tab API ----------
  app.post("/tab", async (c) => {
    const body = await c.req.json() as {
      name: string; symbol: Money["symbol"]; owner: Participant; participants?: Participant[];
    };
    if (!body?.name || !body?.symbol || !body?.owner?.address) {
      return c.json({ error: "name, symbol, owner{address} required" }, 400);
    }
    const tab: Tab = {
      id: rid(),
      name: body.name,
      symbol: body.symbol,
      owner: body.owner,
      participants: [body.owner, ...(body.participants || [])],
      items: [],
      status: "open",
    };
    TABS.set(tab.id, tab);
    return c.json({ id: tab.id, tab });
  });

  // ---------- Tab page: QR for participants ----------
  app.get("/tab/:id", (c) => {
    const t = TABS.get(c.req.param("id"));
    if (!t) return c.text("Tab not found", 404);
    const joinUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/tab/${t.id}/join`;
    return c.html(`
      <html><head>
        <meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>${t.name}</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
        <style>
          body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:32px auto}
          .card{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0}
          .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
          button{padding:10px 14px;border:0;border-radius:10px;background:#111827;color:#fff;cursor:pointer}
          .secondary{background:#6b7280}
        </style>
      </head>
      <body>
        <a href="/tabs" style="text-decoration:none"><button class="secondary">Back to Tabs</button></a>
        <h2>${t.name} <span style="color:#6b7280;font-size:14px">(${t.status})</span></h2>
        <div class="card">
          <h3>Share this QR to join</h3>
          <p class="mono">${joinUrl}</p>
          <canvas id="qr" width="220" height="220" style="border:1px solid #eee;border-radius:12px"></canvas>
          <script>QRCode.toCanvas(document.getElementById('qr'), "${joinUrl}", { width: 220 });</script>
        </div>

        <div class="card">
          <h3>Participants</h3>
          <div>${t.participants.map(p => `• ${p.id} — <span class="mono">${p.address}</span>`).join("<br/>")}</div>
        </div>

        <div class="card">
          <h3>Add Charge</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <input id="by" placeholder="who (id)"/>
            <input id="amount" placeholder="0.01"/>
            <input id="memo" placeholder="memo (optional)"/>
          </div>
          <div style="margin-top:8px">
            <button onclick="addCharge()">Add</button>
            <button class="secondary" style="margin-left:8px" onclick="settle()">Settle (equal split)</button>
          </div>
        </div>

        <div id="items" class="card">
          <h3>Items</h3>
          ${t.items.map(i => `• ${i.by} — ${i.amount.value} ${i.amount.symbol} ${i.memo ? '— '+i.memo : ''}`).join("<br/>")}
        </div>

        <div id="settlement"></div>

        <script>
          async function addCharge(){
            const r = await fetch('/tab/${t.id}/charge', {
              method:'POST', headers:{'content-type':'application/json'},
              body: JSON.stringify({ by: document.getElementById('by').value, amount: { value: document.getElementById('amount').value, symbol: '${t.symbol}' }, memo: document.getElementById('memo').value })
            });
            const j = await r.json();
            if(!r.ok) return alert(j.error||'Failed');
            location.reload();
          }
          async function settle(){
            const r = await fetch('/tab/${t.id}/settle', { method:'POST' });
            const j = await r.json();
            if(!r.ok) return alert(j.error||'Failed');
            document.getElementById('settlement').innerHTML = '<div class="card"><h3>Pay Links</h3>'+ j.links.map(l => '<div><a target="_blank" href="'+l+'">'+l+'</a></div>').join('') + '</div>';
          }
        </script>
      </body></html>
    `);
  });

  // ---------- Participant join page ----------
  app.get("/tab/:id/join", (c) => {
    const t = TABS.get(c.req.param("id"));
    if (!t) return c.text("Tab not found", 404);
    return c.html(`
      <html><head>
        <meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Join ${t.name}</title>
        <style>
          body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:32px auto}
          input{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:6px}
          button{padding:10px 14px;border:0;border-radius:10px;background:#111827;color:#fff;cursor:pointer;margin-top:10px}
        </style>
      </head>
      <body>
        <h2>Join tab: ${t.name}</h2>
        <label>Nickname</label>
        <input id="id" placeholder="your name"/>
        <label style="margin-top:10px">Wallet address</label>
        <input id="addr" placeholder="0x..."/>
        <button onclick="join()">Join Tab</button>
        <script>
          async function join(){
            const r = await fetch('/tab/${t.id}/join', {
              method:'POST', headers:{'content-type':'application/json'},
              body: JSON.stringify({ id: document.getElementById('id').value, address: document.getElementById('addr').value })
            });
            const j = await r.json();
            if(!r.ok) return alert(j.error || 'Failed');
            location.href = '/tab/${t.id}';
          }
        </script>
      </body></html>
    `);
  });

  // ---------- Join API ----------
  app.post("/tab/:id/join", async (c) => {
    const t = TABS.get(c.req.param("id"));
    if (!t) return c.json({ error: "not found" }, 404);
    const body = await c.req.json() as Participant;
    if (!body?.address) return c.json({ error: "address required" }, 400);
    // dedupe by address
    if (!t.participants.find(p => p.address.toLowerCase() === body.address.toLowerCase())) {
      t.participants.push({ id: body.id || `user-${t.participants.length+1}`, address: body.address });
    }
    return c.json({ ok: true, participants: t.participants });
  });

  // (charge/settle APIs you already have can remain)
  app.post("/tab/:id/charge", async (c) => {
    const t = TABS.get(c.req.param("id"));
    if (!t) return c.json({ error: "not found" }, 404);
    const { by, amount, memo } = await c.req.json() as { by: string; amount: Money; memo?: string };
    t.items.push({ id: rid(), by, amount: { value: String(amount.value), symbol: t.symbol }, memo, ts: Date.now() });
    return c.json({ ok: true });
  });

  app.post("/tab/:id/settle", async (c) => {
    const t = TABS.get(c.req.param("id"));
    if (!t) return c.json({ error: "not found" }, 404);
    const total = t.items.reduce((s, x) => s + Number(x.amount.value), 0);
    const payers = t.participants.filter(p => p.address.toLowerCase() !== t.owner.address.toLowerCase());
    if (!payers.length) return c.json({ error: "no payers" }, 400);
    const each = total / payers.length;

    const invoiceIds: string[] = [];
    const links: string[] = [];
    for (const p of payers) {
      const inv = await createInvoice({
        amount: { value: each.toFixed(6), symbol: t.symbol },
        payTo: { chain: "sepolia", address: t.owner.address },
        memo: 'Tab: ' + t.name + ' — ' + p.id,
      });
      invoiceIds.push(inv.id); links.push(inv.link);
    }
    t.status = "settled";
    t.settlement = { invoiceIds, links };
    return c.json({ ok: true, links, invoiceIds });
  });

  return app;
}
