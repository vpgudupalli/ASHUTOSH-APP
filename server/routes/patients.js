import express from 'express';
import { query, one, audit } from '../db.js';
import { hashPassword, passwordProblem, requireAuth, requireStaff, isStaff, canAccessPatient } from '../auth.js';
import { notifyPatient, notifyCareTeam } from '../realtime.js';
import { h, clean, validEmail, validDate, ipOf } from '../util.js';
import { scoreAssessment, TIER_INFO, TIERS } from '../../shared/risk.js';

const router = express.Router();
router.use(requireAuth);

const pid = (req) => Number(req.params.id);

// Every patient route checks access first (minimum necessary).
const access = h(async (req, res, next) => {
  if (!(await canAccessPatient(req.user, pid(req)))) return res.status(404).json({ error: 'Patient not found' });
  next();
});

export const FOLLOW_UP_METHODS = ['Phone call', 'Text message', 'App message', 'Video visit', 'In person', 'Home visit', 'Email'];
export const FOLLOW_UP_OUTCOMES = [
  'Spoke with patient', 'Left voicemail', 'No answer', 'Sent message – awaiting reply', 'Wrong / disconnected number',
  'Patient declined', 'Appointment scheduled', 'Referred (specialist / BH / social services)',
  'Directed to urgent care / ED', 'Issue resolved – loop closed',
];

// ---------- list ----------

const PATIENT_SQL = `
  SELECT p.id, p.name, to_char(p.dob, 'YYYY-MM-DD') AS dob, p.mrn, p.phone, p.case_status,
         p.latest_risk, p.latest_score, p.latest_assessment_id, p.latest_assessment_at,
         p.last_reviewed_at, rv.name AS last_reviewed_by_name, p.created_at,
         u.email AS login_email,
         COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'role', s.role) ORDER BY s.name)
                     FROM assignments a JOIN users s ON s.id = a.staff_id WHERE a.patient_id = p.id), '[]'::json) AS staff,
         (SELECT count(*)::int FROM messages m
           WHERE m.patient_id = p.id AND m.sender_id IS DISTINCT FROM $1
             AND m.created_at > COALESCE((SELECT last_read_at FROM message_reads r WHERE r.patient_id = p.id AND r.user_id = $1), 'epoch')) AS unread,
         (SELECT max(f.created_at) FROM follow_ups f WHERE f.patient_id = p.id) AS last_contact_at,
         (SELECT min(f.created_at) FROM follow_ups f WHERE f.patient_id = p.id AND f.created_at >= p.latest_assessment_at) AS first_contact_after_latest,
         (SELECT count(*)::int FROM follow_ups f WHERE f.patient_id = p.id AND f.assessment_id = p.latest_assessment_id) AS attempts_on_latest,
         (SELECT f.next_follow_up_date FROM follow_ups f WHERE f.patient_id = p.id ORDER BY f.created_at DESC LIMIT 1) AS next_follow_up_date
    FROM patients p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users rv ON rv.id = p.last_reviewed_by`;

// Adds computed workflow flags: needs review, overdue for outreach, follow-up due.
function withStatus(p) {
  const needsReview = !!p.latest_assessment_at && (!p.last_reviewed_at || new Date(p.last_reviewed_at) < new Date(p.latest_assessment_at));
  const sla = p.latest_risk ? TIER_INFO[p.latest_risk]?.slaHours : null;
  const dueAt = sla && p.latest_assessment_at ? new Date(new Date(p.latest_assessment_at).getTime() + sla * 3600 * 1000) : null;
  const contacted = !!p.first_contact_after_latest;
  const overdue = p.case_status !== 'closed' && !!dueAt && !contacted && dueAt < new Date();
  const followUpDue = p.case_status !== 'closed' && !!p.next_follow_up_date && new Date(p.next_follow_up_date) <= new Date();
  return { ...p, needsReview, contactDueAt: dueAt, contacted, overdue, followUpDue };
}

async function scopedPatients(user, extraWhere = '', params = []) {
  const base = [user.id, ...params];
  if (user.role === 'admin') return query(`${PATIENT_SQL} ${extraWhere ? `WHERE ${extraWhere}` : ''}`, base);
  if (user.role === 'patient') return query(`${PATIENT_SQL} WHERE p.user_id = $1 ${extraWhere ? `AND ${extraWhere}` : ''}`, base);
  return query(
    `${PATIENT_SQL} WHERE p.id IN (SELECT patient_id FROM assignments WHERE staff_id = $1) ${extraWhere ? `AND ${extraWhere}` : ''}`,
    base
  );
}

router.get('/patients', h(async (req, res) => {
  const order = (p) => [p.overdue ? 0 : 1, -TIERS.indexOf(p.latest_risk), p.needsReview ? 0 : 1, -(p.unread || 0)];
  const rows = (await scopedPatients(req.user)).map(withStatus).sort((a, b) => {
    const x = order(a), y = order(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return a.name.localeCompare(b.name);
  });
  res.json({ patients: rows });
}));

router.post('/patients', requireStaff, h(async (req, res) => {
  const name = clean(req.body.name);
  if (!name) return res.status(400).json({ error: 'Patient name is required' });
  const email = clean(req.body.email).toLowerCase();
  let userId = null;
  if (email) {
    if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
    const problem = passwordProblem(req.body.password);
    if (problem) return res.status(400).json({ error: `Temporary password: ${problem.toLowerCase()}` });
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) return res.status(409).json({ error: 'An account with that email already exists' });
    userId = (await one(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'patient') RETURNING id`,
      [email, await hashPassword(req.body.password), name]
    )).id;
  }
  const patient = await one(
    'INSERT INTO patients (user_id, name, dob, mrn, phone, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [userId, name, validDate(req.body.dob), clean(req.body.mrn, 50) || null, clean(req.body.phone, 30) || null, req.user.id]
  );
  if (isStaff(req.user)) await query('INSERT INTO assignments (patient_id, staff_id) VALUES ($1, $2)', [patient.id, req.user.id]);
  audit(req.user.id, 'patient_create', patient.id, null, ipOf(req));
  notifyCareTeam(patient.id, 'patients:changed', {});
  res.json({ id: patient.id });
}));

// ---------- one patient ----------

router.get('/patients/:id', access, h(async (req, res) => {
  const id = pid(req);
  const [patient] = (await scopedPatients(req.user, 'p.id = $2', [id])).map(withStatus);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const assessments = await query(
    `SELECT a.id, a.data, a.risk, a.score, a.result, a.patient_note, a.created_at, a.reviewed_at,
            u.name AS submitted_by_name, u.role AS submitted_by_role, r.name AS reviewed_by_name
       FROM assessments a LEFT JOIN users u ON u.id = a.submitted_by LEFT JOIN users r ON r.id = a.reviewed_by
      WHERE a.patient_id = $1 ORDER BY a.created_at DESC LIMIT 100`,
    [id]
  );
  const out = { patient, assessments };
  if (req.user.role !== 'patient') {
    out.followUps = await query(
      `SELECT f.*, to_char(f.next_follow_up_date, 'YYYY-MM-DD') AS next_follow_up_date, u.name AS author_name, u.role AS author_role
         FROM follow_ups f LEFT JOIN users u ON u.id = f.author_id WHERE f.patient_id = $1 ORDER BY f.created_at DESC`,
      [id]
    );
    out.notes = await query(
      `SELECT n.id, n.body, n.created_at, u.name AS author_name, u.role AS author_role
         FROM clinical_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.patient_id = $1 ORDER BY n.created_at DESC`,
      [id]
    );
    out.options = { methods: FOLLOW_UP_METHODS, outcomes: FOLLOW_UP_OUTCOMES };
    audit(req.user.id, 'patient_view', id, null, ipOf(req));
  }
  res.json(out);
}));

router.patch('/patients/:id', requireStaff, access, h(async (req, res) => {
  const id = pid(req);
  const b = req.body;
  const sets = [];
  const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.name !== undefined && clean(b.name)) add('name', clean(b.name));
  if (b.dob !== undefined) add('dob', validDate(b.dob));
  if (b.mrn !== undefined) add('mrn', clean(b.mrn, 50) || null);
  if (b.phone !== undefined) add('phone', clean(b.phone, 30) || null);
  if (b.caseStatus !== undefined) {
    if (!['open', 'active', 'closed'].includes(b.caseStatus)) return res.status(400).json({ error: 'Invalid status' });
    add('case_status', b.caseStatus);
  }
  if (!sets.length) return res.json({ ok: true });
  vals.push(id);
  await query(`UPDATE patients SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  audit(req.user.id, 'patient_update', id, Object.keys(b).join(','), ipOf(req));
  notifyCareTeam(id, 'patients:changed', { patientId: id });
  res.json({ ok: true });
}));

// ---------- assessments ----------

router.post('/patients/:id/assessments', access, h(async (req, res) => {
  const id = pid(req);
  const data = req.body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Assessment data is required' });
  // Risk is always computed on the server so it can't be altered by the browser.
  const result = scoreAssessment(data);
  const note = clean(data.patientNote, 4000) || null;
  const row = await one(
    `INSERT INTO assessments (patient_id, data, risk, score, result, patient_note, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
    [id, JSON.stringify(data), result.tier, result.score, JSON.stringify(result), note, req.user.id]
  );
  const patient = await one(
    `UPDATE patients SET latest_risk = $1, latest_score = $2, latest_assessment_id = $3, latest_assessment_at = $4,
            case_status = CASE WHEN case_status = 'closed' THEN 'open' ELSE case_status END,
            phone = COALESCE(NULLIF($5, ''), phone), dob = COALESCE($6, dob)
      WHERE id = $7 RETURNING name`,
    [result.tier, result.score, row.id, row.created_at, clean(data.phone, 30), validDate(data.dob), id]
  );
  // The patient's personal note also starts/continues the message thread with the care team.
  if (note) {
    await query('INSERT INTO messages (patient_id, sender_id, body) VALUES ($1, $2, $3)',
      [id, req.user.id, `Note with my check-in:\n${note}${data.wantsCallback ? '\n\n(I would like a call back.)' : ''}`]);
  }
  audit(req.user.id, 'assessment_create', id, `${result.tier} ${result.score}`, ipOf(req));
  const event = {
    patientId: id, patientName: patient.name, risk: result.tier, score: result.score, emergency: result.emergency,
    assessmentId: row.id, createdAt: row.created_at,
    submittedBy: { id: req.user.id, name: req.user.name, role: req.user.role },
  };
  notifyPatient(id, 'assessment:new', event);
  if (note) notifyPatient(id, 'message:new', { patientId: id, patientName: patient.name, sender: event.submittedBy });
  res.json({ id: row.id, risk: result.tier, score: result.score, result, createdAt: row.created_at });
}));

// Reviewer acknowledges they have looked at the latest assessment.
router.post('/patients/:id/review', requireStaff, access, h(async (req, res) => {
  const id = pid(req);
  const p = await one('SELECT latest_assessment_id FROM patients WHERE id = $1', [id]);
  if (p?.latest_assessment_id) {
    await query('UPDATE assessments SET reviewed_at = now(), reviewed_by = $1 WHERE id = $2', [req.user.id, p.latest_assessment_id]);
  }
  await query(
    `UPDATE patients SET last_reviewed_at = now(), last_reviewed_by = $1,
            case_status = CASE WHEN case_status = 'open' THEN 'active' ELSE case_status END WHERE id = $2`,
    [req.user.id, id]
  );
  audit(req.user.id, 'assessment_review', id, null, ipOf(req));
  notifyCareTeam(id, 'patients:changed', { patientId: id });
  res.json({ ok: true });
}));

// ---------- messages (patient <-> care team) ----------

router.get('/patients/:id/messages', access, h(async (req, res) => {
  const id = pid(req);
  const messages = await query(
    `SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender_name, u.role AS sender_role
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.patient_id = $1 ORDER BY m.created_at`,
    [id]
  );
  await query(
    `INSERT INTO message_reads (patient_id, user_id, last_read_at) VALUES ($1, $2, now())
     ON CONFLICT (patient_id, user_id) DO UPDATE SET last_read_at = now()`,
    [id, req.user.id]
  );
  if (req.user.role !== 'patient') audit(req.user.id, 'messages_view', id, null, ipOf(req));
  res.json({ messages });
}));

router.post('/patients/:id/messages', access, h(async (req, res) => {
  const id = pid(req);
  const body = clean(req.body.body, 4000);
  if (!body) return res.status(400).json({ error: 'Message is empty' });
  const m = await one('INSERT INTO messages (patient_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, created_at', [id, req.user.id, body]);
  await query(
    `INSERT INTO message_reads (patient_id, user_id, last_read_at) VALUES ($1, $2, now())
     ON CONFLICT (patient_id, user_id) DO UPDATE SET last_read_at = now()`,
    [id, req.user.id]
  );
  const p = await one('SELECT name FROM patients WHERE id = $1', [id]);
  audit(req.user.id, 'message_send', id, null, ipOf(req));
  notifyPatient(id, 'message:new', {
    patientId: id, patientName: p.name, messageId: m.id, sender: { id: req.user.id, name: req.user.name, role: req.user.role },
  });
  res.json({ id: m.id, createdAt: m.created_at });
}));

// ---------- staff-only: internal notes and follow-ups ----------

router.post('/patients/:id/notes', requireStaff, access, h(async (req, res) => {
  const id = pid(req);
  const body = clean(req.body.body, 8000);
  if (!body) return res.status(400).json({ error: 'Note is empty' });
  await query('INSERT INTO clinical_notes (patient_id, author_id, body) VALUES ($1, $2, $3)', [id, req.user.id, body]);
  audit(req.user.id, 'note_create', id, null, ipOf(req));
  notifyCareTeam(id, 'patients:changed', { patientId: id });
  res.json({ ok: true });
}));

router.post('/patients/:id/follow-ups', requireStaff, access, h(async (req, res) => {
  const id = pid(req);
  const b = req.body;
  if (!FOLLOW_UP_METHODS.includes(b.method)) return res.status(400).json({ error: 'Choose how you contacted the patient' });
  if (!FOLLOW_UP_OUTCOMES.includes(b.outcome)) return res.status(400).json({ error: 'Choose the outcome' });
  const p = await one('SELECT latest_assessment_id FROM patients WHERE id = $1', [id]);
  const attempt = (await one(
    'SELECT count(*)::int AS n FROM follow_ups WHERE patient_id = $1 AND assessment_id IS NOT DISTINCT FROM $2',
    [id, p.latest_assessment_id]
  )).n + 1;
  await query(
    `INSERT INTO follow_ups (patient_id, assessment_id, attempt_no, method, reached, outcome, action_taken, notes, next_step, next_follow_up_date, ed_avoided, author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, p.latest_assessment_id, attempt, b.method, !!b.reached, b.outcome, clean(b.actionTaken, 4000) || null,
      clean(b.notes, 8000) || null, clean(b.nextStep, 1000) || null, validDate(b.nextFollowUpDate), !!b.edAvoided, req.user.id]
  );
  const closing = b.closeCase || b.outcome === 'Issue resolved – loop closed';
  await query(`UPDATE patients SET case_status = $1 WHERE id = $2`, [closing ? 'closed' : 'active', id]);
  audit(req.user.id, 'follow_up_create', id, `#${attempt} ${b.outcome}`, ipOf(req));
  notifyCareTeam(id, 'patients:changed', { patientId: id });
  res.json({ ok: true, attempt });
}));

router.post('/patients/:id/print-log', access, h(async (req, res) => {
  audit(req.user.id, 'report_print', pid(req), clean(req.body.detail, 200) || null, ipOf(req));
  res.json({ ok: true });
}));

// ---------- program outcomes ----------

router.get('/metrics', requireStaff, h(async (req, res) => {
  const patients = (await scopedPatients(req.user)).map(withStatus);
  const ids = patients.map((p) => p.id);
  if (!ids.length) return res.json({ empty: true });
  const assessments = await query(
    `SELECT patient_id, risk, created_at, (data->>'edVisits30d') AS ed30, (data->>'hospitalizations90d') AS hosp90
       FROM assessments WHERE patient_id = ANY($1::int[]) ORDER BY created_at`,
    [ids]
  );
  const followUps = await query(
    'SELECT patient_id, assessment_id, reached, outcome, ed_avoided, created_at FROM follow_ups WHERE patient_id = ANY($1::int[]) ORDER BY created_at',
    [ids]
  );
  const since = Date.now() - 90 * 86400 * 1000;

  // Time from each High/Critical assessment (last 90 days) to first outreach attempt.
  const highAssess = await query(
    `SELECT id, patient_id, risk, created_at FROM assessments
      WHERE patient_id = ANY($1::int[]) AND risk IN ('High','Critical') AND created_at > now() - interval '90 days'`,
    [ids]
  );
  let withinSla = 0;
  const hours = [];
  for (const a of highAssess) {
    const first = followUps.find((f) => f.patient_id === a.patient_id && new Date(f.created_at) >= new Date(a.created_at));
    if (!first) continue;
    const hrs = (new Date(first.created_at) - new Date(a.created_at)) / 3600000;
    hours.push(hrs);
    if (hrs <= TIER_INFO[a.risk].slaHours) withinSla++;
  }
  hours.sort((a, b) => a - b);

  // Self-reported ED visits: each patient's first check-in vs. their most recent.
  let baselineEd = 0, latestEd = 0, edCompared = 0;
  const byPatient = {};
  for (const a of assessments) (byPatient[a.patient_id] ||= []).push(a);
  for (const list of Object.values(byPatient)) {
    if (list.length < 2) continue;
    const first = Number(list[0].ed30), last = Number(list[list.length - 1].ed30);
    if (!Number.isFinite(first) || !Number.isFinite(last) || list[0].ed30 === '' || list[list.length - 1].ed30 === '') continue;
    baselineEd += first; latestEd += last; edCompared++;
  }

  const recentFollowUps = followUps.filter((f) => new Date(f.created_at) > since);
  res.json({
    patients: patients.length,
    byTier: Object.fromEntries(TIERS.map((t) => [t, patients.filter((p) => p.latest_risk === t).length])),
    noAssessment: patients.filter((p) => !p.latest_risk).length,
    needsReview: patients.filter((p) => p.needsReview).length,
    overdue: patients.filter((p) => p.overdue).length,
    followUpDue: patients.filter((p) => p.followUpDue).length,
    unreadMessages: patients.reduce((a, p) => a + (p.unread || 0), 0),
    openCases: patients.filter((p) => p.case_status !== 'closed').length,
    closedCases: patients.filter((p) => p.case_status === 'closed').length,
    checkIns30d: assessments.filter((a) => new Date(a.created_at) > Date.now() - 30 * 86400 * 1000).length,
    highRiskAssessments90d: highAssess.length,
    highRiskContactedWithinSla: withinSla,
    medianHoursToContact: hours.length ? Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 : null,
    followUps90d: recentFollowUps.length,
    reachRate: recentFollowUps.length ? Math.round((recentFollowUps.filter((f) => f.reached).length / recentFollowUps.length) * 100) : null,
    edAvoided90d: recentFollowUps.filter((f) => f.ed_avoided).length,
    edTrend: edCompared ? { patients: edCompared, baseline: baselineEd, latest: latestEd } : null,
  });
}));

export default router;
