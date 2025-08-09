// transaction.ts — Cross‑Chain Invoice Inbox (MVP)
// Pivot from sports to invoices: generate a pay link, quote, and execute a payment.
// Focus path: EVM (Sepolia) native ETH payment end‑to‑end.
// Extend later: NEAR USDC/NEAR, ERC‑20 payments, real FX/bridge planner.

import { Hono } from "hono";
import { requestSignature } from "@neardefi/shade-agent-js";
import { JsonRpcProvider } from "ethers";
import { utils } from "chainsig.js";
const { toRSV, uint8ArrayToHex } = utils.cryptography;

// Re‑use your EVM helpers from the Shade template
import { Evm, ethRpcUrl } from "../utils/ethereum";

// ------------------------------
// In‑memory store (replace with Redis/DB later)
// ------------------------------
interface Invoice {
  id: string;
  amount: { value: string; symbol: "ETH" | "USDC" | "NEAR" };
  payTo: { chain: "sepolia" | "near"; address: string }; // address (EVM) or accountId (NEAR)
  memo?: string;
  createdAt: number;
  status: "open" | "paid" | "expired";
  // record tx(s) once paid
  payments?: Array<{ chain: string; hash: string; from: string; amount: string; symbol: string }>;
}

const INVOICES = new Map<string, Invoice>();

const app = new Hono();

async function getGasPriceWei(rpcUrl: string): Promise<bigint> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_gasPrice',
      params: []
    })
  });
  const j = await resp.json();
  // fallback = 30 gwei if provider errors
  const hex = j?.result ?? '0x6fc23ac00';
  return BigInt(hex);
}
// Utility: simple id
function iid() {
  return Math.random().toString(36).slice(2, 10);
}

// Utility: very naive FX (placeholder). Extend with a real price oracle.
const FX = {
  ETH_USD: 3000, // demo
  NEAR_USD: 5, // demo
};

// ------------------------------
// Create invoice
// ------------------------------
app.post("/invoice", async (c) => {
  try {
    const body = (await c.req.json()) as Partial<Invoice> & {
      amount: { value: string; symbol: "ETH" | "USDC" | "NEAR" };
      payTo: { chain: "sepolia" | "near"; address: string };
    };

    if (!body?.amount?.value || !body?.amount?.symbol || !body?.payTo?.chain || !body?.payTo?.address) {
      return c.json({ error: "amount{value,symbol}, payTo{chain,address} required" }, 400);
    }

    const id = iid();
    const inv: Invoice = {
      id,
      amount: body.amount,
      payTo: body.payTo,
      memo: body.memo,
      createdAt: Date.now(),
      status: "open",
    };

    INVOICES.set(id, inv);

    // Keep track of all invoices for history view
    if (!globalThis.INVOICE_HISTORY) globalThis.INVOICE_HISTORY = [];
    globalThis.INVOICE_HISTORY.push(inv);

    pushTo(id, 'invoice', inv);

    const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    return c.json({
      invoice: inv,
      payLink: `${base}/pay/${id}`,
    });
  } catch (err: any) {
    console.error("/invoice create error", err);
    return c.json({ error: err?.message || String(err) }, 400);
  }
});

// ------------------------------
// Get invoice (for pay page)
// ------------------------------
app.get("/invoice/:id", (c) => {
  const id = c.req.param("id");
  const inv = INVOICES.get(id);
  if (!inv) return c.json({ error: "not found" }, 404);
  return c.json(inv);
});

// ------------------------------
// Quote route (very simple): given a payer chain/asset, show what to send
// For MVP: if payer is Sepolia ETH and invoice is Sepolia ETH, 1:1 + gas estimate
// If cross‑asset, compute naive FX target amount and mark as \"simulated\".
// ------------------------------
app.post("/pay/:id/quote", async (c) => {
  try {
    const id = c.req.param("id");
    const inv = INVOICES.get(id);
    if (!inv) return c.json({ error: "not found" }, 404);

    const body = (await c.req.json()) as {
      from: { chain: "sepolia" | "near"; symbol: "ETH" | "USDC" | "NEAR" };
    };

    if (!body?.from?.chain || !body?.from?.symbol) return c.json({ error: "from{chain,symbol} required" }, 400);

    // Same‑chain ETH (Sepolia) native transfer → best for demo
    // Same-chain ETH (Sepolia) native transfer → best for demo
    if (
      body.from.chain === "sepolia" &&
      inv.payTo.chain === "sepolia" &&
      inv.amount.symbol === "ETH" &&
      body.from.symbol === "ETH"
    ) {
      // Use single-call gas fetch to avoid batching limits
      const rpcUrl =
        process.env.SEPOLIA_RPC_URL ??
        process.env.ETH_RPC_URL ??            // allow either env
        ethRpcUrl;                             // your default

      const gasPrice = await getGasPriceWei(rpcUrl);
      const gasLimit = 21000n;
      const feeWei = (gasPrice * gasLimit).toString();

      return c.json({
        route: [{ step: "send", chain: "sepolia", asset: "ETH" }],
        payExact: { value: inv.amount.value, symbol: "ETH" },
        estimatedNetworkFeeWei: feeWei,
        simulated: false,
      });
    }

    // Otherwise: simulated quote using naive FX to reach target symbol/chain
    const usdTarget =
      inv.amount.symbol === "ETH"
        ? Number(inv.amount.value) * FX.ETH_USD
        : inv.amount.symbol === "NEAR"
        ? Number(inv.amount.value) * FX.NEAR_USD
        : Number(inv.amount.value); // treat USDC as USD

    let payExact: { value: string; symbol: string } = { value: inv.amount.value, symbol: inv.amount.symbol };
    if (body.from.symbol === "ETH") payExact = { value: (usdTarget / FX.ETH_USD).toFixed(6), symbol: "ETH" };
    if (body.from.symbol === "NEAR") payExact = { value: (usdTarget / FX.NEAR_USD).toFixed(3), symbol: "NEAR" };
    if (body.from.symbol === "USDC") payExact = { value: usdTarget.toFixed(2), symbol: "USDC" };

    return c.json({
      route: [
        { step: "swap/bridge", from: body.from, to: inv.payTo, note: "simulated for demo" },
        { step: "send", chain: inv.payTo.chain, asset: inv.amount.symbol },
      ],
      payExact,
      estimatedNetworkFeeWei: null,
      simulated: true,
    });
  } catch (err: any) {
    console.error("/pay/:id/quote error", err);
    return c.json({ error: err?.message || String(err) }, 400);
  }
});

// ------------------------------
// Execute payment (MVP): same‑chain Sepolia ETH native transfer via Shade Agent signing
// Body: { fromPath?: string } (key path in agent, default ethereum-1)
// ------------------------------
app.post("/pay/:id/execute", async (c) => {
  try {
    const id = c.req.param("id");
    const inv = INVOICES.get(id);
    if (!inv) return c.json({ error: "not found" }, 404);
    if (inv.status !== "open") return c.json({ error: `invoice ${inv.status}` }, 400);

    if (!(inv.payTo.chain === "sepolia" && inv.amount.symbol === "ETH")) {
      return c.json({ error: "Only Sepolia ETH invoices are executable in this MVP" }, 400);
    }

    const fromPath = (await c.req.json().catch(() => ({ fromPath: "ethereum-1" })))?.fromPath || "ethereum-1";
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);

    const { address: from } = await Evm.deriveAddressAndPublicKey(contractId, fromPath);

    // Use ethers v6 parseEther for accurate wei conversion
    const { parseEther } = await import("ethers");
    const valueWei = parseEther(inv.amount.value).toString();

    const txBuild = await Evm.prepareTransactionForSigning({
      from,
      to: inv.payTo.address,
      value: valueWei,
    });

    const sig = await requestSignature({ path: fromPath, payload: uint8ArrayToHex(txBuild.hashesToSign[0]) });
    const signedTx = Evm.finalizeTransactionSigning({ transaction: txBuild.transaction, rsvSignatures: [toRSV(sig)] });
    const txHash = await Evm.broadcastTx(signedTx);
    const chainId = Number(process.env.EVM_CHAIN_ID ?? 11155111);

    

    inv.status = "paid";
    inv.payments = inv.payments || [];
    inv.payments.push({ chain: "sepolia", hash: txHash.hash, from, amount: inv.amount.value, symbol: "ETH", chainId, });

    pushTo(id, 'invoice', inv);
    
    const explorerBase = chainId === 84532 ? "https://sepolia.basescan.org" : "https://sepolia.etherscan.io";
    return c.json({ ok: true, txHash: txHash.hash, txUrl: `${explorerBase}/tx/${txHash.hash}`, invoice: inv });
  } catch (err: any) {
    console.error("/pay/:id/execute error", err);
    return c.json({ error: err?.message || String(err) }, 400);
  }
});

// ------------------------------
// Pay link landing (for your front‑end router). Returns a tiny HTML for quick manual tests.
// ------------------------------
app.get("/pay/:id", (c) => {
  const id = c.req.param("id");
  const inv = INVOICES.get(id);
  if (!inv) return c.text("Invoice not found", 404);
  const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

  const chainId = inv?.payments?.[0]?.chainId ?? 11155111;
  const explorerBase = chainId === 84532
    ? "https://sepolia.basescan.org"
    : "https://sepolia.etherscan.io";

  const txUrl = inv?.payments?.[0]?.hash
    ? `${explorerBase}/tx/${inv.payments[0].hash}`
    : null;

  return c.html(`
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
        <style>
          body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:40px auto;text-align:center}
          button{padding:10px 14px;border:0;border-radius:10px;background:#111827;color:#fff;cursor:pointer}
          .secondary{background:#6b7280}
          pre{ text-align:left; background:#f4f4f4; padding:10px; overflow:auto }
          .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:9999}
          .modal{width:min(640px,90vw);max-height:80vh;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;display:flex;flex-direction:column}
          .modal-header{padding:12px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
          .modal-title{font-weight:600}
          .modal-close{border:0;background:transparent;font-size:20px;cursor:pointer;line-height:1}
          .modal-body{padding:0;overflow:auto;background:#0b1020}
          .modal-body pre{margin:0;padding:16px;color:#e6edf3;background:#0b1020;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
        </style>
      </head>
      <body>
        <a href="/" style="text-decoration:none"><button class="secondary" style="margin-bottom:20px">Home</button></a>
        <h2>Invoice ${id}</h2>
        <p>Send <strong>${inv.amount.value} ${inv.amount.symbol}</strong> to 
          <code>${inv.payTo.address}</code> on <strong>${inv.payTo.chain}</strong>.
        </p>
        <p>Status: <b id="status">${inv.status}</b></p>

        <div style="margin:20px 0;">
          <button id="btnQuote">Quote (Sepolia ETH)</button>
          <button id="btnPay">Pay Now (demo)</button>
        </div>

        ${txUrl ? `
          <p><a href="${txUrl}" target="_blank">Open Pay Link</a></p>
          <canvas id="qr" width="200" height="200" style="border:1px solid #eee;border-radius:8px;margin:auto;display:block"></canvas>
          <script>
            QRCode.toCanvas(document.getElementById('qr'), "${txUrl}", { width: 200 }, function (error) {
              if (error) console.error(error);
            });
          </script>
        ` : `<p>No transaction yet</p>`}

        <pre>${JSON.stringify(inv, null, 2)}</pre>

        <div id="jsonModal" class="modal-backdrop" role="dialog" aria-modal="true">
          <div class="modal">
            <div class="modal-header">
              <div class="modal-title" id="modalTitle">Response</div>
              <button class="modal-close" aria-label="Close" onclick="hideModal()">×</button>
            </div>
            <div class="modal-body">
              <pre id="modalPre">{}</pre>
            </div>
          </div>
        </div>

        <script>
          const base = ${JSON.stringify(base)};
          const invoiceId = ${JSON.stringify(id)};

          function showModal(title, obj){
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalPre').textContent = JSON.stringify(obj, null, 2);
            document.getElementById('jsonModal').style.display = 'flex';
          }
          function hideModal(){ document.getElementById('jsonModal').style.display = 'none'; }

          function hideModal(){ 
            document.getElementById('jsonModal').style.display = 'none'; 
          }

          // close when clicking outside modal content
          document.getElementById('jsonModal').addEventListener('click', function(e) {
            if (e.target === this) hideModal();
          });

          document.getElementById('btnQuote').addEventListener('click', async () => {
            try {
              const res = await fetch(\`\${base}/pay/\${invoiceId}/quote\`, {
                method:'POST',
                headers:{'content-type':'application/json'},
                body: JSON.stringify({from:{chain:'sepolia', symbol:'ETH'}})
              });
              const j = await res.json();
              showModal(\`Quote • \${res.ok ? 'OK' : 'Error'}\`, j);
            } catch (e) {
              showModal('Quote • Error', { error: String(e) });
            }
          });

          document.getElementById('btnPay').addEventListener('click', async () => {
            try {
              const res = await fetch(\`\${base}/pay/\${invoiceId}/execute\`, {
                method:'POST',
                headers:{'content-type':'application/json'},
                body: JSON.stringify({fromPath:'ethereum-1'})
              });
              const j = await res.json();
              showModal(\`Pay Now • \${res.ok ? 'OK' : 'Error'}\`, j);
              if (j.invoice) setTimeout(()=>location.reload(), 600);
            } catch (e) {
              showModal('Pay Now • Error', { error: String(e) });
            }
          });
        </script>
      </body>
    </html>
  `);
});





// add near your routes
const STREAMS = new Map<string, Set<(chunk: string) => void>>();

function pushTo(id: string, event: string, data: any) {
  const sinks = STREAMS.get(id);
  if (!sinks) return;
  const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
  for (const write of sinks) write(payload);
}


app.get('/invoice/:id/stream', (c) => {
  const id = c.req.param('id');
  const inv = INVOICES.get(id);
  if (!inv) return c.json({ error: 'not found' }, 404);

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const write = (chunk: string) => controller.enqueue(enc.encode(chunk));
      if (!STREAMS.has(id)) STREAMS.set(id, new Set());
      STREAMS.get(id)!.add(write);

      // initial snapshot
      write(`event: snapshot\n` + `data: ${JSON.stringify(inv)}\n\n`);

      const ping = setInterval(() => write(`event: ping\ndata: {"t":${Date.now()}}\n\n`), 15000);

      // cleanup on close
      (c as any).res.addEventListener?.('close', () => {
        clearInterval(ping);
        STREAMS.get(id)?.delete(write);
      });
    },
  });

  return new Response(stream as any, { headers });
});

// ------------------------------
// Home page UI (create + list invoices)
// ------------------------------
app.get('/', (c) => {
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  return c.html(`
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cross-Chain Invoice Inbox</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px;}
      .card{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
      label{display:block;font-size:12px;color:#374151;margin-top:10px}
      input,select{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:6px}
      button{padding:10px 14px;border:0;border-radius:10px;background:#111827;color:#fff;cursor:pointer}
      button.secondary{background:#6b7280}
      .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
      .muted{color:#6b7280}
      .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#f3f4f6;font-size:12px}
    </style>
  </head>
  <body>
    <h1>Cross-Chain Invoice Inbox</h1>

    <div class="card">
      <h3>Create Invoice</h3>
      <div class="row">
        <div>
          <label>Amount</label>
          <input id="amount" placeholder="0.0001" value="0.0001" />
        </div>
        <div>
          <label>Symbol</label>
          <select id="symbol">
            <option>ETH</option>
            <option>USDC</option>
            <option>NEAR</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Pay To Chain</label>
          <select id="chain">
            <option value="sepolia" selected>sepolia</option>
            <option value="near">near</option>
          </select>
        </div>
        <div>
          <label>Pay To Address / Account</label>
          <input id="address" placeholder="0x... or alice.testnet" />
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <button id="create">Create</button>
        <span id="createMsg" class="muted"></span>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3>Invoices</h3>
        <button class="secondary" id="refresh">Refresh</button>
      </div>
      <div id="list"></div>
    </div>

    <script>
      const base = ${JSON.stringify(base)};
      const $ = (q)=>document.querySelector(q);

      async function createInvoice(){
        const res = await fetch(base + '/invoice', {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({
            amount:{ value: $('#amount').value.trim(), symbol: $('#symbol').value },
            payTo:{ chain: $('#chain').value, address: $('#address').value.trim() }
          })
        });
        const j = await res.json();
        if(!res.ok){ $('#createMsg').textContent = j.error || 'Failed'; return; }
        $('#createMsg').innerHTML = 'Created · <a class="mono" href="' + j.payLink + '">' + j.payLink + '</a>';
        await loadInvoices();
      }

      async function loadInvoices(){
        const res = await fetch(base + '/invoices');
        const j = await res.json();
        if(!Array.isArray(j)){ document.getElementById('list').textContent = 'No data'; return; }
        document.getElementById('list').innerHTML = j.map(inv => \`
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div><b>\${inv.id}</b> <span class="pill">\${inv.status}</span></div>
                <div class="muted">\${inv.amount.value} \${inv.amount.symbol} → \${inv.payTo.chain} · <span class="mono">\${inv.payTo.address}</span></div>
              </div>
              <div>
                <a href="\${base}/pay/\${inv.id}" target="_blank"><button>Open Pay Link</button></a>
              </div>
            </div>
          </div>\`
        ).join('');
      }

      document.getElementById('create').addEventListener('click', createInvoice);
      document.getElementById('refresh').addEventListener('click', loadInvoices);
      loadInvoices();
    </script>
  </body>
  </html>
  `);
});

// Simple API to list invoices for the homepage
app.get('/invoices', (c) => {
  return c.json([...INVOICES.values()].sort((a,b)=>b.createdAt-a.createdAt));
});



export default app;
