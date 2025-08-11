import crypto from 'crypto';

export function createSignature(secret: string, body: string, timestampMs?: number): { signature: string; timestamp: string } {
  const ts = String(timestampMs ?? Date.now());
  const toSign = `${ts}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  return { signature, timestamp: ts };
}

export function verifySignature(
  secret: string,
  body: string,
  signature: string,
  timestamp: string,
  toleranceMs = 5 * 60 * 1000
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > toleranceMs) return false;
  const expected = createSignature(secret, body, ts);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected.signature, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// Backward-compatible names (if imported elsewhere)
export const signPayload = createSignature;


