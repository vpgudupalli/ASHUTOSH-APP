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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      dob DATE,
      latest_risk TEXT,
      latest_assessment_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS assignments (
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (patient_id, staff_id)
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      risk TEXT NOT NULL,
      submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS assessments_patient_idx ON assessments (patient_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      patient_id INTEGER,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export function audit(userId, action, patientId = null, detail = null) {
  return query(
    'INSERT INTO audit_log (user_id, action, patient_id, detail) VALUES ($1, $2, $3, $4)',
    [userId, action, patientId, detail]
  ).catch((err) => console.error('[audit] failed', err));
}
