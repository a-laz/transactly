import type { Context, Next } from "hono";
import { KeysRepo } from "../repositories/admin";
import { verifyApiKey } from "../utils/api-keys";

// Simple API key auth middleware
// - Allows requests if API_KEYS env is not set (dev-friendly)
// - When set, expects either:
//   - header: x-api-key: <key>
//   - header: authorization: Bearer <key>
export async function apiKeyAuthMiddleware(c: Context, next: Next) {
  const pathname = new URL(c.req.url).pathname;
  // Allow public docs/spec
  if (pathname === "/api/docs" || pathname === "/api/docs-swagger" || pathname === "/api/openapi.yaml") {
    return next();
  }
  // Exempt admin API from consumer API key auth; it's protected by ADMIN_API_KEY in its own router
  if (pathname.startsWith('/api/admin')) {
    return next();
  }

  const keysEnv = process.env.API_KEYS || "";
  const allowedKeys = keysEnv
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  // Parse provided key even in dev for logging/quotas
  const fromHeader = c.req.header("x-api-key") || "";
  const auth = c.req.header("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const provided = fromHeader || bearer;

  // If no keys configured, allow all (development) but attach provided key if present
  // If DB-backed keys enabled, verify by prefix+hash first
  if (process.env.DB_KEYS_ENABLED === 'true' && provided) {
    try {
      const prefix = provided.slice(0, 16);
      const rec = await KeysRepo.getByPrefix(prefix);
      if (rec && rec.status === 'active' && verifyApiKey(provided, rec.salt!, rec.keyHash!)) {
        c.set('apiKey', provided);
        c.set('apiKeyId', rec.id);
        c.set('projectId', rec.projectId);
        return next();
      }
    } catch {}
  }

  if (allowedKeys.length === 0) {
    if (provided) c.set("apiKey", provided);
    return next();
  }

  if (!provided || !allowedKeys.includes(provided)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Attach key to context for downstream (e.g., rate limiting)
  c.set("apiKey", provided);
  await next();
}

export default apiKeyAuthMiddleware;


