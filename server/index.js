import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { migrate, one, query } from './db.js';
import { hashPassword } from './auth.js';
import { initRealtime } from './realtime.js';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DIST = path.join(__dirname, '..', 'client', 'dist');

await migrate();

// Create the first admin from env vars if no admin exists yet.
if (!(await one(`SELECT 1 FROM users WHERE role = 'admin'`))) {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && password.length >= 8) {
    await query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash`,
      [email, await hashPassword(password), process.env.ADMIN_NAME || 'Administrator']
    );
    console.log(`[setup] created admin account ${email}`);
  } else {
    console.warn('[setup] no admin account yet: set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars) and restart');
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', routes);
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
