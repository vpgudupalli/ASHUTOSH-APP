/**
 * Risk stratification engine (shared by browser and server).
 *
 * Design principles
 * - Validated instruments are scored with their published cut-offs (PHQ-9, GAD-7,
 *   AUDIT-C, PEG, ACC/AHA BP, ADA HbA1c, Katz ADL, CDC STEADI, CMS AHC-HRSN, LACE).
 * - Each domain contributes points but is CAPPED, so ticking many boxes in one area
 *   cannot by itself push a patient to the top tier.
 * - Missing answers never add risk; they lower "completeness" instead.
 * - A small set of safety findings set a MINIMUM tier ("floor") regardless of points
 *   (e.g. emergency symptoms, PHQ-9 item 9, cauda equina signs).
 * - Point weights are a composite built from the instruments above. They are a
 *   clinical-decision-support starting point and must be calibrated locally
 *   (e.g. against 90-day ED/admission outcomes) before being relied on.
 */

// ---------------------------------------------------------------- tiers

export const TIERS = ['Low', 'Mild', 'Moderate', 'High', 'Critical'];

// Minimum points for each tier (total possible ~50).
export const TIER_THRESHOLDS = { Low: 0, Mild: 4, Moderate: 10, High: 16, Critical: 24 };

export const TIER_INFO = {
    Low: {
        followUp: 'Routine – next scheduled visit',
        slaHours: null,
        actions: ['Routine follow-up at next scheduled visit', 'Preventive care reminders (screenings, vaccines)', 'Patient education and self-management resources', 'Encourage regular check-ins through the app'],
        patientMessage: 'Thank you! Your answers have been shared with your care team. Keep checking in so they can stay up to date.',
    },
    Mild: {
        followUp: 'Within 30 days',
        slaHours: 24 * 30,
        actions: ['Care team review within 30 days', 'Health coaching / lifestyle counseling', 'Address open care gaps (labs, screenings, vaccines)', 'Encourage monthly check-ins through the app'],
        patientMessage: 'Thank you! Your care team will review your answers and may reach out about ways to support your health.',
    },
    Moderate: {
        followUp: 'Within 7 days',
        slaHours: 24 * 7,
        actions: ['Care team outreach within 7 days (phone / app message)', 'Schedule a near-term appointment', 'Consider enrollment in care management program', 'Medication review and adherence support', 'Address social needs with community referrals'],
        patientMessage: 'Thank you. Your care team will contact you within the next week to talk about your health and how they can help.',
    },
    High: {
        followUp: 'Within 24–48 hours',
        slaHours: 48,
        actions: ['Contact patient within 24–48 hours', 'Enroll in intensive care management', 'Arrange rapid follow-up visit (in person or telehealth)', 'Coordinate with specialists / home health / pharmacy', 'Targeted interventions for each flagged factor below'],
        patientMessage: 'Thank you. Your care team will contact you within 1–2 days. If you feel worse before then, call your clinic, or 911 in an emergency.',
    },
    Critical: {
        followUp: 'Same day',
        slaHours: 8,
        actions: ['Contact patient TODAY', 'Urgent in-person or ED evaluation if indicated', 'Escalate to provider / clinical leadership', 'Full care coordination across providers', 'Daily monitoring until stabilized (telehealth / RPM)'],
        patientMessage: 'Your care team has been alerted and will contact you today. If you have chest pain, trouble breathing, signs of stroke, or thoughts of harming yourself, call 911 or 988 now.',
    },
};

// ---------------------------------------------------------------- reference lists

// Weights adapted from the Charlson Comorbidity Index (Charlson 1987) and CMS-HCC.
export const CONDITIONS = [
    { key: 'htn', label: 'High blood pressure (Hypertension)', icd10: 'I10', snomed: '38341003', weight: 1 },
    { key: 'dm', label: 'Diabetes', icd10: 'E11.9', snomed: '44054006', weight: 1 },
    { key: 'dm_comp', label: 'Diabetes with complications (kidney, eye, nerve)', icd10: 'E11.8', snomed: '74627003', weight: 2 },
    { key: 'hf', label: 'Heart failure', icd10: 'I50.9', snomed: '84114007', weight: 2 },
    { key: 'cad', label: 'Coronary artery disease / prior heart attack', icd10: 'I25.10', snomed: '53741008', weight: 1 },
    { key: 'afib', label: 'Atrial fibrillation', icd10: 'I48.91', snomed: '49436004', weight: 1 },
    { key: 'stroke', label: 'Prior stroke or TIA', icd10: 'Z86.73', snomed: '230690007', weight: 1 },
    { key: 'copd', label: 'COPD / emphysema', icd10: 'J44.9', snomed: '13645005', weight: 1 },
    { key: 'asthma', label: 'Asthma', icd10: 'J45.909', snomed: '195967001', weight: 1 },
    { key: 'ckd', label: 'Chronic kidney disease', icd10: 'N18.9', snomed: '709044004', weight: 2 },
    { key: 'liver', label: 'Liver disease / cirrhosis', icd10: 'K74.60', snomed: '19943007', weight: 2 },
    { key: 'cancer', label: 'Cancer (active or in treatment)', icd10: 'C80.1', snomed: '363346000', weight: 2 },
    { key: 'dementia', label: 'Dementia / memory loss', icd10: 'F03.90', snomed: '52448006', weight: 1 },
    { key: 'depression', label: 'Depression', icd10: 'F32.A', snomed: '35489007', weight: 1 },
    { key: 'anxiety', label: 'Anxiety disorder', icd10: 'F41.9', snomed: '197480006', weight: 1 },
    { key: 'smi', label: 'Bipolar disorder or schizophrenia', icd10: 'F31.9', snomed: '13746004', weight: 1 },
    { key: 'sud', label: 'Substance use disorder', icd10: 'F19.20', snomed: '66214007', weight: 1 },
    { key: 'hiv', label: 'HIV', icd10: 'B20', snomed: '86406008', weight: 2 },
    { key: 'arthritis', label: 'Arthritis / chronic pain condition', icd10: 'M19.90', snomed: '396275006', weight: 1 },
    { key: 'osa', label: 'Sleep apnea', icd10: 'G47.33', snomed: '78275009', weight: 1 },
];

export const URGENT_SYMPTOMS = [
    { key: 'chest_pain', label: 'Chest pain, pressure, or tightness' },
    { key: 'breathing', label: 'Severe shortness of breath or trouble breathing at rest' },
    { key: 'stroke', label: 'Sudden weakness, numbness, face drooping, or trouble speaking' },
    { key: 'confusion', label: 'New confusion or trouble staying awake' },
    { key: 'fainting', label: 'Fainting or passing out' },
    { key: 'bleeding', label: 'Severe bleeding or vomiting blood' },
    { key: 'headache', label: 'Sudden severe headache or vision loss' },
    { key: 'selfharm', label: 'Thoughts of hurting yourself or someone else right now' },
];

// HHS/ACS six-question disability set + communication.
export const DISABILITIES = [
    { key: 'hearing', label: 'Deaf or serious difficulty hearing', consider: 'Prefer text / written messages; offer ASL interpreter' },
    { key: 'vision', label: 'Blind or serious difficulty seeing', consider: 'Prefer phone calls; large-print or audio materials' },
    { key: 'cognitive', label: 'Difficulty concentrating, remembering, or making decisions', consider: 'Include caregiver; use teach-back; simple written plan' },
    { key: 'mobility', label: 'Serious difficulty walking or climbing stairs', consider: 'Offer telehealth / home visits; check transportation' },
    { key: 'selfcare', label: 'Difficulty dressing or bathing', consider: 'Assess home health / personal care aide needs' },
    { key: 'independent', label: 'Difficulty doing errands alone', consider: 'Assess caregiver support and community services' },
    { key: 'speech', label: 'Difficulty speaking or communicating', consider: 'Prefer app messaging; allow extra time' },
];

// Katz Index of Independence in ADLs (Katz 1963).
export const ADLS = [
    { key: 'bathing', label: 'Bathing' },
    { key: 'dressing', label: 'Dressing' },
    { key: 'toileting', label: 'Using the toilet' },
    { key: 'transferring', label: 'Getting in/out of bed or a chair' },
    { key: 'continence', label: 'Bladder / bowel control' },
    { key: 'feeding', label: 'Eating' },
];

export const PAIN_RED_FLAGS = [
    { key: 'neuro', label: 'New leg weakness, numbness in groin/"saddle" area, or loss of bladder/bowel control', floor: 'Critical', why: 'Possible cauda equina syndrome / cord compression – emergency evaluation' },
    { key: 'fever', label: 'Fever or chills with the pain', floor: 'High', why: 'Possible spinal or joint infection' },
    { key: 'ivdu', label: 'Injection drug use', floor: 'High', why: 'Risk of spinal infection (epidural abscess, osteomyelitis)' },
    { key: 'trauma', label: 'Recent significant fall or injury', floor: 'High', why: 'Possible fracture' },
    { key: 'cancer_hx', label: 'History of cancer', floor: 'Moderate', why: 'Possible metastatic disease – prompt evaluation / imaging' },
    { key: 'weight_loss', label: 'Unexplained weight loss', floor: 'Moderate', why: 'Possible malignancy or systemic illness' },
];

// PHQ-9 (Kroenke 2001) and GAD-7 (Spitzer 2006) – free to use, no permission required.
export const PHQ9_ITEMS = [
    'Little interest or pleasure in doing things',
    'Feeling down, depressed, or hopeless',
    'Trouble falling or staying asleep, or sleeping too much',
    'Feeling tired or having little energy',
    'Poor appetite or overeating',
    'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
    'Trouble concentrating on things, such as reading or watching television',
    'Moving or speaking so slowly that other people could have noticed — or being so fidgety or restless that you have been moving around a lot more than usual',
    'Thoughts that you would be better off dead, or of hurting yourself in some way',
];
export const GAD7_ITEMS = [
    'Feeling nervous, anxious, or on edge',
    'Not being able to stop or control worrying',
    'Worrying too much about different things',
    'Trouble relaxing',
    'Being so restless that it is hard to sit still',
    'Becoming easily annoyed or irritable',
    'Feeling afraid, as if something awful might happen',
];
export const FREQ_OPTIONS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];

// AUDIT-C (Bush 1998).
export const AUDITC_ITEMS = [
    { q: 'How often do you have a drink containing alcohol?', options: ['Never', 'Monthly or less', '2–4 times a month', '2–3 times a week', '4 or more times a week'] },
    { q: 'How many drinks containing alcohol do you have on a typical day when you are drinking?', options: ['1 or 2', '3 or 4', '5 or 6', '7 to 9', '10 or more'] },
    { q: 'How often do you have 6 or more drinks on one occasion?', options: ['Never', 'Less than monthly', 'Monthly', 'Weekly', 'Daily or almost daily'] },
];

// PEG pain scale (Krebs 2009).
export const PEG_ITEMS = [
    'Average pain in the past week (0 = no pain, 10 = worst you can imagine)',
    'How much pain interfered with your ENJOYMENT OF LIFE in the past week (0–10)',
    'How much pain interfered with your GENERAL ACTIVITY in the past week (0–10)',
];

export const INITIAL_ASSESSMENT = {
    // About me
    name: '', dob: '', sex: '', preferredLanguage: 'English', preferredContact: '', phone: '', bestTime: '',
    // Today
    feelingToday: '', urgentSymptoms: [],
    // Vitals (US units)
    heightFt: '', heightIn: '', weightLb: '', bpSystolic: '', bpDiastolic: '', heartRate: '', spo2: '',
    tempF: '', glucose: '', glucoseContext: '', hbA1c: '',
    // Conditions & medications
    conditions: [], otherConditions: '', medCount: '', medicationAdherence: '', medicationConcerns: '',
    // Care use
    edVisits30d: '', hospitalizations90d: '', missedAppointments: '',
    // Function & disability
    adlHelp: [], mobilityAid: '', falls12mo: '', fallInjury: false, disabilities: [], livesAlone: '', hasCaregiver: '',
    // Lifestyle
    activityDays: '', activityMinutes: '', sleepHours: '', tobacco: '', vaping: false, auditC: [null, null, null], drugUse: '',
    // Mental health
    phq: Array(9).fill(null), gad: Array(7).fill(null),
    // Pain
    painHas: '', painLocation: '', peg: [null, null, null], painWeeks: '', painRestNight: false, painRedFlags: [],
    // Sexual health (CDC 5 Ps)
    sexActive: '', sexPartners: '', sexNewPartner: false, sexCondom: '', sexSti12mo: '', sexPregnancy: '', sexWantsTesting: false,
    // Social needs (CMS AHC-HRSN)
    sdohHousing: '', sdohFood: '', sdohTransport: '', sdohUtilities: '', sdohSafety: '', sdohLonely: '', sdohFinancial: '',
    // Message to care team
    patientNote: '', wantsCallback: false,
};

// ---------------------------------------------------------------- helpers

const num = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const answered = (items) => arr(items).length > 0 && arr(items).every((x) => x !== null && x !== undefined && x !== '');
const sum = (items) => arr(items).reduce((a, b) => a + (Number(b) || 0), 0);
const tierIndex = (t) => TIERS.indexOf(t);

export function heightInches(d) {
    const ft = num(d.heightFt);
    const inch = num(d.heightIn);
    if (ft === null && inch === null) return null;
    const total = (ft || 0) * 12 + (inch || 0);
    return total > 0 ? total : null;
}

export function bmi(d) {
    const h = heightInches(d);
    const w = num(d.weightLb);
    if (!h || !w) return null;
    return Math.round((703 * w / (h * h)) * 10) / 10;
}

export function phq9Score(d) {
    return answered(d.phq) ? sum(d.phq) : null;
}
export function phq2Score(d) {
    const p = arr(d.phq);
    return p[0] !== null && p[0] !== undefined && p[1] !== null && p[1] !== undefined ? Number(p[0]) + Number(p[1]) : null;
}
export function gad7Score(d) {
    return answered(d.gad) ? sum(d.gad) : null;
}
export function auditCScore(d) {
    const a = arr(d.auditC);
    if (a[0] === 0 || a[0] === '0') return 0; // "Never" drinks
    return answered(a) ? sum(a) : null;
}
export function pegScore(d) {
    return answered(d.peg) ? Math.round((sum(d.peg) / 3) * 10) / 10 : null;
}

export const PHQ9_BANDS = (s) => (s >= 20 ? 'Severe' : s >= 15 ? 'Moderately severe' : s >= 10 ? 'Moderate' : s >= 5 ? 'Mild' : 'Minimal');
export const GAD7_BANDS = (s) => (s >= 15 ? 'Severe' : s >= 10 ? 'Moderate' : s >= 5 ? 'Mild' : 'Minimal');

export function bpCategory(sys, dia) {
    if (sys === null || dia === null) return null;
    if (sys >= 180 || dia >= 120) return 'Severe (≥180/120)';
    if (sys >= 160 || dia >= 100) return 'Stage 2, ≥160/100';
    if (sys >= 140 || dia >= 90) return 'Stage 2 hypertension';
    if (sys >= 130 || dia >= 80) return 'Stage 1 hypertension';
    if (sys >= 120) return 'Elevated';
    if (sys < 90) return 'Low (hypotension)';
    return 'Normal';
}

// ---------------------------------------------------------------- domains

// Each domain returns factors: { label, points, rec?, floor?, floorReason? }.
// `inputs` lists the fields that make the domain "assessed".
const DOMAINS = [
    {
        key: 'symptoms', label: 'Current symptoms', cap: 2,
        inputs: (d) => d.feelingToday || arr(d.urgentSymptoms).length,
        score(d, f) {
            const urgent = arr(d.urgentSymptoms);
            if (urgent.length) {
                const labels = URGENT_SYMPTOMS.filter((s) => urgent.includes(s.key)).map((s) => s.label);
                f.push({ label: `Emergency warning symptoms: ${labels.join('; ')}`, points: 0, floor: 'Critical', rec: 'Call patient immediately; direct to 911 / ED if symptoms are current. If self-harm: 988 Suicide & Crisis Lifeline and same-day safety assessment.' });
            }
            if (d.feelingToday === 'Very unwell') f.push({ label: 'Reports feeling very unwell today', points: 2, rec: 'Same-week check-in on current symptoms' });
            else if (d.feelingToday === 'Not well') f.push({ label: 'Reports not feeling well today', points: 1 });
        },
    },
    {
        key: 'vitals', label: 'Vitals & labs', cap: 8,
        source: 'ACC/AHA 2017 BP guideline; ADA Standards of Care (HbA1c, hypoglycemia); WHO BMI classes',
        inputs: (d) => [d.bpSystolic, d.heartRate, d.spo2, d.tempF, d.glucose, d.hbA1c, d.weightLb].some((v) => num(v) !== null),
        score(d, f) {
            const sys = num(d.bpSystolic), dia = num(d.bpDiastolic);
            if (sys !== null && dia !== null) {
                const cat = bpCategory(sys, dia);
                if (sys >= 180 || dia >= 120) f.push({ label: `BP ${sys}/${dia} – severe hypertension`, points: 4, floor: 'High', floorReason: 'BP ≥180/120', rec: 'Same-day contact: recheck BP and screen for symptoms of hypertensive emergency (chest pain, dyspnea, neuro or vision changes)' });
                else if (sys >= 160 || dia >= 100) f.push({ label: `BP ${sys}/${dia} – ${cat}`, points: 3, rec: 'Medication titration; BP recheck within 1–2 weeks' });
                else if (sys >= 140 || dia >= 90) f.push({ label: `BP ${sys}/${dia} – ${cat}`, points: 2, rec: 'Review antihypertensive regimen; home BP monitoring' });
                else if (sys >= 130 || dia >= 80) f.push({ label: `BP ${sys}/${dia} – ${cat}`, points: 1, rec: 'Lifestyle counseling; recheck BP' });
                else if (sys < 90) f.push({ label: `BP ${sys}/${dia} – low blood pressure`, points: 2, rec: 'Assess for dizziness, dehydration, medication effect' });
            }
            const hr = num(d.heartRate);
            if (hr !== null) {
                if (hr < 50 || hr > 120) f.push({ label: `Heart rate ${hr} bpm`, points: 2, rec: 'Assess symptoms; consider ECG' });
                else if (hr > 100) f.push({ label: `Heart rate ${hr} bpm (fast)`, points: 1 });
            }
            const o2 = num(d.spo2);
            if (o2 !== null) {
                if (o2 < 88) f.push({ label: `Oxygen saturation ${o2}%`, points: 4, floor: 'High', floorReason: 'SpO₂ <88%', rec: 'Same-day assessment of breathing; ED if symptomatic' });
                else if (o2 < 92) f.push({ label: `Oxygen saturation ${o2}%`, points: 2, rec: 'Assess respiratory status (note: COPD patients may run 88–92%)' });
                else if (o2 < 95) f.push({ label: `Oxygen saturation ${o2}%`, points: 1 });
            }
            const t = num(d.tempF);
            if (t !== null && t >= 100.4) f.push({ label: `Temperature ${t}°F (fever)`, points: t >= 103 ? 2 : 1, rec: 'Assess for infection' });
            const g = num(d.glucose);
            if (g !== null) {
                if (g < 54) f.push({ label: `Blood glucose ${g} mg/dL – level 2 hypoglycemia`, points: 3, floor: 'High', floorReason: 'Glucose <54 mg/dL', rec: 'Same-day contact; review insulin/sulfonylurea dosing; hypoglycemia education' });
                else if (g < 70) f.push({ label: `Blood glucose ${g} mg/dL – low`, points: 2, rec: 'Review diabetes medications for hypoglycemia risk' });
                else if (g > 400) f.push({ label: `Blood glucose ${g} mg/dL – very high`, points: 3, floor: 'High', floorReason: 'Glucose >400 mg/dL', rec: 'Same-day contact; screen for DKA/HHS symptoms' });
                else if (g > 300) f.push({ label: `Blood glucose ${g} mg/dL – high`, points: 2, rec: 'Diabetes regimen review within days' });
            }
            const a1c = num(d.hbA1c);
            if (a1c !== null) {
                if (a1c > 10) f.push({ label: `HbA1c ${a1c}% – very poor control`, points: 4, rec: 'Intensify diabetes therapy; diabetes education / CDCES referral' });
                else if (a1c > 9) f.push({ label: `HbA1c ${a1c}% – poor control (HEDIS >9%)`, points: 3, rec: 'Intensify diabetes therapy; diabetes education' });
                else if (a1c > 8) f.push({ label: `HbA1c ${a1c}% – above goal`, points: 2, rec: 'Diabetes regimen review' });
                else if (a1c >= 7) f.push({ label: `HbA1c ${a1c}% – slightly above goal (<7%)`, points: 1 });
            }
            const b = bmi(d);
            if (b !== null) {
                if (b >= 40) f.push({ label: `BMI ${b} – class 3 obesity`, points: 2, rec: 'Weight management program; evaluate for OSA, diabetes' });
                else if (b >= 35) f.push({ label: `BMI ${b} – class 2 obesity`, points: 1, rec: 'Weight management counseling' });
                else if (b < 18.5) f.push({ label: `BMI ${b} – underweight`, points: 1, rec: 'Nutrition assessment' });
            }
        },
    },
    {
        key: 'conditions', label: 'Chronic conditions', cap: 6,
        source: 'Adapted from Charlson Comorbidity Index (Charlson 1987) weights',
        inputs: (d) => arr(d.conditions).length || d.otherConditions,
        score(d, f) {
            const sel = arr(d.conditions);
            CONDITIONS.forEach((c) => {
                if (!sel.includes(c.key)) return;
                if (c.key === 'dm' && sel.includes('dm_comp')) return; // count diabetes once
                f.push({ label: c.label, points: c.weight });
            });
            const count = sel.filter((k) => !(k === 'dm' && sel.includes('dm_comp'))).length;
            if (count >= 4) f.push({ label: `Multimorbidity (${count} chronic conditions)`, points: 0, rec: 'Comprehensive care plan; consider chronic care management (CCM) enrollment' });
        },
    },
    {
        key: 'utilization', label: 'Hospital & ED use', cap: 7,
        source: 'LACE index (van Walraven 2010) – acute admission and ED visits predict readmission',
        inputs: (d) => [d.edVisits30d, d.hospitalizations90d, d.missedAppointments].some((v) => num(v) !== null),
        score(d, f) {
            const ed = num(d.edVisits30d);
            if (ed !== null && ed > 0) {
                f.push({
                    label: `${ed} ED visit${ed > 1 ? 's' : ''} in the last 30 days`,
                    points: ed >= 3 ? 4 : ed === 2 ? 3 : 2,
                    floor: ed >= 2 ? 'Moderate' : undefined,
                    floorReason: 'Repeat ED use (≥2 in 30 days)',
                    rec: 'Review ED visit reasons; establish a plan for after-hours care (nurse line, urgent care, telehealth) to avoid preventable ED visits',
                });
            }
            const h = num(d.hospitalizations90d);
            if (h !== null && h > 0) f.push({ label: `${h} hospital stay${h > 1 ? 's' : ''} in the last 90 days`, points: h >= 2 ? 4 : 3, rec: 'Transition-of-care follow-up; medication reconciliation after discharge' });
            const m = num(d.missedAppointments);
            if (m !== null && m >= 2) f.push({ label: `${m} missed appointments (6 months)`, points: 1, rec: 'Explore barriers (transport, cost, reminders)' });
        },
    },
    {
        key: 'medications', label: 'Medications', cap: 3,
        source: 'Polypharmacy ≥5 medications (Masnoon 2017)',
        inputs: (d) => num(d.medCount) !== null || d.medicationAdherence,
        score(d, f) {
            const n = num(d.medCount);
            if (n !== null && n >= 10) f.push({ label: `${n} daily medications (high polypharmacy)`, points: 2, rec: 'Pharmacist comprehensive medication review' });
            else if (n !== null && n >= 5) f.push({ label: `${n} daily medications (polypharmacy)`, points: 1, rec: 'Medication review / deprescribing check' });
            if (d.medicationAdherence === 'Poor') f.push({ label: 'Often misses medications', points: 2, rec: 'Adherence support: pill organizer, blister packs, simplify regimen, cost review' });
            else if (d.medicationAdherence === 'Fair') f.push({ label: 'Sometimes misses medications', points: 1, rec: 'Adherence counseling' });
        },
    },
    {
        key: 'function', label: 'Function, falls & disability', cap: 4,
        source: 'Katz ADL index (Katz 1963); CDC STEADI fall-risk screening',
        inputs: (d) => arr(d.adlHelp).length || d.falls12mo || d.mobilityAid || arr(d.disabilities).length || d.livesAlone,
        score(d, f) {
            const adl = arr(d.adlHelp).length;
            if (adl) f.push({ label: `Needs help with ${adl} daily activit${adl > 1 ? 'ies' : 'y'} (ADLs)`, points: adl >= 5 ? 3 : adl >= 3 ? 2 : 1, rec: 'Assess home health / personal care services' });
            if (d.falls12mo === '2+' || d.fallInjury) f.push({ label: d.fallInjury ? 'Fall with injury in past year' : '2 or more falls in past year', points: 2, rec: 'STEADI fall-risk assessment; PT referral; home safety evaluation' });
            else if (d.falls12mo === '1') f.push({ label: '1 fall in past year', points: 1, rec: 'Fall-risk screening (gait, meds, vision)' });
            if (d.livesAlone === 'Yes' && (adl || arr(d.disabilities).length)) f.push({ label: 'Lives alone with functional limitations', points: 1, rec: 'Check caregiver support / emergency response device' });
        },
    },
    {
        key: 'mental', label: 'Mental health', cap: 6,
        source: 'PHQ-9 (Kroenke 2001), PHQ-2 (Kroenke 2003), GAD-7 (Spitzer 2006)',
        inputs: (d) => phq2Score(d) !== null || gad7Score(d) !== null,
        score(d, f) {
            const phq = phq9Score(d);
            const p9 = arr(d.phq)[8];
            if (p9 !== null && p9 !== undefined && Number(p9) > 0) {
                f.push({ label: 'PHQ-9 item 9 positive (thoughts of self-harm)', points: 0, floor: 'Critical', floorReason: 'PHQ-9 item 9 positive', rec: 'Same-day suicide risk assessment (e.g., C-SSRS); safety plan; 988 Suicide & Crisis Lifeline' });
            }
            if (phq !== null) {
                const pts = phq >= 20 ? 4 : phq >= 15 ? 3 : phq >= 10 ? 2 : phq >= 5 ? 1 : 0;
                if (pts) f.push({ label: `PHQ-9 = ${phq} (${PHQ9_BANDS(phq)} depression)`, points: pts, rec: phq >= 10 ? 'Behavioral health referral / collaborative care; consider treatment' : 'Watchful waiting; repeat PHQ-9 at follow-up' });
            } else {
                const p2 = phq2Score(d);
                if (p2 !== null && p2 >= 3) f.push({ label: `PHQ-2 = ${p2} (positive screen)`, points: 1, rec: 'Complete full PHQ-9' });
            }
            const gad = gad7Score(d);
            if (gad !== null && gad >= 10) f.push({ label: `GAD-7 = ${gad} (${GAD7_BANDS(gad)} anxiety)`, points: gad >= 15 ? 2 : 1, rec: 'Behavioral health referral' });
        },
    },
    {
        key: 'substance', label: 'Tobacco, alcohol & drugs', cap: 4,
        source: 'AUDIT-C (Bush 1998; ≥4 men / ≥3 women positive); single-item drug screen (Smith 2010); USPSTF tobacco',
        inputs: (d) => d.tobacco || auditCScore(d) !== null || d.drugUse,
        score(d, f) {
            const a = auditCScore(d);
            if (a !== null) {
                const threshold = d.sex === 'Female' ? 3 : 4;
                if (a >= 8) f.push({ label: `AUDIT-C = ${a} (high-risk drinking)`, points: 2, rec: 'Brief intervention; evaluate for alcohol use disorder treatment' });
                else if (a >= threshold) f.push({ label: `AUDIT-C = ${a} (positive screen)`, points: 1, rec: 'Brief alcohol counseling' });
            }
            if (d.drugUse === 'Current') f.push({ label: 'Current drug use (past 30 days)', points: 2, rec: 'SBIRT; offer treatment referral; naloxone if opioids' });
            else if (d.drugUse === 'Past year') f.push({ label: 'Drug use in past year', points: 1, rec: 'Brief intervention' });
            if (d.tobacco === 'Current' || d.vaping) f.push({ label: d.tobacco === 'Current' ? 'Current tobacco use' : 'Current vaping', points: 1, rec: 'Tobacco cessation counseling + pharmacotherapy; quitline 1-800-QUIT-NOW' });
        },
    },
    {
        key: 'lifestyle', label: 'Physical activity & sleep', cap: 1,
        source: 'CDC Physical Activity Guidelines (150 min/week moderate activity)',
        inputs: (d) => num(d.activityDays) !== null || num(d.sleepHours) !== null,
        score(d, f) {
            const days = num(d.activityDays), mins = num(d.activityMinutes);
            if (days !== null) {
                const weekly = days * (mins || 0);
                if (weekly < 150) f.push({ label: `Physically active ~${weekly} min/week (goal 150)`, points: 1, rec: 'Physical activity counseling / exercise prescription' });
            }
            const s = num(d.sleepHours);
            if (s !== null && (s < 6 || s > 10)) f.push({ label: `Sleeps about ${s} hours a night`, points: 0, rec: 'Sleep assessment (consider OSA screening)' });
        },
    },
    {
        key: 'pain', label: 'Pain', cap: 3,
        source: 'PEG scale (Krebs 2009); ACP low back pain guideline red flags (Qaseem 2017)',
        inputs: (d) => d.painHas,
        score(d, f) {
            if (d.painHas !== 'Yes') return;
            const peg = pegScore(d);
            if (peg !== null && peg >= 7) f.push({ label: `PEG pain score ${peg} (severe)`, points: 2, rec: 'Pain management plan; consider PT / multimodal therapy' });
            else if (peg !== null && peg >= 4) f.push({ label: `PEG pain score ${peg} (moderate)`, points: 1, rec: 'Pain follow-up' });
            const w = num(d.painWeeks);
            if (w !== null && w > 12) f.push({ label: `Pain for ${w} weeks (chronic, >3 months)`, points: 1, rec: 'Chronic pain care plan; screen for depression' });
            if (d.painRestNight) f.push({ label: 'Pain at rest or at night', points: 1, rec: 'Evaluate for non-mechanical cause' });
            PAIN_RED_FLAGS.forEach((r) => {
                if (arr(d.painRedFlags).includes(r.key)) f.push({ label: `Red flag: ${r.label}`, points: 0, floor: r.floor, floorReason: r.why, rec: r.why });
            });
        },
    },
    {
        key: 'sexual', label: 'Sexual health', cap: 2,
        source: 'CDC "5 Ps" sexual history; CDC STI screening & PrEP guidance',
        inputs: (d) => d.sexActive,
        score(d, f) {
            if (d.sexActive !== 'Yes') return;
            const multi = d.sexPartners === '2–4' || d.sexPartners === '5+' || d.sexNewPartner;
            if (multi) f.push({ label: 'Multiple or new partners', points: 1, rec: 'Offer STI / HIV screening; assess PrEP eligibility' });
            if (multi && (d.sexCondom === 'Sometimes' || d.sexCondom === 'Never')) f.push({ label: 'Inconsistent condom use with new/multiple partners', points: 1, rec: 'Prevention counseling; condoms; PrEP discussion' });
            if (d.sexSti12mo === 'Yes') f.push({ label: 'STI in the past 12 months', points: 1, rec: 'Re-screen for STIs (3 months after treatment)' });
            if (d.sexPregnancy === 'Not using birth control, do not want pregnancy') f.push({ label: 'Pregnancy not desired but not using contraception', points: 1, rec: 'Contraception counseling' });
            if (d.sexWantsTesting) f.push({ label: 'Patient requests STI/HIV testing', points: 0, rec: 'Order requested STI/HIV testing' });
        },
    },
    {
        key: 'sdoh', label: 'Social needs', cap: 4,
        source: 'CMS Accountable Health Communities HRSN screening tool (Billioux 2017)',
        inputs: (d) => d.sdohHousing || d.sdohFood || d.sdohTransport || d.sdohUtilities || d.sdohSafety || d.sdohLonely || d.sdohFinancial,
        score(d, f) {
            if (d.sdohHousing === 'No steady place') f.push({ label: 'No steady place to live', points: 2, rec: 'Housing / homeless services referral' });
            else if (d.sdohHousing === 'Steady, but worried about losing it') f.push({ label: 'Worried about losing housing', points: 1, rec: 'Housing assistance referral' });
            if (d.sdohFood === 'Often' || d.sdohFood === 'Sometimes') f.push({ label: 'Food insecurity', points: 1, rec: 'SNAP / food bank / medically tailored meals referral' });
            if (d.sdohTransport === 'Yes') f.push({ label: 'Transportation barrier to care', points: 1, rec: 'Arrange medical transportation (Medicaid NEMT, ride programs); offer telehealth' });
            if (d.sdohUtilities === 'Yes' || d.sdohUtilities === 'Already shut off') f.push({ label: 'Utility shut-off risk', points: 1, rec: 'LIHEAP / utility assistance referral' });
            if (d.sdohFinancial === 'Very hard') f.push({ label: 'Severe financial strain', points: 1, rec: 'Financial counseling; check medication cost assistance' });
            if (d.sdohLonely === 'Often' || d.sdohLonely === 'Always') f.push({ label: 'Often feels lonely / isolated', points: 1, rec: 'Social support / community program referral' });
            if (d.sdohSafety === 'Yes') f.push({ label: 'Feels unsafe or has been hurt/threatened', points: 0, floor: 'High', floorReason: 'Interpersonal safety concern', rec: 'Private follow-up; safety planning; National DV Hotline 1-800-799-7233' });
        },
    },
];

export const DOMAIN_LIST = DOMAINS.map(({ key, label, cap, source }) => ({ key, label, cap, source }));

// ---------------------------------------------------------------- main entry

export function scoreAssessment(data = {}) {
    const d = { ...INITIAL_ASSESSMENT, ...data };
    const domains = [];
    const floors = [];
    const recs = [];
    let total = 0;

    for (const dom of DOMAINS) {
        const factors = [];
        dom.score(d, factors);
        const raw = factors.reduce((a, x) => a + x.points, 0);
        const points = Math.min(raw, dom.cap);
        total += points;
        const assessed = !!dom.inputs(d);
        domains.push({ key: dom.key, label: dom.label, cap: dom.cap, points, raw, assessed, source: dom.source, factors });
        factors.forEach((x) => {
            if (x.floor) floors.push({ tier: x.floor, reason: x.floorReason || x.label });
            if (x.rec && !recs.includes(x.rec)) recs.push(x.rec);
        });
    }

    let pointsTier = 'Low';
    for (const t of TIERS) if (total >= TIER_THRESHOLDS[t]) pointsTier = t;
    let tier = pointsTier;
    for (const fl of floors) if (tierIndex(fl.tier) > tierIndex(tier)) tier = fl.tier;

    // Care considerations (not scored) – help staff communicate effectively.
    const considerations = DISABILITIES.filter((x) => arr(d.disabilities).includes(x.key)).map((x) => `${x.label}: ${x.consider}`);
    if (d.preferredLanguage && !/^english$/i.test(d.preferredLanguage.trim())) considerations.push(`Preferred language ${d.preferredLanguage}: use a qualified medical interpreter`);
    if (d.preferredContact) considerations.push(`Prefers contact by ${d.preferredContact.toLowerCase()}${d.bestTime ? `, best time: ${d.bestTime}` : ''}`);
    if (d.wantsCallback) considerations.push('Patient requested a call back');

    const assessedCount = domains.filter((x) => x.assessed).length;

    return {
        tier,
        score: total,
        maxScore: DOMAINS.reduce((a, x) => a + x.cap, 0),
        pointsTier,
        floors,
        emergency: arr(d.urgentSymptoms).length > 0,
        domains,
        recommendations: [...TIER_INFO[tier].actions, ...recs],
        tierActions: TIER_INFO[tier].actions,
        factorActions: recs,
        followUp: TIER_INFO[tier].followUp,
        patientMessage: TIER_INFO[tier].patientMessage,
        considerations,
        completeness: Math.round((assessedCount / domains.length) * 100),
        missing: domains.filter((x) => !x.assessed).map((x) => x.label),
        derived: { bmi: bmi(d), phq9: phq9Score(d), phq2: phq2Score(d), gad7: gad7Score(d), auditC: auditCScore(d), peg: pegScore(d) },
    };
}

export const REFERENCES = [
    'Whelton PK, et al. 2017 ACC/AHA Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults. Hypertension. 2018;71:e13–e115.',
    'American Diabetes Association. Standards of Care in Diabetes – Glycemic Goals and Hypoglycemia. Diabetes Care (current edition).',
    'Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001;16:606–613.',
    'Kroenke K, Spitzer RL, Williams JB. The Patient Health Questionnaire-2. Med Care. 2003;41:1284–1292.',
    'Spitzer RL, et al. A brief measure for assessing generalized anxiety disorder: the GAD-7. Arch Intern Med. 2006;166:1092–1097.',
    'Bush K, et al. The AUDIT alcohol consumption questions (AUDIT-C). Arch Intern Med. 1998;158:1789–1795.',
    'Smith PC, et al. A single-question screening test for drug use in primary care. Arch Intern Med. 2010;170:1155–1160.',
    'Krebs EE, et al. Development and initial validation of the PEG, a three-item scale assessing pain intensity and interference. J Gen Intern Med. 2009;24:733–738.',
    'Qaseem A, et al. Noninvasive treatments for acute, subacute, and chronic low back pain. Ann Intern Med. 2017;166:514–530.',
    'Charlson ME, et al. A new method of classifying prognostic comorbidity in longitudinal studies. J Chronic Dis. 1987;40:373–383.',
    'van Walraven C, et al. Derivation and validation of an index to predict early death or unplanned readmission (LACE). CMAJ. 2010;182:551–557.',
    'Katz S, et al. Studies of illness in the aged: the index of ADL. JAMA. 1963;185:914–919.',
    'CDC STEADI – Stopping Elderly Accidents, Deaths & Injuries: fall risk screening algorithm.',
    'Billioux A, et al. Standardized Screening for Health-Related Social Needs in Clinical Settings: The AHC Screening Tool. NAM Perspectives. 2017.',
    'U.S. Department of Health and Human Services. Physical Activity Guidelines for Americans, 2nd ed. 2018.',
    'CDC. A Guide to Taking a Sexual History (the "5 Ps"); STI Treatment Guidelines 2021.',
    'Masnoon N, et al. What is polypharmacy? A systematic review of definitions. BMC Geriatr. 2017;17:230.',
    'The Joint Commission NPSG 15.01.01 – suicide risk screening and follow-up.',
];
