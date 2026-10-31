import React from 'react';
import { api, navigate, ROLE_LABELS } from '../api.js';
import PatientForm from '../components/PatientForm.jsx';
import RiskSummary from '../components/RiskSummary.jsx';
import RiskBadge, { RISK_STYLES, timeAgo, fmt } from '../components/RiskBadge.jsx';
import Messages from '../components/Messages.jsx';
import CareLoop, { StatusPill } from '../components/CareLoop.jsx';
import { Modal } from '../components/AddPatient.jsx';
import { useSocketEvents } from '../components/LiveStatus.jsx';
import { TIER_INFO } from '../../../shared/risk.js';

export default function PatientDetail({ id, user, push, tab: initialTab }) {
    const isPatient = user.role === 'patient';
    const [state, setState] = React.useState(null);
    const [error, setError] = React.useState('');
    const [tab, setTab] = React.useState(initialTab && initialTab !== 'invite' ? initialTab : (isPatient ? 'checkin' : 'overview'));
    const [inviting, setInviting] = React.useState(initialTab === 'invite' && !isPatient);
    const [saving, setSaving] = React.useState(false);
    const [formKey, setFormKey] = React.useState(0); // bump to reset form to latest saved data
    const [incoming, setIncoming] = React.useState(null);
    const [thanks, setThanks] = React.useState(null);
    const [editing, setEditing] = React.useState(false);

    const load = React.useCallback(async () => {
        try {
            setState(await api(`/patients/${id}`));
        } catch (e) {
            setError(e.message);
        }
    }, [id]);

    React.useEffect(() => { load(); }, [load]);

    useSocketEvents(['assessment:new', 'patients:changed', 'message:new'], (e) => {
        if (e?.patientId && e.patientId !== id) return;
        if (e?.assessmentId && e.submittedBy?.id !== user.id) setIncoming(e);
        load();
    });

    const save = async (data) => {
        setSaving(true);
        try {
            const r = await api(`/patients/${id}/assessments`, { method: 'POST', body: { data } });
            setIncoming(null);
            await load();
            setFormKey((k) => k + 1);
            if (isPatient) {
                setThanks(r.result);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                push({ title: 'Assessment saved', body: `${r.risk} · score ${r.score}`, risk: r.risk });
                setTab('overview');
            }
        } catch (e) {
            push({ error: true, title: 'Could not save', body: e.message });
        } finally {
            setSaving(false);
        }
    };

    const review = async () => {
        try {
            await api(`/patients/${id}/review`, { method: 'POST' });
            push({ title: 'Marked as reviewed' });
            load();
        } catch (e) { push({ error: true, title: e.message }); }
    };

    if (error) {
        return (
            <div className="card text-center">
                <p className="text-slate-600">{error}</p>
                {!isPatient && <button className="btn-ghost mt-4" onClick={() => navigate('/')}>Back to patients</button>}
            </div>
        );
    }
    if (!state) return <div className="text-slate-400">Loading…</div>;

    const { patient, assessments } = state;
    const latest = assessments[0];
    const initial = latest ? latest.data : { name: patient.name, dob: patient.dob || '', phone: patient.phone || '' };

    const tabs = isPatient
        ? [['checkin', 'Check in', 'icon-clipboard-pen'], ['messages', 'Messages', 'icon-messages-square', patient.unread], ['history', 'My history', 'icon-history']]
        : [['overview', 'Overview', 'icon-layout-dashboard'], ['loop', 'Follow-ups & notes', 'icon-phone-call'], ['messages', 'Messages', 'icon-messages-square', patient.unread], ['checkin', 'Assessment', 'icon-clipboard-pen'], ['history', 'History', 'icon-history']];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    {!isPatient && <button onClick={() => navigate('/')} className="btn-ghost !px-2" title="Back"><div className="icon-arrow-left"></div></button>}
                    <div className="min-w-0">
                        <h2 className="text-2xl flex items-center gap-3 flex-wrap">
                            {isPatient ? `Hi, ${patient.name.split(' ')[0]}` : patient.name}
                            {!isPatient && <RiskBadge risk={patient.latest_risk} score={patient.latest_score} />}
                            {!isPatient && <StatusPill status={patient.case_status} />}
                        </h2>
                        <p className="text-sm text-slate-500">
                            {!isPatient && <>{patient.dob ? `DOB ${patient.dob}` : 'DOB —'}{patient.mrn ? ` · MRN ${patient.mrn}` : ''}{patient.phone ? ` · ${patient.phone}` : ''} · </>}
                            {latest ? `Last check-in ${timeAgo(latest.created_at)}` : 'No check-in yet'}
                            {!isPatient && <> · {patient.login_email ? <span className="text-green-700">App access: {patient.login_email}</span> : patient.invite_pending ? <span className="text-amber-700">Invite sent, not joined yet</span> : <span className="text-slate-400">No app access yet</span>}</>}
                            {patient.staff.length > 0 && <> · Care team: {patient.staff.map((s) => `${s.name} (${ROLE_LABELS[s.role]})`).join(', ')}</>}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    {!isPatient && !patient.login_email && <button className="btn-primary" onClick={() => setInviting(true)}><span className="icon-send"></span>{patient.invite_pending ? 'New invite code' : 'Invite to app'}</button>}
                    {!isPatient && <button className="btn-ghost" onClick={() => setEditing(true)}><span className="icon-pencil"></span>Edit details</button>}
                    {latest && <button className="btn-ghost" onClick={() => navigate(`/patients/${id}/print`)}><span className="icon-printer"></span>Print / PDF</button>}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
                {tabs.map(([k, label, icon, badge]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`px-4 py-2 text-sm -mb-px border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === k ? 'border-[var(--primary)] text-[var(--primary-dark)] font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <span className={icon}></span>{label}
                        {badge > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">{badge}</span>}
                    </button>
                ))}
            </div>

            {incoming && tab === 'checkin' && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-sky-900"><div className="icon-bell-ring"></div>{incoming.submittedBy.name} just saved a new check-in.</span>
                    <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => { setIncoming(null); setFormKey((k) => k + 1); }}>Load latest</button>
                        <button className="btn-ghost" onClick={() => setIncoming(null)}>Dismiss</button>
                    </div>
                </div>
            )}

            {tab === 'overview' && !isPatient && <Overview state={state} onReview={review} goTo={setTab} />}
            {tab === 'loop' && !isPatient && <CareLoop state={state} reload={load} push={push} />}
            {tab === 'messages' && <Messages patientId={id} user={user} push={push} onRead={patient.unread ? load : undefined} />}
            {tab === 'checkin' && (
                <>
                    {isPatient && thanks && <PatientThanks result={thanks} onMessage={() => setTab('messages')} onClose={() => setThanks(null)} />}
                    {isPatient && !thanks && (
                        <div className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-4 py-3">
                            Update anything that has changed and press <b>Send to care team</b>. Your last answers are filled in for you. You can check in as often as you like.
                        </div>
                    )}
                    <PatientForm key={formKey} initial={initial} onSave={save} saving={saving} isPatient={isPatient} />
                </>
            )}
            {tab === 'history' && <History assessments={assessments} isPatient={isPatient} patientId={id} />}

            {inviting && <InvitePatient patient={patient} onClose={() => { setInviting(false); load(); }} push={push} />}
            {editing && <EditPatient patient={patient} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); push({ title: 'Details updated' }); }} push={push} />}
        </div>
    );
}

function Overview({ state, onReview, goTo }) {
    const { patient, assessments, followUps } = state;
    const latest = assessments[0];
    if (!latest) {
        return <div className="card text-center text-slate-500 py-10">No check-in yet. Ask the patient to complete one in the app, or enter it on the <b>Assessment</b> tab.</div>;
    }
    const prev = assessments[1];
    const lastFollowUp = followUps[0];
    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-4 gap-4">
                <Stat label="Last check-in" value={timeAgo(latest.created_at)} sub={`by ${latest.submitted_by_name}`} />
                <Stat label="Change since previous" value={prev ? `${prev.risk} → ${latest.risk}` : 'First check-in'} sub={prev ? `score ${prev.score} → ${latest.score}` : ''} />
                <Stat label="Contact window" value={TIER_INFO[latest.risk].followUp} sub={patient.overdue ? 'OVERDUE' : patient.contacted ? 'Contacted ✓' : patient.contactDueAt ? `due ${fmt(patient.contactDueAt)}` : ''} danger={patient.overdue} />
                <Stat label="Last follow-up" value={lastFollowUp ? lastFollowUp.outcome : 'None yet'} sub={lastFollowUp ? timeAgo(lastFollowUp.created_at) : ''} />
            </div>

            <div className={`rounded-lg border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${patient.needsReview ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <span className="text-sm flex items-center gap-2">
                    {patient.needsReview
                        ? <><span className="icon-eye text-amber-600"></span><b>New check-in needs review.</b> Review the summary below, then mark it reviewed.</>
                        : <><span className="icon-circle-check text-green-600"></span>Reviewed {timeAgo(latest.reviewed_at || patient.last_reviewed_at)} by {latest.reviewed_by_name || patient.last_reviewed_by_name}</>}
                </span>
                <div className="flex gap-2">
                    {patient.needsReview && <button className="btn-primary" onClick={onReview}><span className="icon-check"></span>Mark reviewed</button>}
                    <button className="btn-ghost" onClick={() => goTo('loop')}><span className="icon-phone-call"></span>Log follow-up</button>
                </div>
            </div>

            {latest.patient_note && (
                <div className="card !p-4 border-l-4 !border-l-amber-400">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><span className="icon-message-square"></span>Patient's note with this check-in</div>
                    <div className="text-slate-800 whitespace-pre-wrap">{latest.patient_note}</div>
                    {latest.data.wantsCallback && <div className="mt-2 text-sm font-medium text-amber-700">☎ Patient asked for a call back{latest.data.bestTime ? ` (best time: ${latest.data.bestTime})` : ''}</div>}
                    <button className="text-sm text-[var(--primary-dark)] mt-2" onClick={() => goTo('messages')}>Reply in messages →</button>
                </div>
            )}

            <RiskSummary result={latest.result} />
        </div>
    );
}

function Stat({ label, value, sub, danger }) {
    return (
        <div className={`card !p-4 ${danger ? '!border-red-300 !bg-red-50' : ''}`}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="font-semibold text-slate-900 mt-0.5 truncate">{value}</div>
            {sub && <div className={`text-xs mt-0.5 ${danger ? 'text-red-700 font-bold' : 'text-slate-500'}`}>{sub}</div>}
        </div>
    );
}

function PatientThanks({ result, onMessage, onClose }) {
    const s = RISK_STYLES[result.tier];
    return (
        <div className={`rounded-xl border ${s.panel} p-5`}>
            <div className="flex items-start gap-3">
                <span className={`icon-circle-check text-2xl ${s.text}`}></span>
                <div className="flex-1">
                    <div className="font-semibold text-slate-900 text-lg">Your check-in was sent to your care team</div>
                    <p className="text-slate-700 mt-1">{result.patientMessage}</p>
                    <div className="flex gap-2 mt-3">
                        <button className="btn-primary" onClick={onMessage}><span className="icon-messages-square"></span>Message my care team</button>
                        <button className="btn-ghost" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function History({ assessments, isPatient, patientId }) {
    const [open, setOpen] = React.useState(null);
    if (!assessments.length) return <div className="card text-slate-400 text-sm">No check-ins yet.</div>;
    return (
        <div className="card !p-0 overflow-hidden">
            <ul className="divide-y divide-slate-100">
                {assessments.map((a) => (
                    <li key={a.id}>
                        <button onClick={() => setOpen(open === a.id ? null : a.id)} className="w-full px-4 py-3 flex items-center justify-between gap-4 text-sm hover:bg-slate-50 text-left">
                            <div>
                                <div className="text-slate-800 font-medium">{fmt(a.created_at)}</div>
                                <div className="text-xs text-slate-500">
                                    by {a.submitted_by_name}{a.submitted_by_role ? ` (${ROLE_LABELS[a.submitted_by_role]})` : ''}
                                    {!isPatient && (a.reviewed_at ? ` · reviewed by ${a.reviewed_by_name}` : ' · not reviewed')}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {!isPatient && <RiskBadge risk={a.risk} score={a.score} />}
                                <span className="text-[var(--primary-dark)] text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/patients/${patientId}/print/${a.id}`); }}><span className="icon-printer"></span></span>
                                <span className={`icon-chevron-${open === a.id ? 'up' : 'down'} text-slate-400`}></span>
                            </div>
                        </button>
                        {open === a.id && (
                            <div className="px-4 pb-4">
                                {isPatient
                                    ? <p className="text-sm text-slate-600">{a.result?.patientMessage}</p>
                                    : <RiskSummary result={a.result} compact />}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function EditPatient({ patient, onClose, onSaved, push }) {
    const [f, setF] = React.useState({ name: patient.name, dob: patient.dob || '', mrn: patient.mrn || '', phone: patient.phone || '', caseStatus: patient.case_status });
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
    const submit = async (e) => {
        e.preventDefault();
        try {
            await api(`/patients/${patient.id}`, { method: 'PATCH', body: f });
            onSaved();
        } catch (err) { push({ error: true, title: err.message }); }
    };
    return (
        <Modal title="Patient details" onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <div><label>Name</label><input type="text" value={f.name} onChange={set('name')} required /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label>Date of birth</label><input type="date" value={f.dob} onChange={set('dob')} /></div>
                    <div><label>Phone</label><input type="text" value={f.phone} onChange={set('phone')} /></div>
                </div>
                <div><label>EMR medical record number (MRN)</label><input type="text" value={f.mrn} onChange={set('mrn')} placeholder="Links this patient to your EMR" /></div>
                <div><label>Case status</label>
                    <select value={f.caseStatus} onChange={set('caseStatus')}><option value="open">New</option><option value="active">In progress</option><option value="closed">Loop closed</option></select>
                </div>
                <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">Save</button></div>
            </form>
        </Modal>
    );
}

// Staff create a one-time invite code; the patient uses it to create an account with any email.
function InvitePatient({ patient, onClose, push }) {
    const [invite, setInvite] = React.useState(null);
    const [error, setError] = React.useState('');
    React.useEffect(() => {
        api(`/patients/${patient.id}/invite`, { method: 'POST' }).then(setInvite).catch((e) => setError(e.message));
    }, [patient.id]);
    const link = invite ? `${window.location.origin}/app/#/join/${invite.code}` : '';
    const message = invite
        ? `Hi ${patient.name.split(' ')[0]}, your care team at Ashutosh Services invites you to Risk Navigator to check in on your health and message us. Open ${link} and enter your date of birth to create your account (code ${invite.code}, valid until ${new Date(invite.expiresAt).toLocaleDateString()}).`
        : '';
    const copy = (text, what) => { navigator.clipboard?.writeText(text); push({ title: `${what} copied` }); };
    return (
        <Modal title={`Invite ${patient.name} to the app`} onClose={onClose}>
            {error && <div className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{error}</div>}
            {!invite && !error && <div className="text-slate-400 text-sm">Creating invite…</div>}
            {invite && (
                <div className="space-y-4 text-sm">
                    <p className="text-slate-600">Give this code to the patient by text, email, phone, or in person. They'll create their account with <b>their own email</b> and must also enter their date of birth{patient.dob ? '' : ' (add a DOB on Edit details for extra security)'}.</p>
                    <div className="text-center bg-sky-50 border border-sky-200 rounded-lg py-4">
                        <div className="text-xs text-slate-500">Invite code</div>
                        <div className="text-3xl font-bold tracking-widest text-slate-900 font-mono">{invite.code}</div>
                        <div className="text-xs text-slate-500 mt-1">Valid until {new Date(invite.expiresAt).toLocaleDateString()} · works once</div>
                    </div>
                    <div>
                        <label>Sign-up link</label>
                        <div className="flex gap-2"><input type="text" readOnly value={link} className="text-xs" /><button className="btn-ghost" onClick={() => copy(link, 'Link')}>Copy</button></div>
                    </div>
                    <div>
                        <label>Ready-to-send message</label>
                        <textarea readOnly rows={4} value={message} className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs" />
                        <button className="btn-primary mt-2" onClick={() => copy(message, 'Message')}><span className="icon-copy"></span>Copy message</button>
                    </div>
                    <p className="text-xs text-slate-400">Creating a new code cancels any earlier one. Codes are stored securely and can't be viewed again.</p>
                </div>
            )}
        </Modal>
    );
}
