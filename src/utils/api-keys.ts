import crypto from 'crypto';

export function generateApiKey(prefix: string = 'txn_dev'): { plaintext: string; prefix: string; salt: string; hash: string } {
  const random = crypto.randomBytes(24).toString('base64url');
  const plaintext = `${prefix}_${random}`;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashApiKey(plaintext, salt);
  return { plaintext, prefix: plaintext.slice(0, 16), salt, hash };
}

export function hashApiKey(plaintext: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(plaintext).digest('hex');
}

export function verifyApiKey(plaintext: string, salt: string, expectedHash: string): boolean {
  const h = hashApiKey(plaintext, salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}


