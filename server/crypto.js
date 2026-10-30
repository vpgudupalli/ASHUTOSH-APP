// Small crypto helpers: TOTP (RFC 6238) for MFA, and AES-256-GCM for
// encrypting secrets at rest (MFA seeds).
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret() {
  let bits = '';
  for (const b of crypto.randomBytes(20)) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function hotp(key, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

// Accepts codes from the previous, current and next 30-second window (clock drift).
export function verifyTotp(secret, token) {
  const code = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const step = Math.floor(Date.now() / 30000);
  for (let w = -1; w <= 1; w++) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, step + w)), Buffer.from(code))) return true;
  }
  return false;
}

export const otpauthUrl = (secret, email) =>
  `otpauth://totp/${encodeURIComponent(`Risk Navigator:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('Risk Navigator')}`;

const encKey = () =>
  crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-secret-change-me').digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
