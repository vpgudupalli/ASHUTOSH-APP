// Database access. Uses real Postgres when DATABASE_URL is set (production),
// otherwise an embedded Postgres (PGlite) stored in ./.data for local development.
import fs from 'node:fs';
import pg from 'pg';

let impl;

if (process.env.DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  impl = {
    query: async (text, params) => (await pool.query(text, params)).rows,
    exec: (text) => pool.query(text),
  };
  console.log('[db] using Postgres from DATABASE_URL');
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || './.data/pglite';
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  impl = {
    query: async (text, params) => (await db.query(text, params)).rows,
    exec: (text) => db.exec(text),
  };
  console.log(`[db] DATABASE_URL not set, using embedded Postgres at ${dir}`);
}

export const query = (text, params = []) => impl.query(text, params);
export const one = async (text, params = []) => (await impl.query(text, params))[0] || null;

export const STAFF_ROLES = ['provider', 'np', 'case_manager'];
export const ALL_ROLES = ['admin', ...STAFF_ROLES, 'patient'];

export async function migrate() {
  await impl.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','provider','np','case_manager','patient')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      mfa_secret TEXT,
      mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      failed_logins INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      dob DATE,
      mrn TEXT,
      phone TEXT,
      latest_risk TEXT,
      latest_score INTEGER,
      latest_assessment_id INTEGER,
      latest_assessment_at TIMESTAMPTZ,
      last_reviewed_at TIMESTAMPTZ,
      last_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      case_status TEXT NOT NULL DEFAULT 'open' CHECK (case_status IN ('open','active','closed')),
      privacy_ack_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS assignments (
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (patient_id, staff_id)
    );

    -- Assessments are append-only: each save is a new row (integrity / history).
    CREATE TABLE IF NOT EXISTS assessments (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      risk TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      result JSONB,
      patient_note TEXT,
      submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS assessments_patient_idx ON assessments (patient_id, created_at DESC);

    -- Secure messages between the patient and their care team.
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS messages_patient_idx ON messages (patient_id, created_at);

    CREATE TABLE IF NOT EXISTS message_reads (
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (patient_id, user_id)
    );

    -- Internal clinical notes: staff only, never shown to the patient.
    CREATE TABLE IF NOT EXISTS clinical_notes (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Outreach / follow-up attempts (1st, 2nd, 3rd ...) and their outcomes.
    CREATE TABLE IF NOT EXISTS follow_ups (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      assessment_id INTEGER REFERENCES assessments(id) ON DELETE SET NULL,
      attempt_no INTEGER NOT NULL,
      method TEXT NOT NULL,
      reached BOOLEAN NOT NULL DEFAULT FALSE,
      outcome TEXT NOT NULL,
      action_taken TEXT,
      notes TEXT,
      next_step TEXT,
      next_follow_up_date DATE,
      ed_avoided BOOLEAN NOT NULL DEFAULT FALSE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS follow_ups_patient_idx ON follow_ups (patient_id, created_at);

    -- Keys for EMR systems calling the FHIR API.
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      patient_id INTEGER,
      detail TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

    -- Patients can only create an account with a one-time invite code from their care team.
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS invite_hash TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;

    -- Demo / contact requests from the public website.
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      organization TEXT,
      role TEXT,
      topic TEXT,
      message TEXT,
      source_page TEXT,
      handled_at TIMESTAMPTZ,
      handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// HIPAA audit trail: who did what to which patient, when, from where.
export function audit(userId, action, patientId = null, detail = null, ip = null) {
  return query(
    'INSERT INTO audit_log (user_id, action, patient_id, detail, ip) VALUES ($1, $2, $3, $4, $5)',
    [userId, action, patientId, detail, ip]
  ).catch((err) => console.error('[audit] failed', err.message));
}
