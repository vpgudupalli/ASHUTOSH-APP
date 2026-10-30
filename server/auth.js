import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { one, STAFF_ROLES } from './db.js';

const IS_PROD = process.env.NODE_ENV === 'production';
export const COOKIE_NAME = 'rn_session';

if (IS_PROD && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const SESSION_HOURS = 12;

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function setSession(res, user) {
  const token = jwt.sign({ uid: user.id }, SECRET, { expiresIn: `${SESSION_HOURS}h` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: SESSION_HOURS * 3600 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

// Resolves a session token to an active user row (or null).
export async function userFromToken(token) {
  if (!token) return null;
  try {
    const { uid } = jwt.verify(token, SECRET);
    return await one('SELECT id, email, name, role, active FROM users WHERE id = $1 AND active', [uid]);
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const user = await userFromToken(req.cookies?.[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed' });

export const isStaff = (user) => STAFF_ROLES.includes(user.role);

// Admins see everyone, staff see patients assigned to them, patients see themselves.
export async function canAccessPatient(user, patientId) {
  if (user.role === 'admin') return true;
  if (user.role === 'patient') {
    return !!(await one('SELECT 1 FROM patients WHERE id = $1 AND user_id = $2', [patientId, user.id]));
  }
  return !!(await one('SELECT 1 FROM assignments WHERE patient_id = $1 AND staff_id = $2', [patientId, user.id]));
}
