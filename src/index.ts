import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import dotenv from "dotenv";
import requestLogger from "./middleware/logging";
import apiKeyAuthMiddleware from "./middleware/auth";
import createRateLimitMiddleware from "./middleware/rateLimit";
import createIdempotencyMiddleware from "./middleware/idempotency";

// Load environment variables from .env file (only needed for local development)
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.development.local" });
}

// Import routes
import ethAccount from "./routes/ethAccount";
import agentAccount from "./routes/agentAccount";
import transaction, { createInvoiceDirect } from "./routes/transaction";
import makeTabsRouter from "./routes/tabs";
import crosschain from "./routes/crosschain";
import enhancedInvoice from "./routes/enhanced-invoice";
import apiDocs from "./routes/docs";
import { startWebhookDispatcher } from "./services/webhook-dispatcher";
import webhooksAdmin from "./routes/webhooksAdmin";
import adminApi from "./routes/admin/index";
import adminUi from "./routes/admin/ui";

const app = new Hono();
// Configure CORS
app.use(cors());

// Global logging
app.use("/*", requestLogger);

// Health check
app.get("/", (c) => c.json({ message: "App is running" }));

// Mount public routes
app.route("/", transaction);                             // homepage + invoices
app.route("/", makeTabsRouter(createInvoiceDirect));     // /tabs, /tab/:id

// Secure API routes with auth, rate limit, and idempotency
app.use("/api/*", apiKeyAuthMiddleware);
app.use("/api/*", createRateLimitMiddleware({ capacity: 120, refillPerMinute: 120 }));
app.use("/api/*", createIdempotencyMiddleware());

// Routes
app.route("/api/eth-account", ethAccount);
app.route("/api/agent-account", agentAccount);
app.route("/api/transaction", transaction);
app.route("/api/crosschain", crosschain);                // Cross-chain payment rails
app.route("/api/enhanced", enhancedInvoice);             // Enhanced invoices with cross-chain support
app.route("/api", apiDocs);                               // /api/openapi.yaml, /api/docs
app.route("/api/webhooks", webhooksAdmin);               // /api/webhooks/* + /webhooks-admin UI
app.route("/", webhooksAdmin);                           // mount UI at /webhooks-admin
app.route("/api/admin", adminApi);                       // orgs/projects/keys/quotas
app.route("/", adminUi);                                 // /admin dashboard

// Start the server
const port = Number(process.env.PORT || "3000");

console.log(`App is running on port ${port}`);

serve({ fetch: app.fetch, port });

// Start webhook dispatcher if enabled
if (process.env.WEBHOOKS_ENABLED === 'true') {
  const secret = process.env.WEBHOOK_SECRET || 'dev_secret';
  startWebhookDispatcher({ secret, intervalMs: Number(process.env.WEBHOOK_POLL_INTERVAL_MS || '3000') });
}
