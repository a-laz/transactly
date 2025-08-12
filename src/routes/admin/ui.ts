import { Hono } from 'hono';

const app = new Hono();

app.get('/admin', (c) => {
  return c.html(`
  <html><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Admin</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:960px;margin:0 auto;padding:24px;background:#0b1020;color:#e6edf3}
      .card{background:#0f152a;border:1px solid #1f2937;border-radius:14px;padding:16px;margin:12px 0}
      input{width:100%;padding:10px;border:1px solid #1f2937;border-radius:10px;background:#0b1222;color:#e6edf3}
      button{padding:10px 14px;border:0;border-radius:10px;background:#4f46e5;color:#fff;cursor:pointer}
      .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      small{color:#9aa4b2}
    </style>
  </head><body>
    <h2>Admin Dashboard</h2>
    <div class="card">
      <b>Admin Key</b>
      <input id="adminKey" placeholder="x-admin-key"/>
    </div>

    <div class="card">
      <h3>Orgs</h3>
      <div class="row">
        <input id="orgName" placeholder="Org name"/>
        <button onclick="createOrg()">Create Org</button>
      </div>
      <div id="orgMsg"><small></small></div>
    </div>

    <div class="card">
      <h3>Projects</h3>
      <div class="row">
        <input id="orgId" placeholder="Org ID"/>
        <input id="projectName" placeholder="Project name"/>
      </div>
      <div style="margin-top:8px">
        <button onclick="createProject()">Create Project</button>
      </div>
      <div id="projectMsg"><small></small></div>
    </div>

    <div class="card">
      <h3>API Keys</h3>
      <div class="row">
        <input id="projectId" placeholder="Project ID"/>
        <input id="alias" placeholder="Alias (optional)"/>
      </div>
      <div style="margin-top:8px">
        <button onclick="createKey()">Create Key</button>
        <button onclick="listKeys()" style="margin-left:8px">List Keys</button>
      </div>
      <div id="keysMsg"><small></small></div>
      <div id="keysList"></div>
    </div>

    <script>
      async function createOrg(){
        const key = document.getElementById('adminKey').value.trim();
        const name = document.getElementById('orgName').value.trim();
        const r = await fetch('/api/admin/orgs', { method:'POST', headers:{'x-admin-key':key,'content-type':'application/json'}, body: JSON.stringify({ name }) });
        document.getElementById('orgMsg').textContent = await r.text();
      }
      async function createProject(){
        const key = document.getElementById('adminKey').value.trim();
        const orgId = document.getElementById('orgId').value.trim();
        const name = document.getElementById('projectName').value.trim();
        const r = await fetch('/api/admin/projects', { method:'POST', headers:{'x-admin-key':key,'content-type':'application/json'}, body: JSON.stringify({ orgId, name }) });
        document.getElementById('projectMsg').textContent = await r.text();
      }
      async function createKey(){
        const key = document.getElementById('adminKey').value.trim();
        const projectId = document.getElementById('projectId').value.trim();
        const alias = document.getElementById('alias').value.trim();
        const r = await fetch('/api/admin/keys', { method:'POST', headers:{'x-admin-key':key,'content-type':'application/json'}, body: JSON.stringify({ projectId, alias }) });
        document.getElementById('keysMsg').textContent = await r.text();
      }
      async function listKeys(){
        const key = document.getElementById('adminKey').value.trim();
        const projectId = document.getElementById('projectId').value.trim();
        const r = await fetch('/api/admin/keys?projectId='+encodeURIComponent(projectId), { headers:{'x-admin-key':key} });
        const j = await r.json();
        const list = document.getElementById('keysList');
        list.innerHTML = '';
        (j.rows||[]).forEach(function(row){
          const div = document.createElement('div');
          div.style.margin='6px 0';
          div.innerHTML = '<div><b>'+row.id+'</b> — <small>'+row.status+'</small><br/><small>prefix: '+row.prefix+' · alias: '+(row.alias||'')+'</small></div>'+
            '<div style="margin-top:6px"><button onclick="revokeKey(\''+row.id+'\')">Revoke</button></div>';
          list.appendChild(div);
        });
      }
      async function revokeKey(id){
        const key = document.getElementById('adminKey').value.trim();
        await fetch('/api/admin/keys/'+id+'/revoke', { method:'POST', headers:{'x-admin-key':key} });
        listKeys();
      }
    </script>
  </body></html>
  `);
});

export default app;


