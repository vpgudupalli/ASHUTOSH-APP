import React from 'react';
import { api, ROLE_LABELS } from '../api.js';
import { fmt } from './RiskBadge.jsx';

export const ORDINAL = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Staff-only: outreach attempts (1st, 2nd, 3rd follow-up…) and internal clinical notes.
export default function CareLoop({ state, reload, push }) {
    const { patient, followUps, notes, options } = state;
    const latestId = patient.latest_assessment_id;
    const onLatest = followUps.filter((f) => f.assessment_id === latestId);
    const nextAttempt = onLatest.length + 1;

    return (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
            <div className="space-y-6">
                <div className="card">
                    <div className="section-title">
                        <span className="icon-phone-call text-[var(--primary)]"></span>
                        <h3 className="flex-1">Follow-up log</h3>
                        <StatusPill status={patient.case_status} />
                    </div>
                    <LoopStatus patient={patient} attempts={onLatest} />
                    {followUps.length === 0 ? (
                        <p className="text-sm text-slate-400 mt-4">No follow-ups recorded yet.</p>
                    ) : (
                        <ol className="mt-4 relative border-l-2 border-slate-100 ml-2 space-y-5">
                            {followUps.map((f) => (
                                <li key={f.id} className="ml-5">
                                    <span className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white ${f.reached ? 'bg-green-500' : 'bg-amber-400'}`}></span>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                        <span className="font-semibold text-slate-900">{ORDINAL(f.attempt_no)} follow-up</span>
                                        <span className="text-slate-400">·</span>
                                        <span className="text-slate-600">{f.method}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${f.reached ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{f.reached ? 'Reached patient' : 'Not reached'}</span>
                                        {f.ed_avoided && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">ED visit avoided</span>}
                                        {f.assessment_id !== latestId && <span className="text-xs text-slate-400">(earlier check-in)</span>}
                                    </div>
                                    <div className="text-xs text-slate-500">{fmt(f.created_at)} by {f.author_name} ({ROLE_LABELS[f.author_role]})</div>
                                    <div className="text-sm mt-1.5 space-y-1 text-slate-700">
                                        <div><b>Outcome:</b> {f.outcome}</div>
                                        {f.action_taken && <div><b>What was done:</b> {f.action_taken}</div>}
                                        {f.notes && <div className="whitespace-pre-wrap"><b>Notes:</b> {f.notes}</div>}
                                        {(f.next_step || f.next_follow_up_date) && <div><b>Next:</b> {f.next_step}{f.next_follow_up_date ? ` (by ${f.next_follow_up_date})` : ''}</div>}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
                <NotesCard patientId={patient.id} notes={notes} reload={reload} push={push} />
            </div>
            <FollowUpForm patientId={patient.id} attempt={nextAttempt} options={options} reload={reload} push={push} caseStatus={patient.case_status} />
        </div>
    );
}

function LoopStatus({ patient, attempts }) {
    if (!patient.latest_assessment_id) return <p className="text-sm text-slate-500">Waiting for the patient's first check-in.</p>;
    const reached = attempts.some((a) => a.reached);
    const steps = [
        { label: 'Check-in received', done: true },
        { label: 'Reviewed', done: !patient.needsReview },
        { label: 'Outreach attempted', done: attempts.length > 0 },
        { label: 'Patient reached', done: reached },
        { label: 'Loop closed', done: patient.case_status === 'closed' },
    ];
    return (
        <div>
            <div className="flex items-center gap-1">
                {steps.map((s, i) => (
                    <React.Fragment key={s.label}>
                        <div className="flex flex-col items-center text-center w-16 sm:w-20">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${s.done ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {s.done ? <span className="icon-check"></span> : i + 1}
                            </div>
                            <div className={`text-[11px] mt-1 leading-tight ${s.done ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</div>
                        </div>
                        {i < steps.length - 1 && <div className={`flex-1 h-0.5 -mt-5 ${steps[i + 1].done ? 'bg-green-400' : 'bg-slate-200'}`}></div>}
                    </React.Fragment>
                ))}
            </div>
            {patient.overdue && (
                <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 flex items-center gap-2">
                    <span className="icon-alarm-clock"></span>Outreach overdue – {patient.latest_risk} risk patients should be contacted within the response window (due {fmt(patient.contactDueAt)}).
                </div>
            )}
            {!patient.overdue && patient.contactDueAt && !patient.contacted && patient.case_status !== 'closed' && (
                <div className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-md px-3 py-2">First outreach due by {fmt(patient.contactDueAt)}.</div>
            )}
        </div>
    );
}

export function StatusPill({ status }) {
    const map = { open: ['New', 'bg-sky-100 text-sky-800'], active: ['In progress', 'bg-amber-100 text-amber-800'], closed: ['Loop closed', 'bg-green-100 text-green-800'] };
    const [label, cls] = map[status] || map.open;
    return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cls}`}>{label}</span>;
}

const EMPTY = { method: '', reached: false, outcome: '', actionTaken: '', notes: '', nextStep: '', nextFollowUpDate: '', edAvoided: false, closeCase: false };

function FollowUpForm({ patientId, attempt, options, reload, push, caseStatus }) {
    const [f, setF] = React.useState(EMPTY);
    const [busy, setBusy] = React.useState(false);
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await api(`/patients/${patientId}/follow-ups`, { method: 'POST', body: f });
            push({ title: `${ORDINAL(r.attempt)} follow-up recorded` });
            setF(EMPTY);
            reload();
        } catch (err) {
            push({ error: true, title: err.message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="card space-y-4 lg:sticky lg:top-24">
            <div className="section-title !mb-0"><span className="icon-circle-plus text-[var(--primary)]"></span><h3>Record {ORDINAL(attempt)} follow-up</h3></div>
            <div><label>How did you contact the patient?</label>
                <select value={f.method} onChange={set('method')} required><option value="">Choose…</option>{options.methods.map((m) => <option key={m}>{m}</option>)}</select>
            </div>
            <label className="!mb-0 flex items-center gap-2 font-normal"><input type="checkbox" checked={f.reached} onChange={set('reached')} />I was able to reach the patient</label>
            <div><label>Outcome / result</label>
                <select value={f.outcome} onChange={set('outcome')} required><option value="">Choose…</option>{options.outcomes.map((m) => <option key={m}>{m}</option>)}</select>
            </div>
            <div><label>What did you do?</label><textarea rows={2} value={f.actionTaken} onChange={set('actionTaken')} placeholder="e.g. reviewed meds, scheduled visit 11/4, sent food bank referral" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label>Notes</label><textarea rows={3} value={f.notes} onChange={set('notes')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                <div><label>Next step</label><input type="text" value={f.nextStep} onChange={set('nextStep')} placeholder="e.g. call after cardiology visit" /></div>
                <div><label>Next follow-up date</label><input type="date" value={f.nextFollowUpDate} onChange={set('nextFollowUpDate')} /></div>
            </div>
            <label className="!mb-0 flex items-center gap-2 font-normal text-sm"><input type="checkbox" checked={f.edAvoided} onChange={set('edAvoided')} />This outreach helped avoid an ED visit</label>
            <label className="!mb-0 flex items-center gap-2 font-normal text-sm"><input type="checkbox" checked={f.closeCase} onChange={set('closeCase')} />Close the loop (no further action needed)</label>
            {caseStatus === 'closed' && <p className="text-xs text-slate-500">This case is closed. A new follow-up will reopen it unless you close it again.</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Save follow-up'}</button>
        </form>
    );
}

function NotesCard({ patientId, notes, reload, push }) {
    const [text, setText] = React.useState('');
    const add = async (e) => {
        e.preventDefault();
        try {
            await api(`/patients/${patientId}/notes`, { method: 'POST', body: { body: text } });
            setText('');
            reload();
        } catch (err) {
            push({ error: true, title: err.message });
        }
    };
    return (
        <div className="card">
            <div className="section-title"><span className="icon-notebook-pen text-[var(--primary)]"></span><h3 className="flex-1">Clinical notes</h3><span className="text-xs font-normal text-slate-400 flex items-center gap-1"><span className="icon-eye-off"></span>Care team only</span></div>
            <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-4">
                <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an internal note (not visible to the patient)…" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <button type="submit" className="btn-primary sm:self-end" disabled={!text.trim()}>Add note</button>
            </form>
            {notes.length === 0 ? <p className="text-sm text-slate-400">No notes yet.</p> : (
                <ul className="space-y-3">
                    {notes.map((n) => (
                        <li key={n.id} className="text-sm border-l-2 border-slate-200 pl-3">
                            <div className="text-xs text-slate-500">{fmt(n.created_at)} · {n.author_name} ({ROLE_LABELS[n.author_role]})</div>
                            <div className="whitespace-pre-wrap text-slate-800">{n.body}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
