import express from 'express';
import rateLimit from 'express-rate-limit';
import { query, one, audit, STAFF_ROLES, ALL_ROLES } from './db.js';
import {
  hashPassword, checkPassword, setSession, clearSession,
  requireAuth, requireRole, isStaff, canAccessPatient,
} from './auth.js';
import { notifyPatient, notifyUser } from './realtime.js';
import { calculateRisk, RISK_LEVELS } from '../shared/risk.js';

const router = express.Router();
const ALLOW_PATIENT_SIGNUP = process.env.ALLOW_PATIENT_SIGNUP !== 'false';

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const clean = (s, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validDob = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

// Wraps async handlers so thrown errors become 500s instead of crashing.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Auth ----------

router.get('/config', (req, res) => res.json({ allowPatientSignup: ALLOW_PATIENT_SIGNUP }));

router.post('/auth/register', authLimiter, h(async (req, res) => {
  if (!ALLOW_PATIENT_SIGNUP) return res.status(403).json({ error: 'Self sign-up is disabled' });
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !validEmail(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const user = await one(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'patient') RETURNING *`,
    [email, await hashPassword(password), name]
  );
  const patient = await one(
    'INSERT INTO patients (user_id, name, dob, created_by) VALUES ($1, $2, $3, $1) RETURNING id',
    [user.id, name, validDob(req.body.dob)]
  );
  audit(user.id, 'patient_self_register', patient.id);
  notifyPatient(patient.id, 'patients:changed', {});
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

router.post('/auth/login', authLimiter, h(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const user = await one('SELECT * FROM users WHERE email = $1', [email]);
  if (!user || !user.active || !(await checkPassword(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  audit(user.id, 'login');
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
  res.json({ user: { ...publicUser(req.user), patientId } });
}));

router.post('/auth/password', requireAuth, h(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await checkPassword(String(currentPassword || ''), row.password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (String(newPassword || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), req.user.id]);
  res.json({ ok: true });
}));

// ---------- Patients ----------

const PATIENT_LIST_SQL = `
  SELECT p.id, p.name, to_char(p.dob, 'YYYY-MM-DD') AS dob, p.latest_risk, p.latest_assessment_at, p.created_at,
         u.email AS login_email,
         COALESCE(
           (SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'role', s.role) ORDER BY s.name)
              FROM assignments a JOIN users s ON s.id = a.staff_id WHERE a.patient_id = p.id),
           '[]'::json) AS staff
    FROM patients p
    LEFT JOIN users u ON u.id = p.user_id`;

router.get('/patients', requireAuth, h(async (req, res) => {
  const order = `ORDER BY CASE p.latest_risk WHEN 'Critical' THEN 0 WHEN 'High Risk' THEN 1
                 WHEN 'Rising Risk' THEN 2 WHEN 'Stable' THEN 3 ELSE 4 END, p.latest_assessment_at DESC NULLS LAST, p.name`;
  let rows;
  if (req.user.role === 'admin') {
    rows = await query(`${PATIENT_LIST_SQL} ${order}`);
  } else if (req.user.role === 'patient') {
    rows = await query(`${PATIENT_LIST_SQL} WHERE p.user_id = $1`, [req.user.id]);
  } else {
    rows = await query(
      `${PATIENT_LIST_SQL} WHERE p.id IN (SELECT patient_id FROM assignments WHERE staff_id = $1) ${order}`,
      [req.user.id]
    );
  }
  res.json({ patients: rows });
}));

// Admin or staff can add a patient record (optionally with a login for the patient).
router.post('/patients', requireAuth, requireRole('admin', ...STAFF_ROLES), h(async (req, res) => {
  const name = clean(req.body.name);
  if (!name) return res.status(400).json({ error: 'Patient name is required' });
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || '');

  let userId = null;
  if (email) {
    if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    userId = (await one(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'patient') RETURNING id`,
      [email, await hashPassword(password), name]
    )).id;
  }
  const patient = await one(
    'INSERT INTO patients (user_id, name, dob, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, name, validDob(req.body.dob), req.user.id]
  );
  // Staff who add a patient are automatically on that patient's care team.
  if (isStaff(req.user)) {
    await query('INSERT INTO assignments (patient_id, staff_id) VALUES ($1, $2)', [patient.id, req.user.id]);
  }
  audit(req.user.id, 'patient_create', patient.id);
  notifyPatient(patient.id, 'patients:changed', {});
  res.json({ id: patient.id });
}));

router.get('/patients/:id', requireAuth, h(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await canAccessPatient(req.user, id))) return res.status(404).json({ error: 'Patient not found' });
  const patient = await one(`${PATIENT_LIST_SQL} WHERE p.id = $1`, [id]);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const assessments = await query(
    `SELECT a.id, a.data, a.risk, a.created_at, u.name AS submitted_by_name, u.role AS submitted_by_role
       FROM assessments a LEFT JOIN users u ON u.id = a.submitted_by
      WHERE a.patient_id = $1 ORDER BY a.created_at DESC LIMIT 100`,
    [id]
  );
  if (req.user.role !== 'patient') audit(req.user.id, 'patient_view', id);
  res.json({ patient, assessments });
}));

router.post('/patients/:id/assessments', requireAuth, h(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await canAccessPatient(req.user, id))) return res.status(404).json({ error: 'Patient not found' });
  const data = req.body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Assessment data is required' });
  }
  // Risk is always computed on the server so it can't be spoofed by the client.
  const risk = calculateRisk(data);
  const row = await one(
    `INSERT INTO assessments (patient_id, data, risk, submitted_by) VALUES ($1, $2, $3, $4)
     RETURNING id, risk, created_at`,
    [id, JSON.stringify(data), risk, req.user.id]
  );
  const patient = await one(
    'UPDATE patients SET latest_risk = $1, latest_assessment_at = $2 WHERE id = $3 RETURNING name',
    [risk, row.created_at, id]
  );
  audit(req.user.id, 'assessment_create', id, risk);
  notifyPatient(id, 'assessment:new', {
    patientId: id,
    patientName: patient.name,
    risk,
    assessmentId: row.id,
    createdAt: row.created_at,
    submittedBy: { id: req.user.id, name: req.user.name, role: req.user.role },
  });
  res.json({ id: row.id, risk, createdAt: row.created_at });
}));

// ---------- Care team assignments (admin) ----------

router.post('/patients/:id/assignments', requireAuth, requireRole('admin'), h(async (req, res) => {
  const patientId = Number(req.params.id);
  const staffId = Number(req.body.staffId);
  const staff = await one('SELECT id, role FROM users WHERE id = $1 AND active', [staffId]);
  if (!staff || !STAFF_ROLES.includes(staff.role)) return res.status(400).json({ error: 'Pick a staff member' });
  await query(
    'INSERT INTO assignments (patient_id, staff_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [patientId, staffId]
  );
  audit(req.user.id, 'assign', patientId, `staff ${staffId}`);
  notifyPatient(patientId, 'patients:changed', {});
  res.json({ ok: true });
}));

router.delete('/patients/:id/assignments/:staffId', requireAuth, requireRole('admin'), h(async (req, res) => {
  const patientId = Number(req.params.id);
  const staffId = Number(req.params.staffId);
  await query('DELETE FROM assignments WHERE patient_id = $1 AND staff_id = $2', [patientId, staffId]);
  audit(req.user.id, 'unassign', patientId, `staff ${staffId}`);
  notifyPatient(patientId, 'patients:changed', {});
  notifyUser(staffId, 'patients:changed', {});
  res.json({ ok: true });
}));

// ---------- Users (admin) ----------

router.get('/users', requireAuth, requireRole('admin'), h(async (req, res) => {
  const users = await query('SELECT id, email, name, role, active, created_at FROM users ORDER BY role, name');
  res.json({ users });
}));

router.post('/users', requireAuth, requireRole('admin'), h(async (req, res) => {
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const role = req.body.role;
  const password = String(req.body.password || '');
  if (!name || !validEmail(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  if (!['admin', ...STAFF_ROLES].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
  if (await one('SELECT 1 FROM users WHERE email = $1', [email])) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const user = await one(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [email, await hashPassword(password), name, role]
  );
  audit(req.user.id, 'user_create', null, `${role} ${user.id}`);
  res.json({ id: user.id });
}));

router.patch('/users/:id', requireAuth, requireRole('admin'), h(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't change your own account here" });
  const { active, role, password } = req.body;
  if (typeof active === 'boolean') await query('UPDATE users SET active = $1 WHERE id = $2', [active, id]);
  if (role !== undefined) {
    const target = await one('SELECT role FROM users WHERE id = $1', [id]);
    if (!ALL_ROLES.includes(role) || role === 'patient' || target?.role === 'patient') {
      return res.status(400).json({ error: 'Invalid role change' });
    }
    await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  }
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), id]);
  }
  audit(req.user.id, 'user_update', null, `user ${id}`);
  res.json({ ok: true });
}));

router.get('/staff', requireAuth, requireRole('admin'), h(async (req, res) => {
  const staff = await query(
    `SELECT id, name, role FROM users WHERE active AND role = ANY($1::text[]) ORDER BY name`,
    [STAFF_ROLES]
  );
  res.json({ staff });
}));

router.get('/risk-levels', (req, res) => res.json({ levels: RISK_LEVELS }));

export default router;
