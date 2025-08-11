import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

type PackageJson = { name?: string; version?: string; description?: string; scripts?: Record<string, string> };

function loadSpec(): any {
  const p = path.resolve(process.cwd(), 'docs/openapi.yaml');
  const raw = fs.readFileSync(p, 'utf8');
  return yaml.load(raw) as any;
}

function loadPkg(): PackageJson {
  const p = path.resolve(process.cwd(), 'package.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function h2(t: string) { return `## ${t}`; }
function h3(t: string) { return `### ${t}`; }

function genEndpointList(spec: any): string {
  const items: string[] = [];
  const paths = spec.paths || {};
  const methods = ['get','post','put','patch','delete'];
  for (const p of Object.keys(paths)) {
    for (const m of methods) {
      if (paths[p][m]) {
        const sum = paths[p][m].summary || '';
        items.push(`- ${m.toUpperCase()} ${p}${sum ? ` — ${sum}` : ''}`);
      }
    }
  }
  return items.join('\n');
}

function genSecurity(spec: any): string {
  const sec = spec.components?.securitySchemes || {};
  if (sec.ApiKeyAuth) {
    return `All /api/* endpoints require an API key.\n\nHeaders:\n\n- x-api-key: <your key>\n\nExample:\n\n\`\`\`bash\ncurl -H "x-api-key: $API_KEY" $BASE/api/eth-account\n\`\`\``;
  }
  return 'None';
}

function listScripts(pkg: PackageJson): string {
  const scripts = pkg.scripts || {};
  const keys = Object.keys(scripts);
  if (keys.length === 0) return 'None';
  return keys.map((k) => `- ${k}: ${scripts[k]}`).join('\n');
}

function discoverEnvVars(): string[] {
  const roots = [path.resolve(process.cwd(), 'src')];
  const envs = new Set<string>();
  const ignoreDirs = new Set(['node_modules', 'dist', 'build', '.git']);
  function walk(dir: string) {
    let entries: string[] = [];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat: fs.Stats | undefined;
      try { stat = fs.statSync(full); } catch { continue; }
      if (!stat) continue;
      if (stat.isDirectory()) {
        if (!ignoreDirs.has(entry)) walk(full);
      } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry)) {
        let content = '';
        try { content = fs.readFileSync(full, 'utf8'); } catch { /* ignore */ }
        const regex = /process\.env\.(\w+)/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(content))) envs.add(m[1]);
      }
    }
  }
  roots.forEach(walk);
  return Array.from(envs).sort();
}

function hasDrizzle(): boolean {
  return fs.existsSync(path.resolve(process.cwd(), 'drizzle.config.ts'));
}

function genReadme(spec: any): string {
  const pkg = loadPkg();
  const title = pkg.name || spec.info?.title || 'API';
  const version = pkg.version || spec.info?.version || '';
  const description = pkg.description || '';
  const server = (spec.servers && spec.servers[0]?.url) || '/api';
  const envVars = discoverEnvVars();
  const drizzle = hasDrizzle();

  return [
    `# ${title}`,
    '',
    version ? `Version: ${version}` : '',
    description ? `${description}` : '',
    '',
    'API Reference is also available in your server:',
    '- Redoc: /api/docs',
    '- Swagger UI: /api/docs-swagger',
    '- OpenAPI: /api/openapi.yaml',
    '',
    h2('Project Scripts'),
    listScripts(pkg),
    '',
    h2('Quickstart'),
    '```bash',
    '# 1) Install',
    'npm install',
    '',
    '# 2) Configure environment (example)',
    'cat > .env.development.local << EOT',
    ...(
      envVars.length
        ? envVars.map((k) => `${k}=`)
        : [
            'PORT=3000',
            'PUBLIC_BASE_URL=http://localhost:3000',
            'API_KEYS=dev_key_123',
          ]
    ),
    'EOT',
    '',
    '# 3) Run the server',
    'npm run dev',
    '',
    '# 4) Verify',
    'curl -s http://localhost:3000/',
    'open http://localhost:3000/api/docs',
    '```',
    '',
    drizzle ? h2('Persistence (SQLite + Drizzle)') : '',
    drizzle ? [
      'This project uses SQLite with Drizzle ORM.',
      '',
      '```bash',
      'npm run drizzle:generate   # generate SQL from schema',
      'npm run drizzle:push       # apply migrations',
      'npm run drizzle:studio     # browse DB',
      '```',
      '',
      '- Toggle DB mode: set `USE_DB=true`',
    ].join('\n') : '',
    '',
    h2('Base URL'),
    '`' + server + '`',
    '',
    h2('Authentication'),
    genSecurity(spec),
    '',
    h2('Idempotency'),
    'For POST/PUT/PATCH/DELETE, send `Idempotency-Key` to safely retry the same request. Responses are cached per (apiKey, method, path, key).',
    '',
    h2('Rate Limits'),
    'Default 120 requests/minute per API key (configurable).',
    '',
    h2('Demos'),
    h3('Enhanced Invoices (API-first)'),
    '- Create invoice, then execute and check status:',
    '```bash',
    'BASE=http://localhost:3000',
    'KEY=dev_key_123',
    '',
    '# Create',
    'curl -s -X POST "$BASE/api/enhanced/invoice" -H "content-type: application/json" -H "x-api-key: $KEY" -H "Idempotency-Key: once-001" -d "{\"amount\":{\"value\":\"0.01\",\"asset\":{\"symbol\":\"ETH\",\"chain\":\"ethereum\"}},\"payTo\":{\"asset\":{\"symbol\":\"ETH\",\"chain\":\"ethereum\"},\"address\":\"0x0000000000000000000000000000000000000001\"}}"',
    '',
    '# Execute (replace INV_ID)',
    'INV_ID=replace_me',
    'curl -s -X POST "$BASE/api/enhanced/pay/$INV_ID/execute" -H "content-type: application/json" -H "x-api-key: $KEY" -H "Idempotency-Key: pay-001" -d "{\"from\":{\"id\":\"payer-1\",\"asset\":{\"symbol\":\"ETH\",\"chain\":\"ethereum\"}},\"preferredRail\":\"evm-native\"}"',
    '',
    '# Status',
    'curl -s -H "x-api-key: $KEY" "$BASE/api/enhanced/pay/$INV_ID/status"',
    '```',
    '',
    h3('Tabs Demo (browser UI)'),
    '- Open: `http://localhost:3000/tabs`',
    '- Create a tab (Sepolia ETH), add participants (MetaMask), add charges or fetch a tx, click Settle to generate pay links.',
    '',
    h3('Classic Pay Page (demo UI)'),
    '- Create: `POST /invoice` (non-API path) returns `payLink` at `/pay/:id`',
    '- Open: `http://localhost:3000/pay/:id` and use the buttons to quote and execute',
    '',
    h2('Endpoints'),
    genEndpointList(spec),
    '',
  ].filter(Boolean).join('\n');
}

function main() {
  const spec = loadSpec();
  const out = genReadme(spec);
  fs.writeFileSync(path.resolve(process.cwd(), 'README.md'), out, 'utf8');
  // eslint-disable-next-line no-console
  console.log('README.md generated from docs/openapi.yaml');
}

main();


