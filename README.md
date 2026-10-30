# Ashutosh Services – Risk Navigator

Multi-user patient risk stratification. Patients enter their own data; their assigned
providers, nurse practitioners and case managers see every update live.

## Roles

| Role | Can do |
|---|---|
| **Patient** | Self sign-up, fill in / update their own assessment, see their history |
| **Provider / NP / Case Manager** | See and update patients assigned to them, add patients, get live alerts |
| **Admin** | Everything: create staff accounts, assign care teams, see all patients |

The first admin is created from the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables.

## How it works

- `server/` – Node + Express API, Socket.IO for live updates, Postgres for storage.
- `client/` – React (Vite + Tailwind) front end. Forms ported from the Trickle project.
- `shared/risk.js` – the risk rules. Used by both the browser (instant preview) and the
  server (authoritative score saved with each assessment). Edit rules here.
- Every saved assessment is kept as history; views and changes are written to `audit_log`.

## Run locally

```bash
npm install
npm run local        # builds the UI and serves everything on http://localhost:3000
```

Without `DATABASE_URL` it uses an embedded Postgres in `.data/`. Local admin login comes from `.env`.

For live-reload while editing UI: run `npm run dev:server` and `npm run dev:client` in two
terminals, then open http://localhost:5173.

## Deploy (Render)

1. Push this folder to a GitHub repository.
2. In Render: **New → Blueprint**, pick the repo. It reads `render.yaml` and creates the web
   service + Postgres database.
3. Enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` when prompted, then deploy.

Set `ALLOW_PATIENT_SIGNUP=false` to turn off public patient sign-up.

## Before real patient data

This is not yet HIPAA-ready. Before storing real PHI: host on a plan covered by a signed
BAA (e.g. Render HIPAA workspace, AWS, Azure, GCP), use paid (non-expiring, backed-up)
database plans, add MFA/password reset, and review access + audit requirements.
