import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const scope = 'kt-dongbu:wireless-leads:read:v1';
const lifetime = 90 * 24 * 60 * 60 * 1000;
function key() {
  // Use the existing server-only secret; never put it in static assets or responses.
  const secret = process.env.WIRELESS_LINK_SECRET || process.env.TELEGRAM_BOT_TOKEN;
  if (!secret) throw new Error('link configuration missing');
  return hkdfSync('sha256', secret, 'kt-dongbu', scope, 32);
}
export function issueAccess(password, now = Date.now()) {
  const expiresAt = now + lifetime;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(scope));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({password, expiresAt, version:process.env.WIRELESS_LINK_VERSION || '1'}), 'utf8'), cipher.final()]);
  return {token:Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url'), expiresAt};
}
export function readAccess(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length < 60 || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('invalid link');
  const raw = Buffer.from(token, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0,12));
  decipher.setAAD(Buffer.from(scope));
  decipher.setAuthTag(raw.subarray(12,28));
  const payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
  if (payload.version !== (process.env.WIRELESS_LINK_VERSION || '1') || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now || typeof payload.password !== 'string' || !payload.password || payload.password.length > 200) throw new Error('expired link');
  return payload.password;
}
