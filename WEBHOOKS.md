# Webhooks

## Signing (HMAC SHA-256)
- Each delivery includes headers:
  - `x-webhook-signature`: hex HMAC of `${timestamp}.${body}`
  - `x-webhook-timestamp`: ms epoch
  - `x-webhook-alg`: `sha256`
  - `x-webhook-event`: event type (e.g., `invoice.payment.created`)
  - `x-webhook-id`: event id
- Verification (pseudo):
```ts
const body = await req.text();
const sig = req.header('x-webhook-signature');
const ts = req.header('x-webhook-timestamp');
const alg = req.header('x-webhook-alg');
const ok = verifySignature(WEBHOOK_SECRET, body, { signature: sig, timestamp: ts, algorithm: alg as any });
```

## Retry Policy
- Exponential backoff with jitter: `2^attempts * 2s + [0..1s]`, capped at ~3 minutes between attempts.
- Maximum attempts: 6. On exceeding, the event is moved to the DLQ.
- Status transitions: `pending -> delivering -> delivered` or `pending -> delivering -> pending (retry)` or `dead`.

## Persistence
- Outbox: `webhooks_outbox`
  - Fields: id, event_id, event_type, target_url, payload(JSON), status, attempts, next_attempt_at, last_error, created_at, updated_at
- Dead-Letter Queue: `webhooks_dlq`
  - Fields: id, outbox_id, event_id, event_type, target_url, payload(JSON), error, attempts, created_at

## Configuration
- Set `WEBHOOKS_ENABLED=true` to start the dispatcher.
- Set `WEBHOOK_SECRET` to your signing secret (default `dev_secret`).
- Optional: `WEBHOOK_POLL_INTERVAL_MS` to adjust polling cadence (default 3000ms).

## Emitted Events
- `invoice.payment.created`: enqueued when an invoice payment is created (execute).
  - Payload: `{ invoiceId, paymentId, rail, routeId, status }`

```bash
# Local testing example
export WEBHOOKS_ENABLED=true
export WEBHOOK_SECRET=dev_secret
npm run dev
```


