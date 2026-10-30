// Fills a LOCAL / DEMO instance with fictional staff and patients through the public API.
// Usage: node scripts/seed-demo.mjs [baseUrl]   (admin login from ADMIN_EMAIL / ADMIN_PASSWORD)
// Never run against a system that holds real patient data.
const BASE = process.argv[2] || 'http://localhost:3000';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.com', password: process.env.ADMIN_PASSWORD || 'ChangeMe-2026' };
const DEMO_PASSWORD = 'DemoPass-2026';

function session() {
  let cookie = '';
  return async (path, body, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`${BASE}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
    return data;
  };
}

const admin = session();
await admin('/auth/login', ADMIN);

const staff = {};
for (const [key, name, role] of [['np', 'Nora Patel', 'np'], ['cm', 'Carlos Medina', 'case_manager'], ['md', 'Dr. Grace Lee', 'provider']]) {
  const { id } = await admin('/admin/users', { name, email: `${key}@demo.test`, role, password: DEMO_PASSWORD });
  staff[key] = id;
}

const PATIENTS = [
  {
    key: 'pat', name: 'Pat Demo', dob: '1958-04-12', team: ['np', 'cm'],
    checkins: [
      { conditions: ['hf', 'ckd', 'dm_comp', 'htn'], edVisits30d: 2, hospitalizations90d: 1, bpSystolic: 158, bpDiastolic: 94, hbA1c: 8.6, medCount: 11, medicationAdherence: 'Fair', sdohTransport: 'Yes', livesAlone: 'Yes', adlHelp: ['bathing'], falls12mo: '1', feelingToday: 'Not well' },
      { conditions: ['hf', 'ckd', 'dm_comp', 'htn'], edVisits30d: 0, hospitalizations90d: 1, bpSystolic: 142, bpDiastolic: 86, hbA1c: 8.1, medCount: 11, medicationAdherence: 'Good', sdohTransport: 'No', livesAlone: 'Yes', adlHelp: ['bathing'], falls12mo: '1', feelingToday: 'Okay', heightFt: 5, heightIn: 7, weightLb: 214, patientNote: 'My ankles are more swollen since Tuesday and I gained 4 lbs. Can someone call me?', wantsCallback: true, preferredContact: 'Phone call', bestTime: 'mornings' },
    ],
    followUps: [{ method: 'Phone call', reached: true, outcome: 'Appointment scheduled', actionTaken: 'Arranged ride through NEMT; cardiology moved up to Friday', edAvoided: true, nextStep: 'Weight check in 3 days', after: 0 }],
  },
  {
    key: 'maria', name: 'Maria Demo', dob: '1979-09-03', team: ['cm'],
    checkins: [{ conditions: ['depression', 'asthma'], phq: [2, 3, 2, 2, 1, 2, 1, 1, 1], gad: [2, 2, 2, 1, 1, 1, 1], sdohFood: 'Often', sdohHousing: 'Steady, but worried about losing it', feelingToday: 'Not well', patientNote: 'Having a hard time lately.' }],
  },
  {
    key: 'james', name: 'James Demo', dob: '1966-01-22', team: ['np', 'md'],
    checkins: [{ conditions: ['htn', 'dm'], bpSystolic: 136, bpDiastolic: 84, hbA1c: 7.4, activityDays: 2, activityMinutes: 20, tobacco: 'Current', medCount: 4, medicationAdherence: 'Good' }],
  },
  {
    key: 'linda', name: 'Linda Demo', dob: '1949-06-30', team: ['np'],
    checkins: [{ conditions: ['copd', 'afib', 'arthritis'], spo2: 89, edVisits30d: 1, painHas: 'Yes', peg: [7, 6, 7], painWeeks: 20, falls12mo: '2+', fallInjury: true, mobilityAid: 'Walker', disabilities: ['hearing', 'mobility'], adlHelp: ['bathing', 'dressing', 'transferring'], livesAlone: 'Yes', medCount: 9 }],
  },
  { key: 'sam', name: 'Sam Demo', dob: '1995-11-11', team: ['md'], checkins: [{ conditions: [], activityDays: 4, activityMinutes: 40, sexActive: 'Yes', sexPartners: '2–4', sexCondom: 'Sometimes', sexWantsTesting: true }] },
];

for (const p of PATIENTS) {
  const { id } = await admin('/patients', { name: p.name, dob: p.dob, email: `${p.key}@demo.test`, password: DEMO_PASSWORD });
  for (const s of p.team) await admin(`/admin/patients/${id}/assignments`, { staffId: staff[s] });
  const pt = session();
  await pt('/auth/login', { email: `${p.key}@demo.test`, password: DEMO_PASSWORD });
  for (const [i, data] of p.checkins.entries()) {
    await pt(`/patients/${id}/assessments`, { data: { name: p.name, dob: p.dob, ...data } });
    for (const f of (p.followUps || []).filter((x) => x.after === i)) {
      const st = session();
      await st('/auth/login', { email: `${p.team[0]}@demo.test`, password: DEMO_PASSWORD });
      await st(`/patients/${id}/review`, {});
      await st(`/patients/${id}/follow-ups`, f);
    }
  }
  console.log(`seeded ${p.name}`);
}
console.log(`\nDemo logins (password ${DEMO_PASSWORD}): np@demo.test, cm@demo.test, md@demo.test, pat@demo.test, maria@demo.test …`);
