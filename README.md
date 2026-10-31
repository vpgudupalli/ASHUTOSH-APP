# Ashutosh Services – Risk Navigator

Patients check in on their health anytime, from any device. Their care team (providers, nurse
practitioners, case managers) sees each check-in live, scored and prioritized, and works it until
the loop is closed. Goal: active follow-up, fewer avoidable ED visits, lower total cost of care.

## Site map

| Path | What |
|---|---|
| `/` `/services` `/about` `/contact` | Ashutosh Services company website (`site/*.html`, plain HTML + `site/styles.css`) |
| `/risk-navigator` | Product landing page |
| `/app/` | The application (sign in, check-ins, care team, admin) |

Contact/demo form submissions appear in the app under **Admin → Website inquiries**.
Highlighted yellow text on the website (e.g. `[phone number]`, team bios) are placeholders to replace.
Patients join only with a one-time **invite code** created by staff on the patient's record.

## What's in it

**Patient side**
- Check-in covering: today's symptoms (emergency warning signs → 911/988 guidance), vitals (BP, HR,
  SpO₂, temp, glucose, HbA1c, height/weight/BMI), chronic conditions, medications and adherence,
  ED visits and hospital stays, daily living (ADLs), falls, disabilities, lifestyle (activity, sleep,
  tobacco, AUDIT-C alcohol, drug use), PHQ-9 depression, GAD-7 anxiety, PEG pain with red flags,
  sexual health (CDC 5 Ps), and social needs (CMS AHC-HRSN).
- Personal note to the care team with each check-in (+ "please call me back").
- Secure two-way messaging, check-in history, printable summary. Works on phones.

**Care team side**
- Worklist with queues: overdue outreach, needs review, unread messages, follow-up due, open cases.
- Reviewer overview: tier, score, what's driving it, safety escalations, recommended and targeted
  actions, care considerations (disability, language, preferred contact), data completeness.
- Follow-up log: 1st / 2nd / 3rd… attempt, method, reached or not, outcome, what was done, next step
  and date, "ED visit avoided", close the loop. Internal clinical notes (never shown to patients).
- Response windows by tier (Critical same day, High 24–48 h, Moderate 7 days, Mild 30 days) with
  overdue flags.
- Program outcomes: % High/Critical contacted within window, median time to outreach, reach rate,
  self-reported ED-visit trend, ED visits avoided, loops closed.
- Print / Save-as-PDF report for uploading to the chart.

**Scoring** – `shared/risk.js` (one file, used by browser and server; server result is authoritative).
Validated instrument cut-offs feed a domain-capped composite: five tiers Low / Mild / Moderate /
High / Critical. Missing answers never add risk; safety findings set a minimum tier. The in-app
**Scoring** page documents every rule and reference. Weights need local calibration before
clinical reliance.

**EMR integration** – read-only HL7 FHIR R4 API at `/fhir` (Patient, Observation w/ LOINC,
Condition w/ ICD-10 + SNOMED, RiskAssessment, Communication, `Patient/$everything`), API keys
managed in Admin → EMR integration. Patients are matched by MRN.

## HIPAA technical safeguards implemented

| Requirement (45 CFR 164.312) | Implementation |
|---|---|
| Unique user identification | Individual accounts; no shared logins |
| Access control / minimum necessary | Roles; staff see only assigned patients; patients only themselves; internal notes staff-only |
| Automatic logoff | 15-min idle timeout (server + browser, with warning), 12-h absolute session limit |
| Person authentication | bcrypt passwords (10+ chars), lockout after 5 failures, TOTP two-factor (required for staff via `REQUIRE_STAFF_MFA=true`) |
| Audit controls | Logins, failures, every patient view, message, assessment, follow-up, note, print, FHIR read, admin change – with IP; viewer + CSV export |
| Integrity | Assessments are append-only history; risk computed server-side |
| Transmission security | HTTPS-only cookies (`Secure`, `HttpOnly`, `SameSite=Strict`), HSTS, strict security headers |
| Encryption at rest | Managed Postgres disk encryption; MFA secrets additionally AES-256-GCM encrypted |
| PHI caching | `Cache-Control: no-store` on all API/FHIR responses; `noindex` |

**Still required before real PHI (organizational, not code):** a signed **BAA with the hosting
provider** (e.g. Render HIPAA workspace, AWS, Azure, GCP, Aptible) on a paid plan with backups;
a documented risk analysis; HIPAA policies and workforce training; breach-notification procedure;
audit-log retention (6 years); BAAs with any EMR/vendor you connect; legal review of the privacy
notice. Code alone cannot make an organization HIPAA compliant.

## Run locally

```bash
npm install
npm run local                 # builds the UI and serves http://localhost:3000
node scripts/seed-demo.mjs    # optional: fictional demo staff & patients (password DemoPass-2026)
```

Without `DATABASE_URL` it uses an embedded Postgres in `.data/`. Admin login comes from `.env`.
Live UI editing: `npm run dev:server` + `npm run dev:client`, open http://localhost:5173.

## Deploy (Render)

1. Push this folder to a GitHub repository.
2. Render → **New → Blueprint** → pick the repo. `render.yaml` creates the web service + Postgres,
   generates secrets, and turns on staff MFA.
3. Enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` (10+ chars, letters and numbers) when prompted.

`ALLOW_PATIENT_SIGNUP=false` disables public patient sign-up (staff then create patient logins).
