import React from 'react';
import { api, navigate, ROLE_LABELS } from '../api.js';
import PatientForm from '../components/PatientForm.jsx';
import RiskBadge, { timeAgo } from '../components/RiskBadge.jsx';
import { useSocketEvents } from '../components/LiveStatus.jsx';

export default function PatientDetail({ id, user, push }) {
    const [state, setState] = React.useState(null);
    const [error, setError] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    // Bumping formKey re-mounts the form with the latest saved data.
    const [formKey, setFormKey] = React.useState(0);
    const [incoming, setIncoming] = React.useState(null);
    const [showHistory, setShowHistory] = React.useState(false);

    const load = React.useCallback(async (resetForm) => {
        try {
            const d = await api(`/patients/${id}`);
            setState(d);
            if (resetForm) setFormKey((k) => k + 1);
        } catch (e) {
            setError(e.message);
        }
    }, [id]);

    React.useEffect(() => { load(true); }, [load]);

    useSocketEvents(['assessment:new', 'patients:changed'], (e) => {
        if (e?.patientId && e.patientId !== id) return;
        if (e?.submittedBy && e.submittedBy.id !== user.id) {
            // Someone else saved this patient while we're looking: refresh history, offer to load it into the form.
            setIncoming(e);
            load(false);
        } else if (!e?.submittedBy) {
            load(false);
        }
    });

    const save = async (data) => {
        setSaving(true);
        try {
            const r = await api(`/patients/${id}/assessments`, { method: 'POST', body: { data } });
            push({ title: 'Assessment saved', body: `Risk: ${r.risk}${user.role === 'patient' ? ' · Your care team can see it now' : ''}`, risk: r.risk });
            setIncoming(null);
            await load(false);
        } catch (e) {
            push({ error: true, title: 'Could not save', body: e.message });
        } finally {
            setSaving(false);
        }
    };

    if (error) {
        return (
            <div className="card text-center">
                <p className="text-slate-600">{error}</p>
                {user.role !== 'patient' && <button className="btn-ghost mt-4" onClick={() => navigate('/')}>Back to patients</button>}
            </div>
        );
    }
    if (!state) return <div className="text-slate-400">Loading…</div>;

    const { patient, assessments } = state;
    const latest = assessments[0];
    const initial = latest ? latest.data : { name: patient.name, dob: patient.dob || '', age: ageFrom(patient.dob) };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {user.role !== 'patient' && (
                        <button onClick={() => navigate('/')} className="btn-ghost !px-2" title="Back"><div className="icon-arrow-left"></div></button>
                    )}
                    <div>
                        <h2 className="text-2xl flex items-center gap-3 flex-wrap">
                            {user.role === 'patient' ? 'My Health Assessment' : patient.name}
                            <RiskBadge risk={patient.latest_risk} />
                        </h2>
                        <p className="text-sm text-slate-500">
                            {latest ? `Last updated ${timeAgo(latest.created_at)} by ${latest.submitted_by_name || 'unknown'}` : 'No assessment saved yet.'}
                            {patient.staff.length > 0 && <> · Care team: {patient.staff.map((s) => `${s.name} (${ROLE_LABELS[s.role]})`).join(', ')}</>}
                        </p>
                    </div>
                </div>
                <button className="btn-ghost" onClick={() => setShowHistory((s) => !s)}>
                    <div className="icon-history"></div>History ({assessments.length})
                </button>
            </div>

            {incoming && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-sky-900">
                        <div className="icon-bell-ring"></div>
                        {incoming.submittedBy.name} ({ROLE_LABELS[incoming.submittedBy.role]}) just saved a new assessment: <b>{incoming.risk}</b>
                    </span>
                    <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => { setIncoming(null); setFormKey((k) => k + 1); }}>Load latest</button>
                        <button className="btn-ghost" onClick={() => setIncoming(null)}>Dismiss</button>
                    </div>
                </div>
            )}

            {showHistory && <History assessments={assessments} />}

            <PatientForm key={formKey} initial={initial} onSave={save} saving={saving} savedAt={latest?.created_at} />
        </div>
    );
}

function History({ assessments }) {
    if (assessments.length === 0) return <div className="card text-slate-400 text-sm">No saved assessments yet.</div>;
    return (
        <div className="card !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 font-medium text-slate-800">Assessment history</div>
            <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {assessments.map((a) => (
                    <li key={a.id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
                        <div>
                            <div className="text-slate-800">{new Date(a.created_at).toLocaleString()}</div>
                            <div className="text-xs text-slate-500">by {a.submitted_by_name || 'unknown'}{a.submitted_by_role ? ` (${ROLE_LABELS[a.submitted_by_role]})` : ''}</div>
                        </div>
                        <RiskBadge risk={a.risk} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ageFrom(dob) {
    if (!dob) return '';
    const d = new Date(dob);
    const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
    return age;
}
