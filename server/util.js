// Wraps async handlers so thrown errors become 500s instead of crashing.
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const clean = (s, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const validDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
export const ipOf = (req) => req.ip;

export function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, mfaEnabled: !!u.mfa_enabled };
}
