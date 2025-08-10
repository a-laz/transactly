## Transactly

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

# Get this from near-cli-rs 
NEAR_ACCOUNT_ID=
NEAR_SEED_PHRASE="" 

# ac-proxy.[NEAR_ACCOUNT_ID] for running locally, ac-sandbox.[NEAR_ACCOUNT_ID] for running on Phala Cloud
NEXT_PUBLIC_contractId=ac-proxy.NEAR_ACCOUNT_ID

# Do not change this API codehash, this is the code hash for the shade-agent-api
API_CODEHASH=a86e3a4300b069c08d629a38d61a3d780f7992eaf36aa505e4527e466553e2e5


# FOR PHALA DEPLOYMENTS
# Everything below will be needed for deployments to Phala Cloud

# Your App's code hash, this will update automatically each time you run shade-agent-cli
APP_CODEHASH=af0c4432864489eb8c6650a6dc61f03ef831240a4199e602cd4d6bd8f4d7163f

# Your Docker tag docker_username/image_name
DOCKER_TAG=pivortex/my-app

# Your Phala API key, get from https://cloud.phala.network/dashboard/tokens  
PHALA_API_KEY=

```

---

## Run (3 terminals)

1) Shade client CLI (agent signer)
```bash
# Example (adapt per your setup)
# Ensure this process can receive signature requests
shade-client-cli
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

### NEAR invoices (built-in)
- From the homepage, set:
  - Symbol: `NEAR`
  - Pay To Chain: `near`
  - Pay To Address: `youraccount.testnet` (or mainnet account)
- The pay page will show an “Open in MyNearWallet” link and a QR that deep‑links to MyNearWallet with the receiver and amount.
- After approving in the wallet, you will be redirected back via `/invoice/:id/near-callback`, which marks the invoice as paid for demo purposes.

Notes
- The callback is a demo shortcut. For production, verify payment on‑chain via a NEAR RPC watcher and only then mark the invoice paid.
- Testnet wallet: `https://testnet.mynearwallet.com` is used automatically when the receiver ends with `.testnet`.

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

---

## Payment Rails (Scaffold)

This repo now includes a pluggable payment rails layer (not yet wired into the settle flow):

- `src/rails/PaymentRail.ts` — interface and shared types (now asset-aware)
- `src/rails/crypto.ts` — split into `evm-native` and `near-native` rails
- `src/rails/ach.ts` — simulated ACH rail (swap for Stripe/Dwolla later)
- `src/rails/card.ts` — placeholder for card rail
- `src/rails/router.ts` — simple selector to choose a rail per transfer

Example (pseudo-usage):

```ts
import { pickRail } from './src/rails/router';

const input = {
  amount: { value: '10.00', asset: { symbol: 'USD' } },
  from: { id: 'debtor-1' },
  to: { id: 'creditor-1', destination: { evm: '0x...', bankToken: undefined } },
  meta: { preferredSettlement: 'crypto' }
};
const rail = pickRail(input);
const quote = await rail.quote(input);
const payment = await rail.createPayment({ ...input, idempotencyKey: 'abc123' });
```

Wiring this into tab settlement is planned for a future sprint.

---

## Shade Agent (NEAR)

The Shade client CLI (NEAR protocol component) is used for agent‑signed EVM demo payments. Ensure it is running if you demo the "Pay Now (demo)" button for Sepolia ETH.

Example:
```
shade-client-cli start --contract-id "$NEXT_PUBLIC_contractId"
```
