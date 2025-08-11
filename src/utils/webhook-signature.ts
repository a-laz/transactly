import crypto from 'crypto';

export type SignatureHeader = {
  signature: string;         // hex hmac
  timestamp: string;         // ms epoch as string
  algorithm: 'sha256';
};

export function signPayload(secret: string, body: string, timestampMs?: number): SignatureHeader {
  const ts = String(timestampMs ?? Date.now());
  const toSign = `${ts}.${body}`;
  const h = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  return { signature: h, timestamp: ts, algorithm: 'sha256' };
}

export function verifySignature(secret: string, body: string, header: SignatureHeader, toleranceMs = 5 * 60 * 1000): boolean {
  if (header.algorithm !== 'sha256') return false;
  const ts = Number(header.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > toleranceMs) return false;
  const expected = signPayload(secret, body, ts);
  return crypto.timingSafeEqual(Buffer.from(expected.signature, 'hex'), Buffer.from(header.signature, 'hex'));
}


