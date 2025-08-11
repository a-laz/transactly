import { WebhookRepo } from "../repositories/webhooks";
import { signPayload } from "../utils/webhook-signature";

type DispatcherOpts = {
  secret: string;
  intervalMs?: number;
  maxAttempts?: number;
};

export function startWebhookDispatcher(opts: DispatcherOpts) {
  const interval = opts.intervalMs ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 6; // ~ exponential up to ~3m
  async function tick() {
    try {
      const rows = await WebhookRepo.pickNext(10);
      for (const row of rows) {
        try {
          await WebhookRepo.markDelivering(row.id);
          const body = row.payload;
          const header = signPayload(opts.secret, body);
          const res = await fetch(row.targetUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-webhook-signature': header.signature,
              'x-webhook-timestamp': header.timestamp,
              'x-webhook-alg': header.algorithm,
              'x-webhook-event': row.eventType,
              'x-webhook-id': row.eventId,
            },
            body,
          });
          if (res.ok) {
            await WebhookRepo.markDelivered(row.id);
          } else {
            throw new Error(`HTTP ${res.status}`);
          }
        } catch (err: any) {
          const attempts = (row.attempts ?? 0) + 1;
          if (attempts >= maxAttempts) {
            await WebhookRepo.deadLetter(row, err?.message || String(err));
          } else {
            // exponential backoff with jitter: base 2^n * 2s, cap 3m
            const base = Math.min(180_000, Math.pow(2, attempts) * 2000);
            const jitter = Math.floor(Math.random() * 1000);
            await WebhookRepo.bumpRetry(row.id, attempts, Date.now() + base + jitter, err?.message || String(err));
          }
        }
      }
    } catch {}
  }
  setInterval(tick, interval);
}


