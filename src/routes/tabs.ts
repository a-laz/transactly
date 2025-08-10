// at top of tabs.ts (if not already)
import { Hono } from "hono";
import { JsonRpcProvider, formatEther } from "ethers";
import { requestSignature } from "@neardefi/shade-agent-js";
import { utils } from "chainsig.js";
import { Evm } from "../utils/ethereum";
const { toRSV, uint8ArrayToHex } = utils.cryptography;

type Money = { value: string; symbol: "ETH" | "USDC" | "NEAR" };
type Participant = { id: string; address: string };
type Charge = { id: string; by: string; amount: Money; memo?: string; ts: number };

export type Tab = {
  id: string;
  name: string;
  owner: Participant;
  symbol: Money["symbol"];
  settlementChain: "sepolia" | "near";
  participants: Participant[];     // includes owner
  items: Charge[];
  status: "open" | "settled";
  settlement?: { invoiceIds: string[]; links: string[] };
};

const TABS = new Map<string, Tab>();
const rid = () => Math.random().toString(36).slice(2, 10);
const TAB_SEEN_TX = new Map<string, Set<string>>();

function computeNetBalances(t: Tab): Record<string, number> {
  const net: Record<string, number> = {};
  for (const p of t.participants) net[p.address.toLowerCase()] = 0;
  const num = Math.max(1, t.participants.length);
  for (const it of t.items) {
    const amount = Number(it.amount.value);
    if (!isFinite(amount) || amount <= 0) continue;
    const perHead = amount / num;
    // everyone owes their share
    for (const p of t.participants) {
      net[p.address.toLowerCase()] -= perHead;
    }
    // payer paid the whole thing
    const payer = t.participants.find(p => p.id.toLowerCase() === (it.by || '').toLowerCase());
    if (payer) net[payer.address.toLowerCase()] += amount;
  }
  return net;
}

export type CreateInvoiceFn = (args: {
  amount: Money;
  payTo: { chain: "sepolia" | "near"; address: string };
  memo?: string;
}) => Promise<{ id: string; link: string }>;

export default function makeTabsRouter(createInvoice: CreateInvoiceFn) {
  const app = new Hono();

  // Start background watcher for Sepolia ETH purchases
  startSepoliaAutoWatcher();

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
            <select id="payToChain"><option>sepolia</option><option>near</option></select>
            <input id="ownerId" placeholder="your name (e.g. maria)" />
            <input id="ownerAddr" placeholder="owner address (receives settlement)" />
          </div>
          <div style="margin-top:8px; display:flex; gap:8px; align-items:center">
            <button id="connectMM" class="secondary">Connect MetaMask</button>
            <button id="linkWallet" class="secondary">Link Agent Wallet</button>
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
                document.getElementById('msg').textContent = 'Agent wallet linked';
              } else {
                document.getElementById('msg').textContent = 'No wallet found';
              }
            }catch(e){
              document.getElementById('msg').textContent = 'Link failed';
            }
          }
          async function connectMM(){
            try{
              if(!(window).ethereum){ document.getElementById('msg').textContent = 'MetaMask not found'; return; }
              const accounts = await (window).ethereum.request({ method: 'eth_requestAccounts' });
              const addr = (accounts && accounts[0]) || '';
              if(!addr){ document.getElementById('msg').textContent = 'No account returned'; return; }
              // try switch to Sepolia (0xaa36a7)
              try{ await (window).ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:'0xaa36a7' }] }); }catch(_e){ /* ignore */ }
              document.getElementById('ownerAddr').value = addr;
              document.getElementById('msg').textContent = 'MetaMask connected';
            }catch(e){ document.getElementById('msg').textContent = 'MetaMask connect failed'; }
          }
          async function createTab(){
            const body = {
              name: document.getElementById('tabName').value.trim() || 'My tab',
              symbol: document.getElementById('symbol').value,
              payToChain: document.getElementById('payToChain').value,
              owner: {
                id: document.getElementById('ownerId').value.trim() || 'owner',
                address: document.getElementById('ownerAddr').value.trim()
              },
              participants: [] // will be added by joins
            };
            if(!body.owner.address){ document.getElementById('msg').textContent = 'Enter or link owner address'; return; }
            if(!body.payToChain){ document.getElementById('msg').textContent = 'Select settlement chain'; return; }
            const r = await fetch('/tab', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
            const j = await r.json();
            if(!r.ok){ document.getElementById('msg').textContent = j.error || 'Failed'; return; }
            location.href = '/tab/' + j.id;
          }
          document.getElementById('connectMM').addEventListener('click', connectMM);
          document.getElementById('linkWallet').addEventListener('click', linkWallet);
          document.getElementById('create').addEventListener('click', createTab);
        </script>
      </body></html>
    `);
  });

  // ---------- Create tab API ----------
  app.post("/tab", async (c) => {
    const body = await c.req.json() as {
      name: string; symbol: Money["symbol"]; owner: Participant; payToChain: "sepolia" | "near"; participants?: Participant[];
    };
    if (!body?.name || !body?.symbol || !body?.owner?.address || !body?.payToChain) {
      return c.json({ error: "name, symbol, owner{address}, payToChain required" }, 400);
    }
    const tab: Tab = {
      id: rid(),
      name: body.name,
      symbol: body.symbol,
      settlementChain: body.payToChain,
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
          <div style="margin-top:8px" class="muted">Settlement chain: ${t.settlementChain}</div>
        </div>

        <div class="card">
          <h3>Connect a Wallet to Track Purchases</h3>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
            <button id="joinMM">Join with MetaMask</button>
            <input id="joinNick" placeholder="nickname" style="max-width:220px"/>
            <span class="muted" id="joinMsg"></span>
          </div>
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

        <div class="card">
          <h3>Add Purchase from Tx (Sepolia ETH)</h3>
          <div style="display:grid;grid-template-columns:1fr;gap:8px">
            <input id="txhash" placeholder="0x... transaction hash"/>
          </div>
          <div style="margin-top:8px">
            <button onclick="addFromTx()">Fetch & Add</button>
            <span id="txmsg" class="muted"></span>
          </div>
        </div>

        <div class="card">
          <h3>Demo Purchase (Agent)</h3>
          <div class="row">
            <input id="demoBy" placeholder="who (id)" />
            <input id="demoAmount" placeholder="0.01" value="0.01" />
          </div>
          <div class="row">
            <input id="demoTo" placeholder="merchant address (defaults to owner)" value="${t.owner.address}" />
            <input id="demoPath" placeholder="agent key path" value="ethereum-1" />
          </div>
          <div style="margin-top:8px">
            <button onclick="demoBuy()">Send & Log</button>
            <span id="demomsg" class="muted"></span>
          </div>
        </div>

        <div id="items" class="card">
          <h3>Items</h3>
          ${t.items.map(i => `• ${i.by} — ${i.amount.value} ${i.amount.symbol} ${i.memo ? '— '+i.memo : ''}`).join("<br/>")}
        </div>

        <div id="balances" class="card">
          <h3>Balances</h3>
          ${(() => {
            const net = computeNetBalances(t);
            const rows = Object.entries(net).map(([addr, v]) => {
              const p = t.participants.find(x => x.address.toLowerCase() === addr);
              const name = p ? p.id : addr.slice(0,6)+'…'+addr.slice(-4);
              const amt = (v).toFixed(6);
              const sign = v >= 0 ? '+' : '';
              return `• ${name} — ${sign}${amt} ${t.symbol}`;
            }).join('<br/>');
            return rows || '<div class="muted">No purchases yet</div>';
          })()}
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
          async function joinWith(addr){
            const nick = (document.getElementById('joinNick').value || '').trim() || addr.slice(0,6)+'…'+addr.slice(-4);
            const r = await fetch('/tab/${t.id}/join', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: nick, address: addr }) });
            const j = await r.json();
            if(!r.ok){ document.getElementById('joinMsg').textContent = j.error || 'Failed'; return; }
            location.reload();
          }
          async function joinMetaMask(){
            try{
              if(!(window).ethereum){ document.getElementById('joinMsg').textContent = 'MetaMask not found'; return; }
              const accounts = await (window).ethereum.request({ method: 'eth_requestAccounts' });
              const addr = (accounts && accounts[0]) || '';
              if(!addr){ document.getElementById('joinMsg').textContent = 'No account returned'; return; }
              try{ await (window).ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:'0xaa36a7' }] }); }catch(_e){ /* ignore */ }
              await joinWith(addr);
            }catch(e){ document.getElementById('joinMsg').textContent = 'MetaMask connect failed'; }
          }
          document.getElementById('joinMM').addEventListener('click', joinMetaMask);
          async function addFromTx(){
            const h = document.getElementById('txhash').value.trim();
            if(!h){ document.getElementById('txmsg').textContent='Enter tx hash'; return; }
            document.getElementById('txmsg').textContent='Fetching…';
            const r = await fetch('/tab/${t.id}/purchase/evm', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ txHash: h }) });
            const j = await r.json();
            if(!r.ok){ document.getElementById('txmsg').textContent = j.error || 'Failed'; return; }
            location.reload();
          }
          async function settle(){
            const r = await fetch('/tab/${t.id}/settle', { method:'POST' });
            const j = await r.json();
            if(!r.ok) return alert(j.error||'Failed');
            document.getElementById('settlement').innerHTML = '<div class="card"><h3>Pay Links</h3>'+ j.links.map(l => '<div><a target="_blank" href="'+l+'">'+l+'</a></div>').join('') + '</div>';
          }
          async function demoBuy(){
            const by = document.getElementById('demoBy').value.trim();
            const amount = document.getElementById('demoAmount').value.trim();
            const to = document.getElementById('demoTo').value.trim() || '${t.owner.address}';
            const path = document.getElementById('demoPath').value.trim() || 'ethereum-1';
            document.getElementById('demomsg').textContent = 'Sending…';
            const r = await fetch('/tab/${t.id}/purchase/evm/execute', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ by, to, amount, fromPath: path }) });
            const j = await r.json();
            if(!r.ok){ document.getElementById('demomsg').textContent = j.error || 'Failed'; return; }
            location.reload();
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
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          <button onclick="join()">Join Tab</button>
          <button class="secondary" onclick="joinMM()">Join with MetaMask</button>
          <span id="msg" class="muted"></span>
        </div>
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
          async function joinMM(){
            try{
              if(!(window).ethereum){ document.getElementById('msg').textContent='MetaMask not found'; return; }
              const accounts = await (window).ethereum.request({ method:'eth_requestAccounts' });
              const addr = (accounts && accounts[0]) || '';
              if(!addr){ document.getElementById('msg').textContent='No account returned'; return; }
              try{ await (window).ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:'0xaa36a7' }] }); }catch(_e){ /* ignore */ }
              document.getElementById('addr').value = addr;
              await join();
            }catch(e){ document.getElementById('msg').textContent='MetaMask connect failed'; }
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

  // Add purchase by fetching an EVM tx (Sepolia ETH only for now)
  app.post("/tab/:id/purchase/evm", async (c) => {
    try {
      const t = TABS.get(c.req.param("id"));
      if (!t) return c.json({ error: "not found" }, 404);
      if (!(t.settlementChain === "sepolia" && t.symbol === "ETH")) {
        return c.json({ error: "This demo supports Sepolia ETH tabs only" }, 400);
      }
      const { txHash } = await c.req.json() as { txHash: string };
      if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return c.json({ error: "txHash required" }, 400);

      const rpc = process.env.SEPOLIA_RPC_URL || process.env.ETH_RPC_URL || "https://sepolia.drpc.org";
      const provider = new JsonRpcProvider(rpc);
      const tx = await provider.getTransaction(txHash);
      if (!tx) return c.json({ error: "transaction not found" }, 404);

      // Optional: ensure it was mined
      const rcpt = await provider.getTransactionReceipt(txHash);
      if (!rcpt || rcpt.status !== 1) return c.json({ error: "transaction not successful yet" }, 400);

      const from = (tx.from || '').toLowerCase();
      const payer = t.participants.find(p => p.address.toLowerCase() === from);
      const by = payer ? payer.id : from.slice(0, 6) + "…" + from.slice(-4);
      const valueEth = formatEther(tx.value ?? 0n);

      t.items.push({ id: rid(), by, amount: { value: String(valueEth), symbol: t.symbol }, memo: `tx ${txHash.slice(0,10)}…`, ts: Date.now() });
      return c.json({ ok: true, added: { by, valueEth, hash: txHash }, payerMatched: Boolean(payer) });
    } catch (e: any) {
      return c.json({ error: e?.message || String(e) }, 400);
    }
  });

  // Execute a Sepolia ETH transaction via agent, then log as a charge
  app.post("/tab/:id/purchase/evm/execute", async (c) => {
    try {
      const t = TABS.get(c.req.param("id"));
      if (!t) return c.json({ error: "not found" }, 404);
      if (!(t.settlementChain === "sepolia" && t.symbol === "ETH")) {
        return c.json({ error: "This demo supports Sepolia ETH tabs only" }, 400);
      }
      const { by, to, amount, fromPath } = await c.req.json() as { by: string; to: string; amount: string; fromPath?: string };
      if (!by || !to || !amount) return c.json({ error: "by, to, amount required" }, 400);

      const contractId = process.env.NEXT_PUBLIC_contractId;
      if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);
      const path = fromPath || "ethereum-1";

      const { parseEther } = await import("ethers");
      const wei = parseEther(String(amount)).toString();

      const { address: from } = await Evm.deriveAddressAndPublicKey(contractId, path);
      const txBuild = await Evm.prepareTransactionForSigning({ from, to, value: wei });
      const sig = await requestSignature({ path, payload: uint8ArrayToHex(txBuild.hashesToSign[0]) });
      const signedTx = Evm.finalizeTransactionSigning({ transaction: txBuild.transaction, rsvSignatures: [toRSV(sig)] });
      const txHash = await Evm.broadcastTx(signedTx);

      t.items.push({ id: rid(), by, amount: { value: String(amount), symbol: t.symbol }, memo: `agent tx ${txHash.hash.slice(0,10)}…`, ts: Date.now() });
      return c.json({ ok: true, txHash: txHash.hash });
    } catch (e: any) {
      return c.json({ error: e?.message || String(e) }, 400);
    }
  });

  app.post("/tab/:id/settle", async (c) => {
    const t = TABS.get(c.req.param("id"));
    if (!t) return c.json({ error: "not found" }, 404);

    // Compute net balances: positive = owed money (creditor), negative = owes money (debtor)
    const net = computeNetBalances(t);
    const creditors = Object.entries(net)
      .filter(([_, v]) => v > 0.0000005) // > ~0
      .map(([addr, v]) => ({ addr, amount: v }))
      .sort((a,b)=>b.amount-a.amount);
    const debtors = Object.entries(net)
      .filter(([_, v]) => v < -0.0000005)
      .map(([addr, v]) => ({ addr, amount: -v })) // store positive owed amount
      .sort((a,b)=>b.amount-a.amount);

    if (!creditors.length || !debtors.length) {
      return c.json({ error: "nothing to settle" }, 400);
    }

    const invoiceIds: string[] = [];
    const links: string[] = [];

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const cr = creditors[j];
      const amount = Math.min(d.amount, cr.amount);
      if (amount <= 0) { if (d.amount <= 0) i++; if (cr.amount <= 0) j++; continue; }

      const debtor = t.participants.find(p => p.address.toLowerCase() === d.addr)!;
      const creditor = t.participants.find(p => p.address.toLowerCase() === cr.addr)!;

      const inv = await createInvoice({
        amount: { value: amount.toFixed(6), symbol: t.symbol },
        payTo: { chain: t.settlementChain, address: creditor.address },
        memo: `Tab: ${t.name} — ${debtor.id} → ${creditor.id}`,
      });
      invoiceIds.push(inv.id); links.push(inv.link);

      d.amount -= amount;
      cr.amount -= amount;
      if (d.amount <= 0.0000005) i++;
      if (cr.amount <= 0.0000005) j++;
    }

    t.status = "settled";
    t.settlement = { invoiceIds, links };
    return c.json({ ok: true, links, invoiceIds });
  });

  return app;
}

// ------------------------------
// Background auto-watcher: Sepolia ETH
// ------------------------------
let WATCH_STARTED = false;
let LAST_BLOCK = 0n;
async function scanSepoliaOnce() {
  try {
    const rpc = process.env.SEPOLIA_RPC_URL || process.env.ETH_RPC_URL || "https://sepolia.drpc.org";
    const provider = new JsonRpcProvider(rpc);
    const currentBn = await provider.getBlockNumber();
    if (LAST_BLOCK === 0n) {
      LAST_BLOCK = BigInt(currentBn) - 1n;
      if (LAST_BLOCK < 0n) LAST_BLOCK = 0n;
    }

    // Collect open tabs configured for Sepolia ETH
    const tabs = [...TABS.values()].filter(t => t.status === 'open' && t.settlementChain === 'sepolia' && t.symbol === 'ETH');
    if (tabs.length === 0) { LAST_BLOCK = BigInt(currentBn); return; }

    const addressToTabs = new Map<string, Tab[]>();
    for (const t of tabs) {
      for (const p of t.participants) {
        const a = p.address.toLowerCase();
        if (!addressToTabs.has(a)) addressToTabs.set(a, []);
        addressToTabs.get(a)!.push(t);
      }
    }

    // Scan forward up to a small window to avoid long catch-up
    const target = BigInt(currentBn);
    const maxSteps = 6n;
    let from = LAST_BLOCK + 1n;
    let to = target;
    if (to - from > maxSteps) to = from + maxSteps;

    for (let bn = from; bn <= to; bn++) {
      const block = await provider.getBlock(Number(bn), true);
      const txs = (block?.transactions || []) as any[];
      for (const tx of txs) {
        const fromAddr = (tx.from || '').toLowerCase();
        const value = tx.value as bigint | undefined;
        if (!value || value === 0n) continue;
        const tabsHit = addressToTabs.get(fromAddr);
        if (!tabsHit || tabsHit.length === 0) continue;
        const valueEth = Number(formatEther(value));
        if (!isFinite(valueEth) || valueEth <= 0) continue;
        for (const t of tabsHit) {
          const seen = TAB_SEEN_TX.get(t.id) || new Set<string>();
          if (seen.has(tx.hash)) continue;
          seen.add(tx.hash); TAB_SEEN_TX.set(t.id, seen);
          const payer = t.participants.find(p => p.address.toLowerCase() === fromAddr);
          const by = payer ? payer.id : fromAddr.slice(0,6)+'…'+fromAddr.slice(-4);
          t.items.push({ id: rid(), by, amount: { value: valueEth.toFixed(6), symbol: t.symbol }, memo: `auto tx ${String(tx.hash).slice(0,10)}…`, ts: Date.now() });
        }
      }
    }
    LAST_BLOCK = to;
  } catch {}
}

function startSepoliaAutoWatcher() {
  if (WATCH_STARTED) return;
  WATCH_STARTED = true;
  const intervalMs = Number(process.env.AUTO_WATCH_INTERVAL_MS || '5000');
  setInterval(() => { scanSepoliaOnce(); }, intervalMs);
}
