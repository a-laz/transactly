import type { Context, Next } from "hono";

// In-memory idempotency store (replace with Redis/DB in prod)
type Entry = { status: number; body: any; headers?: Record<string, string>; ts: number; bodyHash?: string };
const store = new Map<string, Entry>();

export function createIdempotencyMiddleware(options?: {
  headerName?: string; // default: Idempotency-Key
  ttlMs?: number; // default: 24h
}) {
  const header = options?.headerName || "Idempotency-Key";
  const ttlMs = options?.ttlMs ?? 24 * 60 * 60 * 1000;

  return async function idempotency(c: Context, next: Next) {
    const method = c.req.method.toUpperCase();
    // Only apply to unsafe methods
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return next();
    }

    const idemKey = c.req.header(header);
    if (!idemKey) {
      return next();
    }

    // Clean expired entries occasionally
    if (Math.random() < 0.01) {
      const now = Date.now();
      for (const [k, v] of store) {
        if (now - v.ts > ttlMs) store.delete(k);
      }
    }

    const url = new URL(c.req.url);
    const pathname = url.pathname;
    const methodKey = c.req.method.toUpperCase();
    const apiKey = (c.get("apiKey") as string | undefined) || "anon";
    const scopeKey = `${apiKey}:${methodKey}:${pathname}:${idemKey}`;

    const existing = store.get(scopeKey);
    if (existing) {
      const h = existing.headers || {};
      for (const [hk, hv] of Object.entries(h)) c.header(hk, hv);
      c.header("Idempotent-Replay", "true");
      return c.json(existing.body, existing.status);
    }

    // Capture response by monkey-patching c.json
    const origJson = c.json.bind(c);
    // Compute a simple hash of the request body if available
    let reqBodyString = "";
    try {
      // Clone request body by re-reading json if possible; ignore errors
      // Note: Hono doesn't provide a direct clone here; leave empty in most cases
    } catch {}

    (c as any).json = (body: any, status = 200, headers?: Record<string, string>) => {
      store.set(scopeKey, { status, body, headers, ts: Date.now(), bodyHash: reqBodyString });
      if (headers) for (const [hk, hv] of Object.entries(headers)) c.header(hk, hv);
      c.header("Idempotency-Key", idemKey);
      return origJson(body, status);
    };

    await next();
  };
}

export default createIdempotencyMiddleware;


