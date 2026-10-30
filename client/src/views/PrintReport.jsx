import React from 'react';
import { api, navigate, ROLE_LABELS } from '../api.js';
import { fmt } from '../components/RiskBadge.jsx';
import { ORDINAL } from '../components/CareLoop.jsx';
import {
    CONDITIONS, URGENT_SYMPTOMS, DISABILITIES, ADLS, PAIN_RED_FLAGS, PHQ9_BANDS, GAD7_BANDS, bmi, bpCategory, REFERENCES,
} from '../../../shared/risk.js';

const label = (list, keys) => list.filter((x) => (keys || []).includes(x.key)).map((x) => x.label).join('; ') || '—';
const v = (x, unit = '') => (x === '' || x === null || x === undefined ? '—' : `${x}${unit}`);

// Print-optimized report for uploading to the EMR / patient chart (Print → Save as PDF).
export default function PrintReport({ patientId, assessmentId, user }) {
    const isPatient = user.role === 'patient';
    const [state, setState] = React.useState(null);
    const [error, setError] = React.useState('');
    const [opts, setOpts] = React.useState({ followUps: true, notes: false, responses: true, messages: false });
    const [messages, setMessages] = React.useState([]);

    React.useEffect(() => {
        api(`/patients/${patientId}`).then(setState).catch((e) => setError(e.message));
        api(`/patients/${patientId}/messages`).then((d) => setMessages(d.messages)).catch(() => {});
    }, [patientId]);

    if (error) return <div className="card">{error}</div>;
    if (!state) return <div className="text-slate-400">Preparing report…</div>;

    const { patient, assessments, followUps = [], notes = [] } = state;
    const a = assessments.find((x) => x.id === Number(assessmentId)) || assessments[0];
    if (!a) return <div className="card">No assessment to print.</div>;
    const r = a.result;
    const d = a.data;
    const fu = followUps.filter((f) => f.assessment_id === a.id).reverse();

    const doPrint = () => {
        api(`/patients/${patientId}/print-log`, { method: 'POST', body: { detail: `assessment ${a.id}` } }).catch(() => {});
        window.print();
    };

    return (
        <div>
            <div className="no-print card !p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button className="btn-ghost !px-2" onClick={() => navigate(isPatient ? '/' : `/patients/${patientId}`)}><span className="icon-arrow-left"></span></button>
                    <div>
                        <div className="font-semibold">Printable report</div>
                        <div className="text-xs text-slate-500">Use Print → “Save as PDF” to upload into the patient's chart. Printing is recorded in the audit log.</div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                    {[['responses', 'All responses'], ...(!isPatient ? [['followUps', 'Follow-ups'], ['notes', 'Internal notes']] : []), ['messages', 'Messages']].map(([k, l]) => (
                        <label key={k} className="!mb-0 flex items-center gap-1.5 font-normal"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} />{l}</label>
                    ))}
                    <button className="btn-primary" onClick={doPrint}><span className="icon-printer"></span>Print / Save PDF</button>
                </div>
            </div>

            <article className="print-page bg-white mx-auto max-w-[8.5in] p-10 shadow-sm border border-slate-200 text-[13px] leading-snug text-slate-900">
                <header className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                    <div>
                        <div className="text-lg font-bold">Ashutosh Services</div>
                        <div className="text-xs text-slate-600">Risk Navigator – Patient Check-in & Risk Stratification Report</div>
                    </div>
                    <div className="text-right text-xs text-slate-600">
                        <div className="font-bold text-red-700 uppercase tracking-wide">Confidential – Protected Health Information</div>
                        <div>Generated {fmt(new Date())} by {user.name}</div>
                    </div>
                </header>

                <Block title="Patient">
                    <Grid rows={[
                        ['Name', patient.name], ['Date of birth', patient.dob || d.dob || '—'], ['MRN', patient.mrn || '—'],
                        ['Sex', d.sex || '—'], ['Phone', patient.phone || d.phone || '—'], ['Preferred language', d.preferredLanguage || '—'],
                        ['Preferred contact', [d.preferredContact, d.bestTime].filter(Boolean).join(', ') || '—'],
                        ['Care team', patient.staff.map((s) => `${s.name} (${ROLE_LABELS[s.role]})`).join(', ') || '—'],
                        ['Check-in date', fmt(a.created_at)], ['Entered by', `${a.submitted_by_name} (${ROLE_LABELS[a.submitted_by_role] || ''})`],
                        ...(!isPatient ? [['Reviewed', a.reviewed_at ? `${fmt(a.reviewed_at)} by ${a.reviewed_by_name}` : 'Not yet reviewed']] : []),
                    ]} />
                </Block>

                {!isPatient ? (
                    <Block title="Risk stratification">
                        <div className="flex items-baseline gap-4">
                            <div className="text-2xl font-bold">{r.tier}</div>
                            <div>Score {r.score} / {r.maxScore} · Recommended contact: <b>{r.followUp}</b> · Data completeness {r.completeness}%</div>
                        </div>
                        {r.floors.length > 0 && <div className="mt-1"><b>Safety escalations:</b> {r.floors.map((f) => `${f.reason} (≥ ${f.tier})`).join('; ')}</div>}
                        <table className="w-full mt-2 border-collapse">
                            <thead><tr className="border-b border-slate-300 text-left"><th className="py-1">Domain</th><th className="py-1">Findings</th><th className="py-1 text-right">Points</th></tr></thead>
                            <tbody>
                                {r.domains.filter((x) => x.factors.length || !x.assessed).map((x) => (
                                    <tr key={x.key} className="border-b border-slate-100 align-top">
                                        <td className="py-1 pr-3 whitespace-nowrap">{x.label}</td>
                                        <td className="py-1 pr-3">{x.assessed ? x.factors.map((f) => f.label).join('; ') : <i className="text-slate-500">Not answered</i>}</td>
                                        <td className="py-1 text-right tabular-nums">{x.assessed ? `${x.points}/${x.cap}` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-3 grid grid-cols-2 gap-6">
                            <div><b>Recommended actions</b><ul className="list-disc pl-5">{r.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                            {r.considerations.length > 0 && <div><b>Care considerations</b><ul className="list-disc pl-5">{r.considerations.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                        </div>
                    </Block>
                ) : (
                    <Block title="Summary"><p>{r.patientMessage}</p></Block>
                )}

                {a.patient_note && <Block title="Patient's note to care team"><p className="whitespace-pre-wrap">{a.patient_note}{d.wantsCallback ? ' (Requested call back)' : ''}</p></Block>}

                {opts.responses && (
                    <Block title="Patient-reported information">
                        <Grid rows={[
                            ['Feeling today', d.feelingToday || '—'], ['Urgent symptoms', label(URGENT_SYMPTOMS, d.urgentSymptoms)],
                            ['Blood pressure', d.bpSystolic && d.bpDiastolic ? `${d.bpSystolic}/${d.bpDiastolic} mmHg (${bpCategory(Number(d.bpSystolic), Number(d.bpDiastolic))})` : '—'],
                            ['Heart rate', v(d.heartRate, ' bpm')], ['SpO₂', v(d.spo2, '%')], ['Temperature', v(d.tempF, ' °F')],
                            ['Height / weight', `${d.heightFt ? `${d.heightFt}′${d.heightIn || 0}″` : '—'} / ${v(d.weightLb, ' lb')}`], ['BMI', v(bmi(d))],
                            ['Blood glucose', d.glucose ? `${d.glucose} mg/dL ${d.glucoseContext ? `(${d.glucoseContext})` : ''}` : '—'], ['HbA1c', v(d.hbA1c, '%')],
                            ['Conditions', [label(CONDITIONS, d.conditions), d.otherConditions].filter((x) => x && x !== '—').join('; ') || '—'],
                            ['Daily medications', v(d.medCount)], ['Medication adherence', { Good: 'Always/almost always', Fair: 'Sometimes misses', Poor: 'Often misses' }[d.medicationAdherence] || '—'],
                            ['Medication concerns', d.medicationConcerns || '—'],
                            ['ED visits (30 d)', v(d.edVisits30d)], ['Hospital stays (90 d)', v(d.hospitalizations90d)], ['Missed appts (6 mo)', v(d.missedAppointments)],
                            ['Needs help with (ADLs)', label(ADLS, d.adlHelp)], ['Mobility aid', d.mobilityAid || '—'],
                            ['Falls (12 mo)', d.falls12mo ? `${d.falls12mo}${d.fallInjury ? ' (with injury)' : ''}` : '—'],
                            ['Disabilities', label(DISABILITIES, d.disabilities)], ['Lives alone / caregiver', `${d.livesAlone || '—'} / ${d.hasCaregiver || '—'}`],
                            ['Physical activity', d.activityDays !== '' ? `${d.activityDays} days × ${d.activityMinutes || 0} min/week` : '—'], ['Sleep', v(d.sleepHours, ' h')],
                            ['Tobacco / vaping', `${d.tobacco || '—'}${d.vaping ? ' / vapes' : ''}`],
                            ['AUDIT-C', v(r.derived.auditC)], ['Drug use', d.drugUse || '—'],
                            ['PHQ-9', r.derived.phq9 !== null ? `${r.derived.phq9} (${PHQ9_BANDS(r.derived.phq9)}); item 9 = ${d.phq?.[8] ?? '—'}` : r.derived.phq2 !== null ? `PHQ-2 ${r.derived.phq2}` : '—'],
                            ['GAD-7', r.derived.gad7 !== null ? `${r.derived.gad7} (${GAD7_BANDS(r.derived.gad7)})` : '—'],
                            ['Pain', d.painHas === 'Yes' ? `${d.painLocation || 'site not given'}; PEG ${v(r.derived.peg)}; ${v(d.painWeeks, ' wks')}${d.painRestNight ? '; at rest/night' : ''}` : d.painHas || '—'],
                            ['Pain red flags', label(PAIN_RED_FLAGS, d.painRedFlags)],
                            ['Sexual health', d.sexActive === 'Yes' ? [`partners ${d.sexPartners || '—'}`, d.sexNewPartner && 'new partner', `condoms ${d.sexCondom || '—'}`, d.sexSti12mo === 'Yes' && 'STI past 12 mo', d.sexPregnancy, d.sexWantsTesting && 'requests testing'].filter(Boolean).join('; ') : d.sexActive || '—'],
                            ['Housing', d.sdohHousing || '—'], ['Food insecurity', d.sdohFood || '—'], ['Transportation barrier', d.sdohTransport || '—'],
                            ['Utilities', d.sdohUtilities || '—'], ['Financial strain', d.sdohFinancial || '—'], ['Loneliness', d.sdohLonely || '—'], ['Safety concern', d.sdohSafety || '—'],
                        ]} />
                    </Block>
                )}

                {!isPatient && opts.followUps && (
                    <Block title="Follow-up / outreach log">
                        {fu.length === 0 ? <p className="text-slate-500">No follow-ups recorded for this check-in.</p> : fu.map((f) => (
                            <div key={f.id} className="mb-2 pb-2 border-b border-slate-100">
                                <b>{ORDINAL(f.attempt_no)} follow-up</b> – {fmt(f.created_at)} – {f.method} – {f.reached ? 'Reached' : 'Not reached'} – {f.outcome}
                                <div className="text-slate-700">{[f.action_taken && `Action: ${f.action_taken}`, f.notes && `Notes: ${f.notes}`, f.next_step && `Next: ${f.next_step}${f.next_follow_up_date ? ` by ${f.next_follow_up_date}` : ''}`, f.ed_avoided && 'ED visit avoided'].filter(Boolean).join(' · ')}</div>
                                <div className="text-xs text-slate-500">{f.author_name} ({ROLE_LABELS[f.author_role]})</div>
                            </div>
                        ))}
                        <div>Case status: <b>{{ open: 'New', active: 'In progress', closed: 'Loop closed' }[patient.case_status]}</b></div>
                    </Block>
                )}

                {!isPatient && opts.notes && notes.length > 0 && (
                    <Block title="Internal clinical notes">
                        {notes.map((n) => <div key={n.id} className="mb-2"><span className="text-xs text-slate-500">{fmt(n.created_at)} – {n.author_name}:</span> <span className="whitespace-pre-wrap">{n.body}</span></div>)}
                    </Block>
                )}

                {opts.messages && messages.length > 0 && (
                    <Block title="Secure messages">
                        {messages.map((m) => <div key={m.id} className="mb-1.5"><span className="text-xs text-slate-500">{fmt(m.created_at)} – {m.sender_name} ({ROLE_LABELS[m.sender_role]}):</span> <span className="whitespace-pre-wrap">{m.body}</span></div>)}
                    </Block>
                )}

                {!isPatient && (
                    <div className="mt-8 grid grid-cols-2 gap-10 text-xs">
                        <div className="border-t border-slate-400 pt-1">Reviewer signature / credentials</div>
                        <div className="border-t border-slate-400 pt-1">Date</div>
                    </div>
                )}
                <footer className="mt-6 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                    Clinical decision support only – does not replace professional judgment. Scoring uses PHQ-9, GAD-7, AUDIT-C, PEG, ACC/AHA BP and ADA HbA1c cut-offs with
                    Charlson/LACE-adapted weights ({REFERENCES.length} references available in the app's Scoring Methodology page). Contains PHI – handle per HIPAA minimum-necessary policy.
                </footer>
            </article>
        </div>
    );
}

function Block({ title, children }) {
    return (
        <section className="mt-5 break-inside-avoid-page">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 border-b border-slate-300 mb-2 pb-0.5">{title}</h3>
            {children}
        </section>
    );
}

function Grid({ rows }) {
    return (
        <div className="grid grid-cols-2 gap-x-8">
            {rows.map(([k, val], i) => (
                <div key={i} className="flex gap-2 py-0.5 border-b border-slate-50">
                    <span className="text-slate-500 w-40 shrink-0">{k}</span><span className="flex-1">{val}</span>
                </div>
            ))}
        </div>
    );
}
