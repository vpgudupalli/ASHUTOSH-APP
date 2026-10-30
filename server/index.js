import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { migrate, one, query } from './db.js';
import { hashPassword, passwordProblem } from './auth.js';
import { initRealtime } from './realtime.js';
import authRoutes from './routes/auth.js';
import patientRoutes from './routes/patients.js';
import adminRoutes from './routes/admin.js';
import fhirRoutes from './fhir.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(__dirname, '..', 'client', 'dist');

await migrate();

// Create the first admin from env vars if no admin exists yet.
if (!(await one(`SELECT 1 FROM users WHERE role = 'admin'`))) {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && !passwordProblem(password)) {
    await query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash`,
      [email, await hashPassword(password), process.env.ADMIN_NAME || 'Administrator']
    );
    console.log(`[setup] created admin account ${email}`);
  } else {
    console.warn('[setup] no admin account yet: set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars, letters and numbers) and restart');
  }
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true },
  contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:'] } },
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true }));

// PHI must never be cached by browsers or proxies.
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache'); next(); };
app.use('/fhir', noStore, fhirRoutes);
app.use('/api', noStore);
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', patientRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('API running. Build the client with "npm run build", or use "npm run dev:client".'));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = http.createServer(app);
initRealtime(server);
server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
