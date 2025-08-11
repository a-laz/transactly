import { Hono } from "hono";
import { db } from "../db/client";
import { webhooksDlq, webhooksOutbox } from "../db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const app = new Hono();

// Minimal admin UI page (paste API key to use actions)
app.get("/webhooks-admin", async (c) => {
  return c.html(`
  <html><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Webhooks Admin</title>
    <style>
      body{font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;max-width:960px;margin:0 auto;padding:24px;background:#0b1020;color:#e6edf3}
      .card{background:#0f152a;border:1px solid #1f2937;border-radius:14px;padding:16px;margin:12px 0}
      input{width:100%;padding:10px;border:1px solid #1f2937;border-radius:10px;background:#0b1222;color:#e6edf3}
      button{padding:10px 14px;border:0;border-radius:10px;background:#4f46e5;color:#fff;cursor:pointer}
      .secondary{background:#2b3445}
      pre{white-space:pre-wrap}
      table{width:100%;border-collapse:collapse}
      th,td{border-bottom:1px solid #1f2937;padding:8px;text-align:left}
      small{color:#9aa4b2}
    </style>
  </head><body>
    <h2>Webhooks Admin</h2>
    <div class="card">
      <b>API key</b>
      <input id="key" placeholder="x-api-key value"/>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="loadOutbox()">Load Outbox</button>
        <button class="secondary" onclick="loadDlq()">Load DLQ</button>
      </div>
    </div>

    <div id="outbox" class="card"><b>Outbox</b><div id="outboxRows"><small>Click Load Outbox</small></div></div>
    <div id="dlq" class="card"><b>DLQ</b><div id="dlqRows"><small>Click Load DLQ</small></div></div>

    <script>
      async function loadOutbox(){
        const key = document.getElementById('key').value.trim();
        const r = await fetch('/api/webhooks/outbox?limit=20', { headers: { 'x-api-key': key } });
        const j = await r.json();
        const d = document.getElementById('outboxRows');
        d.innerHTML = '';
        (j.rows||[]).forEach(function(row){
          const div = document.createElement('div');
          div.style.margin='6px 0';
          div.innerHTML = '<div><b>'+row.id+'</b> — '+row.eventType+' — <small>'+row.status+' | attempts: '+row.attempts+'</small></div>'+
            '<div style="display:flex;gap:8px;margin-top:6px">'+
            '<button class="secondary" onclick="requeue(\''+row.id+'\')">Requeue</button>'+
            '</div>';
          d.appendChild(div);
        });
      }
      async function loadDlq(){
        const key = document.getElementById('key').value.trim();
        const r = await fetch('/api/webhooks/dlq?limit=20', { headers: { 'x-api-key': key } });
        const j = await r.json();
        const d = document.getElementById('dlqRows');
        d.innerHTML = '';
        (j.rows||[]).forEach(function(row){
          const div = document.createElement('div');
          div.style.margin='6px 0';
          div.innerHTML = '<div><b>'+row.id+'</b> — '+row.eventType+' — <small>err: '+(row.error||'')+' | attempts: '+row.attempts+'</small></div>'+
            '<div style="display:flex;gap:8px;margin-top:6px">'+
            '<button onclick="replay(\''+row.id+'\')">Replay</button>'+
            '</div>';
          d.appendChild(div);
        });
      }
      async function requeue(id){
        const key = document.getElementById('key').value.trim();
        await fetch('/api/webhooks/requeue/'+id, { method:'POST', headers: { 'x-api-key': key } });
        loadOutbox();
      }
      async function replay(id){
        const key = document.getElementById('key').value.trim();
        await fetch('/api/webhooks/replay/'+id, { method:'POST', headers: { 'x-api-key': key } });
        loadDlq();
      }
    </script>
  </body></html>
  `);
});

// API: list outbox
app.get("/outbox", async (c) => {
  const status = c.req.query("status");
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || "50")));
  const where = status ? eq(webhooksOutbox.status, status) : undefined;
  const rows = await db
    .select()
    .from(webhooksOutbox)
    .where(where as any)
    .orderBy(desc(webhooksOutbox.updatedAt))
    .limit(limit);
  return c.json({ rows });
});

// API: list DLQ
app.get("/dlq", async (c) => {
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || "50")));
  const rows = await db
    .select()
    .from(webhooksDlq)
    .orderBy(desc(webhooksDlq.createdAt))
    .limit(limit);
  return c.json({ rows });
});

// API: requeue an outbox id
app.post("/requeue/:id", async (c) => {
  const id = c.req.param("id");
  const now = Date.now();
  await db
    .update(webhooksOutbox)
    .set({ status: "pending", attempts: 0, nextAttemptAt: now, lastError: null as any, updatedAt: now })
    .where(eq(webhooksOutbox.id, id));
  return c.json({ ok: true });
});

// API: replay a DLQ id (re-arm its outbox row)
app.post("/replay/:dlqId", async (c) => {
  const dlqId = c.req.param("dlqId");
  const entry = (await db.select().from(webhooksDlq).where(eq(webhooksDlq.id, dlqId)).limit(1))[0];
  if (!entry) return c.json({ error: "not found" }, 404);
  const now = Date.now();
  await db
    .update(webhooksOutbox)
    .set({ status: "pending", attempts: 0, nextAttemptAt: now, lastError: null as any, updatedAt: now })
    .where(eq(webhooksOutbox.id, entry.outboxId));
  // keep DLQ record for audit; optionally could delete here
  return c.json({ ok: true, outboxId: entry.outboxId });
});

export default app;


