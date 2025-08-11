import { Hono } from "hono";
import { readFileSync } from "fs";
import { resolve } from "path";

const app = new Hono();

// Serve OpenAPI YAML
app.get("/openapi.yaml", (c) => {
  try {
    const p = resolve(process.cwd(), "docs/openapi.yaml");
    const data = readFileSync(p, "utf8");
    c.header("content-type", "text/yaml; charset=utf-8");
    return c.body(data);
  } catch (e: any) {
    return c.json({ error: e?.message || String(e) }, 500);
  }
});

// Simple ReDoc UI
app.get("/docs", (c) => {
  const specUrl = "/api/openapi.yaml";
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Transactly API Docs</title>
      <style>html,body,#redoc{height:100%;margin:0;padding:0}</style>
      <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
    </head>
    <body>
      <div id="redoc">Loading docs… If this persists, open <a href="${specUrl}">the OpenAPI spec</a>.</div>
      <script>
        (function(){
          function init(){
            if (!window || !(window).Redoc) { setTimeout(init, 200); return; }
            try { (window).Redoc.init("${specUrl}", {}, document.getElementById('redoc')); } catch(e) { console.error(e); }
          }
          init();
        })();
      </script>
    </body>
  </html>`;
  return c.html(html);
});

// Swagger UI fallback (some environments block Redoc)
app.get("/docs-swagger", (c) => {
  const specUrl = "/api/openapi.yaml";
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Transactly API Docs (Swagger UI)</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
      <style>html,body,#swagger{height:100%;margin:0;padding:0}</style>
    </head>
    <body>
      <div id="swagger">Loading…</div>
      <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
      <script>
        (function(){
          function init(){
            if(!(window).SwaggerUIBundle){ setTimeout(init, 200); return; }
            (window).ui = (window).SwaggerUIBundle({
              url: "${specUrl}",
              dom_id: '#swagger',
              presets: [ (window).SwaggerUIBundle.presets.apis ],
              layout: 'BaseLayout'
            });
          }
          init();
        })();
      </script>
    </body>
  </html>`;
  return c.html(html);
});

export default app;


