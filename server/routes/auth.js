import express from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { query, one, audit } from '../db.js';
import {
  hashPassword, checkPassword, passwordProblem, setSession, clearSession, requireAuth,
  signMfaToken, readMfaToken, IDLE_MINUTES, REQUIRE_STAFF_MFA, MAX_FAILED_LOGINS, LOCK_MINUTES,
} from '../auth.js';
import { generateTotpSecret, verifyTotp, otpauthUrl, encrypt, decrypt } from '../crypto.js';
import { notifyPatient } from '../realtime.js';
import { h, clean, validEmail, validDate, ipOf, publicUser } from '../util.js';

const router = express.Router();
export const ALLOW_PATIENT_SIGNUP = process.env.ALLOW_PATIENT_SIGNUP !== 'false';

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

router.get('/config', (req, res) => res.json({
  allowPatientSignup: ALLOW_PATIENT_SIGNUP,
  idleMinutes: IDLE_MINUTES,
  requireStaffMfa: REQUIRE_STAFF_MFA,
}));

router.post('/auth/register', authLimiter, h(async (req, res) => {
  if (!ALLOW_PATIENT_SIGNUP) return res.status(403).json({ error: 'Self sign-up is disabled' });
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !validEmail(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  if (!req.body.privacyAck) return res.status(400).json({ error: 'Please acknowledge the privacy notice to continue' });
  if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const user = await one(
    `INSERT INTO users (email, password_hash, name, role, last_login_at) VALUES ($1, $2, $3, 'patient', now()) RETURNING *`,
    [email, await hashPassword(password), name]
  );
  const patient = await one(
    `INSERT INTO patients (user_id, name, dob, phone, privacy_ack_at, created_by) VALUES ($1, $2, $3, $4, now(), $1) RETURNING id`,
    [user.id, name, validDate(req.body.dob), clean(req.body.phone, 30) || null]
  );
  audit(user.id, 'patient_self_register', patient.id, null, ipOf(req));
  notifyPatient(patient.id, 'patients:changed', {});
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

router.post('/auth/login', authLimiter, h(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const user = await one('SELECT * FROM users WHERE email = $1', [email]);
  const fail = (msg = 'Invalid email or password') => res.status(401).json({ error: msg });

  if (!user || !user.active) {
    audit(null, 'login_failed', null, `unknown or disabled: ${email}`, ipOf(req));
    return fail();
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    audit(user.id, 'login_blocked_locked', null, null, ipOf(req));
    return fail(`Account temporarily locked after too many attempts. Try again in ${LOCK_MINUTES} minutes or contact your administrator.`);
  }
  if (!(await checkPassword(String(req.body.password || ''), user.password_hash))) {
    const failed = user.failed_logins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await query(
      `UPDATE users SET failed_logins = $1, locked_until = CASE WHEN $2 THEN now() + make_interval(mins => $3) ELSE locked_until END WHERE id = $4`,
      [lock ? 0 : failed, lock, LOCK_MINUTES, user.id]
    );
    audit(user.id, lock ? 'account_locked' : 'login_failed', null, null, ipOf(req));
    return fail();
  }
  await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);

  if (user.mfa_enabled) return res.json({ mfaRequired: true, mfaToken: signMfaToken(user.id) });

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  audit(user.id, 'login', null, null, ipOf(req));
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

router.post('/auth/mfa/verify', authLimiter, h(async (req, res) => {
  const uid = readMfaToken(req.body.mfaToken);
  const user = uid && (await one('SELECT * FROM users WHERE id = $1 AND active', [uid]));
  if (!user || !user.mfa_secret) return res.status(401).json({ error: 'Sign-in expired. Please start again.' });
  if (!verifyTotp(decrypt(user.mfa_secret), req.body.code)) {
    audit(user.id, 'mfa_failed', null, null, ipOf(req));
    return res.status(401).json({ error: 'That code is not correct' });
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  audit(user.id, 'login', null, 'with MFA', ipOf(req));
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

router.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, h(async (req, res) => {
  let patientId = null;
  if (req.user.role === 'patient') {
    patientId = (await one('SELECT id FROM patients WHERE user_id = $1', [req.user.id]))?.id ?? null;
  }
  const mfaSetupRequired = REQUIRE_STAFF_MFA && req.user.role !== 'patient' && !req.user.mfa_enabled;
  res.json({ user: { ...publicUser(req.user), patientId, mfaSetupRequired } });
}));

router.post('/auth/password', requireAuth, h(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await checkPassword(String(currentPassword || ''), row.password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), req.user.id]);
  audit(req.user.id, 'password_change', null, null, ipOf(req));
  res.json({ ok: true });
}));

// Step 1 of MFA setup: generate a secret (stored encrypted, not yet active) and QR code.
router.post('/auth/mfa/setup', requireAuth, h(async (req, res) => {
  const secret = generateTotpSecret();
  await query('UPDATE users SET mfa_secret = $1 WHERE id = $2 AND NOT mfa_enabled', [encrypt(secret), req.user.id]);
  const url = otpauthUrl(secret, req.user.email);
  res.json({ secret, qr: await QRCode.toDataURL(url) });
}));

// Step 2: confirm a code from the authenticator app to switch MFA on.
router.post('/auth/mfa/enable', requireAuth, h(async (req, res) => {
  const row = await one('SELECT mfa_secret FROM users WHERE id = $1', [req.user.id]);
  if (!row?.mfa_secret || !verifyTotp(decrypt(row.mfa_secret), req.body.code)) {
    return res.status(400).json({ error: 'That code is not correct. Check the time on your phone and try again.' });
  }
  await query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [req.user.id]);
  audit(req.user.id, 'mfa_enabled', null, null, ipOf(req));
  res.json({ ok: true });
}));

router.post('/auth/mfa/disable', requireAuth, h(async (req, res) => {
  if (REQUIRE_STAFF_MFA && req.user.role !== 'patient') return res.status(400).json({ error: 'Two-factor authentication is required for staff accounts' });
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await checkPassword(String(req.body.password || ''), row.password_hash))) {
    return res.status(400).json({ error: 'Password is incorrect' });
  }
  await query('UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1', [req.user.id]);
  audit(req.user.id, 'mfa_disabled', null, null, ipOf(req));
  res.json({ ok: true });
}));

export default router;
