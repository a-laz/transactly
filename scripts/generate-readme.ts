import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

function loadSpec(): any {
  const p = path.resolve(process.cwd(), 'docs/openapi.yaml');
  const raw = fs.readFileSync(p, 'utf8');
  return yaml.load(raw) as any;
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

function genReadme(spec: any): string {
  const title = spec.info?.title || 'API';
  const version = spec.info?.version || '';
  const server = (spec.servers && spec.servers[0]?.url) || '/api';

  return [
    `# ${title}`,
    '',
    version ? `Version: ${version}` : '',
    '',
    'API Reference is also available in your server:',
    '- Redoc: /api/docs',
    '- Swagger UI: /api/docs-swagger',
    '- OpenAPI: /api/openapi.yaml',
    '',
    h2('Quickstart'),
    '```bash',
    '# 1) Install',
    'npm install',
    '',
    '# 2) Configure environment (example)',
    'cat > .env.development.local << EOT',
    'PORT=3000',
    'PUBLIC_BASE_URL=http://localhost:3000',
    'API_KEYS=dev_key_123',
    'NEXT_PUBLIC_contractId=v1.signer-prod.testnet',
    'SEPOLIA_RPC_URL=https://sepolia.drpc.org',
    '# Optional, to avoid NEAR RPC rate limits:',
    '# NEAR_RPC_URL=https://rpc.testnet.near.org',
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


