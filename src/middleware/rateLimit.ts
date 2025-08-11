import type { Context, Next } from "hono";

type Bucket = { tokens: number; lastRefillMs: number };

const buckets = new Map<string, Bucket>();

// Token bucket rate limiter per apiKey or IP
// Defaults: 60 req/min per key (or IP if unauthenticated)
export function createRateLimitMiddleware(options?: {
  capacity?: number; // max tokens in bucket
  refillPerMinute?: number; // tokens added per minute
}) {
  const capacity = options?.capacity ?? 60;
  const refillPerMinute = options?.refillPerMinute ?? 60;
  const refillPerMs = refillPerMinute / 60_000; // tokens per ms

  return async function rateLimit(c: Context, next: Next) {
    const apiKey = (c.get("apiKey") as string | undefined) ||
      c.req.header("x-api-key") ||
      c.req.header("authorization") ||
      c.req.header("x-forwarded-for") ||
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-real-ip") ||
      new URL(c.req.url).hostname;

    const key = `rl:${apiKey || "anon"}`;
    const now = Date.now();

    const b = buckets.get(key) || { tokens: capacity, lastRefillMs: now };
    // Refill
    const elapsed = Math.max(0, now - b.lastRefillMs);
    const refill = elapsed * refillPerMs;
    b.tokens = Math.min(capacity, b.tokens + refill);
    b.lastRefillMs = now;

    if (b.tokens < 1) {
      const retryAfterSec = Math.ceil((1 - b.tokens) / refillPerMs / 1000);
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    b.tokens -= 1;
    buckets.set(key, b);

    await next();
  };
}

export default createRateLimitMiddleware;


