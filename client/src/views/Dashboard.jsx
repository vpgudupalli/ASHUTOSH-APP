import React from 'react';
import { api, navigate, ROLE_LABELS } from '../api.js';
import RiskBadge, { RISK_STYLES, timeAgo } from '../components/RiskBadge.jsx';
import { useSocketEvents } from '../components/LiveStatus.jsx';
import AddPatient from '../components/AddPatient.jsx';

const LEVELS = ['Critical', 'High Risk', 'Rising Risk', 'Stable'];

export default function Dashboard({ user, push }) {
    const [patients, setPatients] = React.useState(null);
    const [filter, setFilter] = React.useState('All');
    const [search, setSearch] = React.useState('');
    const [showAdd, setShowAdd] = React.useState(false);
    const [flash, setFlash] = React.useState({}); // patientId -> true while highlighted

    const load = React.useCallback(() => {
        api('/patients').then((d) => setPatients(d.patients)).catch((e) => push({ error: true, title: e.message }));
    }, [push]);

    React.useEffect(load, [load]);

    useSocketEvents(['assessment:new', 'patients:changed'], (e) => {
        load();
        if (e?.patientId) {
            setFlash((f) => ({ ...f, [e.patientId]: true }));
            setTimeout(() => setFlash((f) => ({ ...f, [e.patientId]: false })), 4000);
        }
    });

    if (!patients) return <div className="text-slate-400">Loading patients…</div>;

    const counts = Object.fromEntries(LEVELS.map((l) => [l, patients.filter((p) => p.latest_risk === l).length]));
    const shown = patients
        .filter((p) => filter === 'All' || (filter === 'None' ? !p.latest_risk : p.latest_risk === filter))
        .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl">{user.role === 'admin' ? 'All patients' : 'My patients'}</h2>
                    <p className="text-sm text-slate-500">
                        {user.role === 'admin'
                            ? 'Every patient in the system. Assign care teams from the Admin page.'
                            : `Patients assigned to you as ${ROLE_LABELS[user.role]}. Updates appear here live.`}
                    </p>
                </div>
                <button className="btn-primary" onClick={() => setShowAdd(true)}>
                    <div className="icon-user-plus"></div>Add patient
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {LEVELS.map((l) => (
                    <button
                        key={l}
                        onClick={() => setFilter(filter === l ? 'All' : l)}
                        className={`card !p-4 text-left transition-all ${filter === l ? 'ring-2' : 'hover:shadow-md'}`}
                        style={filter === l ? { '--tw-ring-color': RISK_STYLES[l].color } : undefined}
                    >
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <div className={RISK_STYLES[l].icon} style={{ color: RISK_STYLES[l].color }}></div>{l}
                        </div>
                        <div className="text-3xl font-bold text-slate-900 mt-1">{counts[l]}</div>
                    </button>
                ))}
            </div>

            <div className="card !p-0 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                    <input type="text" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:!w-72" />
                    <div className="text-sm text-slate-500">
                        {filter !== 'All' && <button className="mr-3 text-[var(--primary-dark)]" onClick={() => setFilter('All')}>Clear filter</button>}
                        {shown.length} of {patients.length} patients
                    </div>
                </div>
                {shown.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">
                        {patients.length === 0
                            ? (user.role === 'admin' ? 'No patients yet.' : 'No patients are assigned to you yet.')
                            : 'No patients match.'}
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {shown.map((p) => (
                            <li key={p.id}>
                                <button
                                    onClick={() => navigate(`/patients/${p.id}`)}
                                    className={`w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-slate-50 transition-colors duration-700 ${flash[p.id] ? 'bg-sky-50' : ''}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-slate-900 truncate">{p.name}</div>
                                        <div className="text-xs text-slate-500 truncate">
                                            {p.dob ? `DOB ${p.dob}` : 'DOB not set'}
                                            {p.staff.length > 0 && <> · Care team: {p.staff.map((s) => s.name).join(', ')}</>}
                                            {!p.login_email && <> · No patient login</>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 sm:justify-end">
                                        <span className="text-xs text-slate-400 w-24 sm:text-right">{timeAgo(p.latest_assessment_at)}</span>
                                        <div className="w-32 sm:text-right"><RiskBadge risk={p.latest_risk} /></div>
                                        <div className="icon-chevron-right text-slate-300 hidden sm:block"></div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {showAdd && (
                <AddPatient
                    onClose={() => setShowAdd(false)}
                    onCreated={(id) => { setShowAdd(false); push({ title: 'Patient added' }); navigate(`/patients/${id}`); }}
                />
            )}
        </div>
    );
}
