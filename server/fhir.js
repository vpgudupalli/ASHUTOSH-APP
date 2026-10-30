// Read-only HL7 FHIR R4 API so any EMR (Epic, Cerner/Oracle, athena, eClinicalWorks,
// etc.) or integration engine can pull patient-reported data, risk scores and
// care-team communications. Authenticated with admin-issued API keys (Bearer).
import express from 'express';
import { query, one, audit } from './db.js';
import { sha256 } from './crypto.js';
import { h } from './util.js';
import { CONDITIONS, bmi, heightInches } from '../shared/risk.js';

const router = express.Router();
const FHIR_JSON = 'application/fhir+json';

const outcome = (res, status, text) => res.status(status).type(FHIR_JSON).json({
  resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: status === 401 ? 'login' : 'not-found', diagnostics: text }],
});

router.get('/metadata', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}/fhir`;
  res.type(FHIR_JSON).json({
    resourceType: 'CapabilityStatement', status: 'active', date: new Date().toISOString(), kind: 'instance',
    fhirVersion: '4.0.1', format: ['json'],
    software: { name: 'Ashutosh Services Risk Navigator' },
    implementation: { description: 'Patient-reported outcomes, risk stratification and care-team outreach', url: base },
    rest: [{
      mode: 'server',
      security: { description: 'Send "Authorization: Bearer <API key>". Keys are issued by an administrator.' },
      resource: ['Patient', 'Observation', 'Condition', 'RiskAssessment', 'Communication'].map((type) => ({
        type, interaction: [{ code: 'read' }, { code: 'search-type' }],
        searchParam: type === 'Patient' ? [{ name: 'identifier', type: 'token' }] : [{ name: 'patient', type: 'reference' }],
      })),
      operation: [{ name: 'everything', definition: 'http://hl7.org/fhir/OperationDefinition/Patient-everything' }],
    }],
  });
});

router.use(h(async (req, res, next) => {
  const key = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const row = key && (await one('SELECT id, name FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL', [sha256(key)]));
  if (!row) return outcome(res, 401, 'Valid API key required');
  await query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [row.id]);
  req.apiKey = row;
  next();
}));

const logAccess = (req, patientId, what) => audit(null, 'fhir_read', patientId, `${req.apiKey.name}: ${what}`, req.ip);

// ---------- mappers ----------

function patientResource(p) {
  const [family, ...given] = p.name.trim().split(/\s+/).reverse();
  return {
    resourceType: 'Patient', id: String(p.id),
    identifier: [
      { system: 'urn:risk-navigator:patient-id', value: String(p.id) },
      ...(p.mrn ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] }, value: p.mrn }] : []),
    ],
    name: [{ text: p.name, family, given: given.reverse() }],
    ...(p.dob ? { birthDate: p.dob } : {}),
    ...(p.sex ? { gender: { Female: 'female', Male: 'male' }[p.sex] || 'other' } : {}),
    telecom: [...(p.phone ? [{ system: 'phone', value: p.phone }] : []), ...(p.email ? [{ system: 'email', value: p.email }] : [])],
  };
}

const VITALS = [
  { field: 'heartRate', loinc: '8867-4', display: 'Heart rate', unit: '/min', ucum: '/min' },
  { field: 'spo2', loinc: '59408-5', display: 'Oxygen saturation by pulse oximetry', unit: '%', ucum: '%' },
  { field: 'tempF', loinc: '8310-5', display: 'Body temperature', unit: '°F', ucum: '[degF]' },
  { field: 'weightLb', loinc: '29463-7', display: 'Body weight', unit: 'lb', ucum: '[lb_av]' },
  { field: 'glucose', loinc: '2339-0', display: 'Glucose', unit: 'mg/dL', ucum: 'mg/dL', category: 'laboratory' },
  { field: 'hbA1c', loinc: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood', unit: '%', ucum: '%', category: 'laboratory' },
];
const SURVEY_SCORES = [
  { key: 'phq9', loinc: '44261-6', display: 'PHQ-9 total score' },
  { key: 'phq2', loinc: '55758-7', display: 'PHQ-2 total score' },
  { key: 'gad7', loinc: '70274-6', display: 'GAD-7 total score' },
  { key: 'auditC', loinc: '75626-2', display: 'AUDIT-C total score' },
];

function observations(a) {
  const d = a.data;
  const subject = { reference: `Patient/${a.patient_id}` };
  const effectiveDateTime = new Date(a.created_at).toISOString();
  const cat = (c) => [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: c }] }];
  const base = (suffix, loinc, display, category) => ({
    resourceType: 'Observation', id: `${a.id}-${suffix}`, status: 'final', category: cat(category),
    code: { coding: [{ system: 'http://loinc.org', code: loinc, display }], text: display },
    subject, effectiveDateTime, meta: { tag: [{ code: 'patient-reported' }] },
  });
  const out = [];
  const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  if (n(d.bpSystolic) !== null && n(d.bpDiastolic) !== null) {
    out.push({
      ...base('bp', '85354-9', 'Blood pressure panel', 'vital-signs'),
      component: [
        { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] }, valueQuantity: { value: n(d.bpSystolic), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
        { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] }, valueQuantity: { value: n(d.bpDiastolic), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
      ],
    });
  }
  for (const v of VITALS) {
    if (n(d[v.field]) === null) continue;
    out.push({ ...base(v.field, v.loinc, v.display, v.category || 'vital-signs'), valueQuantity: { value: n(d[v.field]), unit: v.unit, system: 'http://unitsofmeasure.org', code: v.ucum } });
  }
  const h = heightInches(d);
  if (h) out.push({ ...base('height', '8302-2', 'Body height', 'vital-signs'), valueQuantity: { value: h, unit: 'in', system: 'http://unitsofmeasure.org', code: '[in_i]' } });
  const b = bmi(d);
  if (b) out.push({ ...base('bmi', '39156-5', 'Body mass index (BMI)', 'vital-signs'), valueQuantity: { value: b, unit: 'kg/m2', system: 'http://unitsofmeasure.org', code: 'kg/m2' } });
  const derived = a.result?.derived || {};
  for (const s of SURVEY_SCORES) {
    if (derived[s.key] === null || derived[s.key] === undefined) continue;
    out.push({ ...base(s.key, s.loinc, s.display, 'survey'), valueInteger: derived[s.key] });
  }
  return out;
}

function conditions(a) {
  const sel = Array.isArray(a.data.conditions) ? a.data.conditions : [];
  return CONDITIONS.filter((c) => sel.includes(c.key)).map((c) => ({
    resourceType: 'Condition', id: `${a.id}-${c.key}`,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'unconfirmed' }] },
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' }] }],
    code: {
      coding: [
        { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: c.icd10 },
        { system: 'http://snomed.info/sct', code: c.snomed },
      ],
      text: c.label,
    },
    subject: { reference: `Patient/${a.patient_id}` },
    recordedDate: new Date(a.created_at).toISOString(),
    note: [{ text: 'Patient-reported via Risk Navigator' }],
  }));
}

function riskAssessment(a) {
  const r = a.result || {};
  return {
    resourceType: 'RiskAssessment', id: String(a.id), status: 'final',
    subject: { reference: `Patient/${a.patient_id}` },
    occurrenceDateTime: new Date(a.created_at).toISOString(),
    method: { text: 'Risk Navigator composite (PHQ-9, GAD-7, AUDIT-C, PEG, ACC/AHA BP, ADA HbA1c, Charlson-adapted comorbidity, LACE-adapted utilization, Katz ADL, STEADI, AHC-HRSN)' },
    prediction: [{ outcome: { text: 'Need for care-management intervention' }, qualitativeRisk: { text: a.risk }, rationale: `Score ${a.score}/${r.maxScore ?? ''}` }],
    basis: [{ reference: `Patient/${a.patient_id}` }],
    mitigation: (r.recommendations || []).join('; '),
    note: (r.floors || []).map((f) => ({ text: `Escalation: ${f.reason} → minimum ${f.tier}` })),
  };
}

function communication(m) {
  return {
    resourceType: 'Communication', id: String(m.id), status: 'completed',
    subject: { reference: `Patient/${m.patient_id}` },
    sent: new Date(m.created_at).toISOString(),
    sender: { display: `${m.sender_name || 'Unknown'} (${m.sender_role || ''})` },
    payload: [{ contentString: m.body }],
  };
}

const bundle = (resources) => ({
  resourceType: 'Bundle', type: 'searchset', total: resources.length, timestamp: new Date().toISOString(),
  entry: resources.map((resource) => ({ fullUrl: `${resource.resourceType}/${resource.id}`, resource })),
});

// ---------- data access ----------

const PATIENT_SQL = `SELECT p.id, p.name, to_char(p.dob, 'YYYY-MM-DD') AS dob, p.mrn, p.phone, u.email,
                            (SELECT a.data->>'sex' FROM assessments a WHERE a.patient_id = p.id ORDER BY a.created_at DESC LIMIT 1) AS sex
                       FROM patients p LEFT JOIN users u ON u.id = p.user_id`;
const assessmentsFor = (id, latestOnly) => query(
  `SELECT * FROM assessments WHERE patient_id = $1 ORDER BY created_at DESC ${latestOnly ? 'LIMIT 1' : 'LIMIT 50'}`, [id]
);
const patientParam = (req) => Number(String(req.query.patient || req.query.subject || '').replace(/^Patient\//, ''));

// ---------- endpoints ----------

router.get('/Patient', h(async (req, res) => {
  let rows;
  if (req.query.identifier) {
    const value = String(req.query.identifier).split('|').pop();
    rows = await query(`${PATIENT_SQL} WHERE p.mrn = $1 OR p.id::text = $1`, [value]);
  } else {
    rows = await query(`${PATIENT_SQL} ORDER BY p.id LIMIT 500`);
  }
  logAccess(req, null, `Patient search (${rows.length})`);
  res.type(FHIR_JSON).json(bundle(rows.map(patientResource)));
}));

router.get('/Patient/:id', h(async (req, res) => {
  const p = await one(`${PATIENT_SQL} WHERE p.id = $1`, [Number(req.params.id)]);
  if (!p) return outcome(res, 404, 'Patient not found');
  logAccess(req, p.id, 'Patient read');
  res.type(FHIR_JSON).json(patientResource(p));
}));

router.get('/Patient/:id/\\$everything', h(async (req, res) => {
  const id = Number(req.params.id);
  const p = await one(`${PATIENT_SQL} WHERE p.id = $1`, [id]);
  if (!p) return outcome(res, 404, 'Patient not found');
  const assessments = await assessmentsFor(id, false);
  const messages = await query(
    `SELECT m.*, u.name AS sender_name, u.role AS sender_role FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.patient_id = $1 ORDER BY m.created_at`, [id]
  );
  logAccess(req, id, 'Patient $everything');
  res.type(FHIR_JSON).json({
    ...bundle([
      patientResource(p),
      ...assessments.map(riskAssessment),
      ...assessments.flatMap(observations),
      ...(assessments[0] ? conditions(assessments[0]) : []),
      ...messages.map(communication),
    ]),
    type: 'collection',
  });
}));

router.get('/Observation', h(async (req, res) => {
  const id = patientParam(req);
  if (!id) return outcome(res, 400, 'patient parameter required');
  logAccess(req, id, 'Observation search');
  res.type(FHIR_JSON).json(bundle((await assessmentsFor(id, false)).flatMap(observations)));
}));

router.get('/Condition', h(async (req, res) => {
  const id = patientParam(req);
  if (!id) return outcome(res, 400, 'patient parameter required');
  const [latest] = await assessmentsFor(id, true);
  logAccess(req, id, 'Condition search');
  res.type(FHIR_JSON).json(bundle(latest ? conditions(latest) : []));
}));

router.get('/RiskAssessment', h(async (req, res) => {
  const id = patientParam(req);
  if (!id) return outcome(res, 400, 'patient parameter required');
  logAccess(req, id, 'RiskAssessment search');
  res.type(FHIR_JSON).json(bundle((await assessmentsFor(id, false)).map(riskAssessment)));
}));

router.get('/Communication', h(async (req, res) => {
  const id = patientParam(req);
  if (!id) return outcome(res, 400, 'patient parameter required');
  const messages = await query(
    `SELECT m.*, u.name AS sender_name, u.role AS sender_role FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.patient_id = $1 ORDER BY m.created_at`, [id]
  );
  logAccess(req, id, 'Communication search');
  res.type(FHIR_JSON).json(bundle(messages.map(communication)));
}));

router.use((req, res) => outcome(res, 404, 'Unsupported FHIR resource or operation'));

export default router;
