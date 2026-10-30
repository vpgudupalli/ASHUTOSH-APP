import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { one, STAFF_ROLES } from './db.js';

const IS_PROD = process.env.NODE_ENV === 'production';
export const COOKIE_NAME = 'rn_session';

if (IS_PROD && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

// HIPAA automatic logoff: sessions end after IDLE minutes of inactivity, and
// always after MAX_HOURS, even if active.
export const IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES) || 15;
const MAX_HOURS = 12;
export const REQUIRE_STAFF_MFA = process.env.REQUIRE_STAFF_MFA === 'true';
export const MIN_PASSWORD = 10;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export const hashPassword = (pw) => bcrypt.hash(pw, 12);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function passwordProblem(pw) {
  pw = String(pw || '');
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include letters and numbers';
  return null;
}

export function setSession(res, user, start = Date.now()) {
  const token = jwt.sign({ uid: user.id, start }, SECRET, { expiresIn: `${IDLE_MINUTES}m` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: IDLE_MINUTES * 60 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: IS_PROD });
}

// Short-lived token proving the password step passed, used for the MFA step.
export const signMfaToken = (uid) => jwt.sign({ uid, purpose: 'mfa' }, SECRET, { expiresIn: '5m' });
export function readMfaToken(token) {
  try {
    const p = jwt.verify(token, SECRET);
    return p.purpose === 'mfa' ? p.uid : null;
  } catch {
    return null;
  }
}

// Resolves a session token to { user, start } (or null).
export async function sessionFromToken(token) {
  if (!token) return null;
  try {
    const { uid, start } = jwt.verify(token, SECRET);
    if (!start || Date.now() - start > MAX_HOURS * 3600 * 1000) return null;
    const user = await one(
      'SELECT id, email, name, role, active, mfa_enabled FROM users WHERE id = $1 AND active', [uid]
    );
    return user ? { user, start } : null;
  } catch {
    return null;
  }
}

export const isStaff = (user) => STAFF_ROLES.includes(user.role);

// Routes a staff member may use before setting up required MFA.
const MFA_SETUP_PATHS = ['/auth/me', '/auth/logout', '/auth/mfa/setup', '/auth/mfa/enable', '/auth/password', '/config'];

export async function requireAuth(req, res, next) {
  const session = await sessionFromToken(req.cookies?.[COOKIE_NAME]);
  if (!session) {
    clearSession(res);
    return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
  }
  req.user = session.user;
  setSession(res, session.user, session.start); // sliding idle timeout
  if (REQUIRE_STAFF_MFA && session.user.role !== 'patient' && !session.user.mfa_enabled && !MFA_SETUP_PATHS.includes(req.path)) {
    return res.status(403).json({ error: 'Two-factor authentication must be set up before accessing patient data.', code: 'MFA_SETUP_REQUIRED' });
  }
  next();
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed' });

export const requireStaff = requireRole('admin', ...STAFF_ROLES);

// Minimum necessary access: admins see everyone, staff see assigned patients,
// patients see only themselves.
export async function canAccessPatient(user, patientId) {
  if (!Number.isInteger(patientId)) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'patient') {
    return !!(await one('SELECT 1 FROM patients WHERE id = $1 AND user_id = $2', [patientId, user.id]));
  }
  return !!(await one('SELECT 1 FROM assignments WHERE patient_id = $1 AND staff_id = $2', [patientId, user.id]));
}
