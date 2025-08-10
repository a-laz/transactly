```markdown
## Tabs + Cross-Chain Invoice Inbox

This app lets you run a real-time group tab with automatic wallet purchase tracking and net settlement via invoices. Built on Shade Agents.

### What’s included
- Tabs with QR join page
- MetaMask connect (create and join flows)
- Automatic Sepolia ETH purchase tracking (no pasting tx hashes)
- Equal-split ledger and live net balances
- Net settlement with pay links on chosen chain (Sepolia or NEAR)
- Classic invoice demo (create, quote, pay via agent)

### Tech
- Backend: Node.js (Hono), Shade Agent SDK, Ethers v6
- Chains: Sepolia ETH (auto-tracking), NEAR (settlement target supported)
- Frontend: Minimal server-rendered HTML

---

## Setup

Install dependencies:
```bash
npm install
```

Create `.env.development.local` in the project root:
```env
# Public URL for links/QRs (set to your ngrok URL)
PUBLIC_BASE_URL=https://<your-ngrok-subdomain>.ngrok-free.app

# Shade Agent contract id (required for agent-signed tx / demo purchase)
NEXT_PUBLIC_contractId=<your_contract_id>

# Optional: your RPC
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your_key>
# or ETH_RPC_URL=https://sepolia.drpc.org

# Optional: auto-watcher polling (ms)
AUTO_WATCH_INTERVAL_MS=5000
```

---

## Run (3 terminals)

1) Shade client CLI (agent signer)
```bash
# Example (adapt per your setup)
# Ensure this process can receive signature requests
shade-client-cli start --contract-id "$NEXT_PUBLIC_contractId"
```

2) App server
```bash
npm run dev
```

3) Public tunnel (ngrok)
```bash
ngrok http 3000
# Copy the https URL and set PUBLIC_BASE_URL to it (in .env and restart dev), e.g.
# PUBLIC_BASE_URL=https://abcd1234.ngrok-free.app
```

---

## Demo Flow (Hackathon)
1. Start a tab at `/tabs`.
   - Click “Connect MetaMask” to set the owner’s address.
   - Pick symbol and settlement chain; Create & show QR.
2. Everyone scans QR and clicks “Join with MetaMask”.
3. Buy something with MetaMask on Sepolia.
   - The app auto-detects the outgoing tx and logs the purchase.
   - Balances update instantly.
4. Click “Settle” to generate net pay links (invoices) to the creditors.

Notes
- Auto purchase tracking currently supports Sepolia ETH.
- For agent-signed demo purchases and invoice execution, ensure the Shade client CLI is running and `NEXT_PUBLIC_contractId` is set.

---

## API (selected)
- POST `/invoice` — Create an invoice
- GET `/pay/:id` — Pay link landing
- POST `/pay/:id/quote` — Quote
- POST `/pay/:id/execute` — Execute via Shade Agent
- Tabs: `/tabs`, `/tab/:id`, `/tab/:id/join`, `/tab/:id/settle`

---

## Future
- Bank/card linking and multi-rail settlement
- ERC-20, multi-chain routing
- Persistent storage (DB)
```