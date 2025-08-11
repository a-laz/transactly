# Transactly Payments API
Version: 0.1.0
API Reference is also available in your server:
- Redoc: /api/docs
- Swagger UI: /api/docs-swagger
- OpenAPI: /api/openapi.yaml
## Quickstart
```bash
# 1) Install
npm install
# 2) Configure environment (example)
cat > .env.development.local << EOT
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
API_KEYS=dev_key_123
NEXT_PUBLIC_contractId=v1.signer-prod.testnet
SEPOLIA_RPC_URL=https://sepolia.drpc.org
# Optional, to avoid NEAR RPC rate limits:
# NEAR_RPC_URL=https://rpc.testnet.near.org
EOT
# 3) Run the server
npm run dev
# 4) Verify
curl -s http://localhost:3000/
open http://localhost:3000/api/docs
```
## Base URL
`/api`
## Authentication
All /api/* endpoints require an API key.

Headers:

- x-api-key: <your key>

Example:

```bash
curl -H "x-api-key: $API_KEY" $BASE/api/eth-account
```
## Idempotency
For POST/PUT/PATCH/DELETE, send `Idempotency-Key` to safely retry the same request. Responses are cached per (apiKey, method, path, key).
## Rate Limits
Default 120 requests/minute per API key (configurable).
## Demos
### Enhanced Invoices (API-first)
- Create invoice, then execute and check status:
```bash
BASE=http://localhost:3000
KEY=dev_key_123
# Create
curl -s -X POST "$BASE/api/enhanced/invoice" -H "content-type: application/json" -H "x-api-key: $KEY" -H "Idempotency-Key: once-001" -d "{"amount":{"value":"0.01","asset":{"symbol":"ETH","chain":"ethereum"}},"payTo":{"asset":{"symbol":"ETH","chain":"ethereum"},"address":"0x0000000000000000000000000000000000000001"}}"
# Execute (replace INV_ID)
INV_ID=replace_me
curl -s -X POST "$BASE/api/enhanced/pay/$INV_ID/execute" -H "content-type: application/json" -H "x-api-key: $KEY" -H "Idempotency-Key: pay-001" -d "{"from":{"id":"payer-1","asset":{"symbol":"ETH","chain":"ethereum"}},"preferredRail":"evm-native"}"
# Status
curl -s -H "x-api-key: $KEY" "$BASE/api/enhanced/pay/$INV_ID/status"
```
### Tabs Demo (browser UI)
- Open: `http://localhost:3000/tabs`
- Create a tab (Sepolia ETH), add participants (MetaMask), add charges or fetch a tx, click Settle to generate pay links.
### Classic Pay Page (demo UI)
- Create: `POST /invoice` (non-API path) returns `payLink` at `/pay/:id`
- Open: `http://localhost:3000/pay/:id` and use the buttons to quote and execute
## Endpoints
- GET /eth-account — Get derived EVM sender and balance
- GET /agent-account — Get agent account metadata and balance
- POST /enhanced/invoice — Create enhanced invoice
- POST /crosschain/quote — Get cross-chain quote
- POST /crosschain/execute — Execute cross-chain route
- GET /crosschain/routes — List supported rails/routes