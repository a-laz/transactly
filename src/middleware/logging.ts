import type { Context, Next } from "hono";

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  const reqId = `${start}-${Math.random().toString(36).slice(2, 8)}`;
  c.set("reqId", reqId);

  const path = new URL(c.req.url).pathname;
  const method = c.req.method;
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "";
  const apiKey = (c.get("apiKey") as string | undefined) ? "yes" : "no";

  try {
    await next();
  } finally {
    const ms = Date.now() - start;
    const status = c.res.status;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ reqId, t: new Date(start).toISOString(), method, path, status, ms, ip, authed: apiKey }));
  }
}

export default requestLogger;


