import express from 'express';
import { query, one, audit, STAFF_ROLES } from '../db.js';
import { hashPassword, passwordProblem, requireAuth, requireRole } from '../auth.js';
import { notifyCareTeam, notifyUser } from '../realtime.js';
import { randomToken, sha256 } from '../crypto.js';
import { h, clean, validEmail, ipOf } from '../util.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// ---------- care team assignments ----------

router.post('/patients/:id/assignments', h(async (req, res) => {
  const patientId = Number(req.params.id);
  const staffId = Number(req.body.staffId);
  const staff = await one('SELECT id, role FROM users WHERE id = $1 AND active', [staffId]);
  if (!staff || !STAFF_ROLES.includes(staff.role)) return res.status(400).json({ error: 'Pick a staff member' });
  await query('INSERT INTO assignments (patient_id, staff_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [patientId, staffId]);
  audit(req.user.id, 'assign', patientId, `staff ${staffId}`, ipOf(req));
  notifyCareTeam(patientId, 'patients:changed', {});
  res.json({ ok: true });
}));

router.delete('/patients/:id/assignments/:staffId', h(async (req, res) => {
  const patientId = Number(req.params.id);
  const staffId = Number(req.params.staffId);
  await query('DELETE FROM assignments WHERE patient_id = $1 AND staff_id = $2', [patientId, staffId]);
  audit(req.user.id, 'unassign', patientId, `staff ${staffId}`, ipOf(req));
  notifyCareTeam(patientId, 'patients:changed', {});
  notifyUser(staffId, 'patients:changed', {});
  res.json({ ok: true });
}));

// ---------- users ----------

router.get('/users', h(async (req, res) => {
  const users = await query(
    `SELECT id, email, name, role, active, mfa_enabled, last_login_at, created_at,
            (locked_until IS NOT NULL AND locked_until > now()) AS locked
       FROM users ORDER BY role, name`
  );
  res.json({ users });
}));

router.post('/users', h(async (req, res) => {
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const role = req.body.role;
  if (!name || !validEmail(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  if (!['admin', ...STAFF_ROLES].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const problem = passwordProblem(req.body.password);
  if (problem) return res.status(400).json({ error: `Temporary password: ${problem.toLowerCase()}` });
  if (await one('SELECT 1 FROM users WHERE email = $1', [email])) return res.status(409).json({ error: 'An account with that email already exists' });
  const user = await one(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [email, await hashPassword(req.body.password), name, role]
  );
  audit(req.user.id, 'user_create', null, `${role} #${user.id}`, ipOf(req));
  res.json({ id: user.id });
}));

router.patch('/users/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Use the Account page to change your own account' });
  const target = await one('SELECT role FROM users WHERE id = $1', [id]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const { active, role, password, resetMfa, unlock } = req.body;
  if (typeof active === 'boolean') await query('UPDATE users SET active = $1 WHERE id = $2', [active, id]);
  if (role !== undefined) {
    if (!['admin', ...STAFF_ROLES].includes(role) || target.role === 'patient') return res.status(400).json({ error: 'Invalid role change' });
    await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  }
  if (password) {
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    await query('UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL WHERE id = $2', [await hashPassword(password), id]);
  }
  if (resetMfa) await query('UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1', [id]);
  if (unlock) await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [id]);
  audit(req.user.id, 'user_update', null, `user #${id}: ${Object.keys(req.body).join(',')}`, ipOf(req));
  res.json({ ok: true });
}));

router.get('/staff', h(async (req, res) => {
  const staff = await query(`SELECT id, name, role FROM users WHERE active AND role = ANY($1::text[]) ORDER BY name`, [STAFF_ROLES]);
  res.json({ staff });
}));

// ---------- EMR API keys ----------

router.get('/api-keys', h(async (req, res) => {
  const keys = await query(
    `SELECT k.id, k.name, k.key_prefix, k.created_at, k.last_used_at, k.revoked_at, u.name AS created_by_name
       FROM api_keys k LEFT JOIN users u ON u.id = k.created_by ORDER BY k.created_at DESC`
  );
  res.json({ keys });
}));

// The full key is shown once; only its SHA-256 hash is stored.
router.post('/api-keys', h(async (req, res) => {
  const name = clean(req.body.name, 100);
  if (!name) return res.status(400).json({ error: 'Name the system using this key (e.g. "Epic test")' });
  const key = `rn_${randomToken(30)}`;
  await query('INSERT INTO api_keys (name, key_prefix, key_hash, created_by) VALUES ($1, $2, $3, $4)', [name, key.slice(0, 10), sha256(key), req.user.id]);
  audit(req.user.id, 'api_key_create', null, name, ipOf(req));
  res.json({ key });
}));

router.delete('/api-keys/:id', h(async (req, res) => {
  await query('UPDATE api_keys SET revoked_at = now() WHERE id = $1', [Number(req.params.id)]);
  audit(req.user.id, 'api_key_revoke', null, `key #${req.params.id}`, ipOf(req));
  res.json({ ok: true });
}));

// ---------- website inquiries ----------

router.get('/inquiries', h(async (req, res) => {
  const inquiries = await query(
    `SELECT i.*, u.name AS handled_by_name FROM inquiries i LEFT JOIN users u ON u.id = i.handled_by
      ORDER BY (i.handled_at IS NULL) DESC, i.created_at DESC LIMIT 500`
  );
  res.json({ inquiries });
}));

router.patch('/inquiries/:id', h(async (req, res) => {
  const handled = !!req.body.handled;
  await query(
    'UPDATE inquiries SET handled_at = CASE WHEN $1 THEN now() ELSE NULL END, handled_by = CASE WHEN $1 THEN $2::int ELSE NULL END WHERE id = $3',
    [handled, req.user.id, Number(req.params.id)]
  );
  res.json({ ok: true });
}));

// ---------- audit log ----------

router.get('/audit', h(async (req, res) => {
  const filters = [];
  const vals = [];
  if (req.query.patientId) { vals.push(Number(req.query.patientId)); filters.push(`a.patient_id = $${vals.length}`); }
  if (req.query.userId) { vals.push(Number(req.query.userId)); filters.push(`a.user_id = $${vals.length}`); }
  if (req.query.action) { vals.push(String(req.query.action)); filters.push(`a.action = $${vals.length}`); }
  const rows = await query(
    `SELECT a.id, a.created_at, a.action, a.patient_id, a.detail, a.ip, u.name AS user_name, u.role AS user_role, p.name AS patient_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN patients p ON p.id = a.patient_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY a.created_at DESC LIMIT 1000`,
    vals
  );
  if (req.query.format === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['time,user,role,action,patient_id,patient,detail,ip',
      ...rows.map((r) => [new Date(r.created_at).toISOString(), r.user_name, r.user_role, r.action, r.patient_id, r.patient_name, r.detail, r.ip].map(esc).join(','))].join('\n');
    audit(req.user.id, 'audit_export', null, `${rows.length} rows`, ipOf(req));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    return res.send(csv);
  }
  res.json({ entries: rows });
}));

export default router;
