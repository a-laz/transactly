````markdown
# Transactly

Transactly is a lightweight payment request and execution demo built on top of Shade Agents.  
It lets you:

- Create ETH invoices (Sepolia testnet by default)
- Generate a payment link with a QR code
- Quote estimated gas fees
- Execute a payment transaction directly from the browser
- View payment status live

---

## 📸 Screenshot

![Screenshot](https://github.com/a-laz/transactly/blob/master/docs/screenshot.png)

> Example invoice page showing payment address, QR code, and one-click quote & pay actions.

---

## 🚀 Features
- **Invoice Creation** — Simple API to create payment requests.
- **Live Status Updates** — Automatic invoice status refresh.
- **QR Code Payment Links** — Quickly scan to open in Etherscan.
- **Quote & Pay** — One-click estimate or send transaction.
- **History Tracking** — Keep a record of all invoices in memory.

---

## 🛠️ Tech Stack
- **Backend:** Node.js (Hono framework), Shade Agent SDK, Ethers.js v6
- **Frontend:** Minimal HTML/JS UI served from the backend
- **Blockchain:** Sepolia ETH (with optional Base Sepolia support)
- **QR Codes:** `qrcode` JS library

---

## 📦 Installation

```bash
git clone https://github.com/a-laz/transactly.git
cd transactly
npm install
```
````

---

## ⚙️ Environment Variables

Create a `.env` file:

```env
PUBLIC_BASE_URL=http://localhost:3000
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your_key>
NEXT_PUBLIC_contractId=<your_contract_id>
```

---

## ▶️ Running Locally

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

---

## 🔗 API Endpoints

| Method | Endpoint           | Description                 |
| ------ | ------------------ | --------------------------- |
| POST   | `/invoice`         | Create a new invoice        |
| GET    | `/invoice/:id`     | Get invoice details         |
| GET    | `/pay/:id`         | View invoice payment page   |
| POST   | `/pay/:id/quote`   | Get estimated gas fees      |
| POST   | `/pay/:id/execute` | Execute payment transaction |

---

## 🧪 Demo Workflow

1. **Create an invoice** via API or form.
2. **Open payment page** (includes QR code).
3. **Click "Quote"** to see estimated gas.
4. **Click "Pay Now"** to send transaction.
5. **View live status updates** on the invoice page.

---

## 📜 License

MIT

