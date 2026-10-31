import React from 'react';
import { api, navigate, ROLE_LABELS } from '../api.js';
import RiskBadge, { RISK_STYLES, timeAgo } from '../components/RiskBadge.jsx';
import { useSocketEvents } from '../components/LiveStatus.jsx';
import { StatusPill } from '../components/CareLoop.jsx';
import AddPatient from '../components/AddPatient.jsx';
import { TIERS } from '../../../shared/risk.js';

const LEVELS = [...TIERS].reverse(); // Critical first

const QUEUES = [
    ['all', 'All patients', () => true],
    ['overdue', 'Overdue outreach', (p) => p.overdue],
    ['review', 'Needs review', (p) => p.needsReview],
    ['messages', 'Unread messages', (p) => p.unread > 0],
    ['due', 'Follow-up due', (p) => p.followUpDue],
    ['open', 'Open cases', (p) => p.case_status !== 'closed'],
];

export default function Dashboard({ user, push }) {
    const [patients, setPatients] = React.useState(null);
    const [metrics, setMetrics] = React.useState(null);
    const [tier, setTier] = React.useState('All');
    const [queue, setQueue] = React.useState('all');
    const [search, setSearch] = React.useState('');
    const [showAdd, setShowAdd] = React.useState(false);
    const [flash, setFlash] = React.useState({});

    const load = React.useCallback(() => {
        api('/patients').then((d) => setPatients(d.patients)).catch((e) => push({ error: true, title: e.message }));
        api('/metrics').then(setMetrics).catch(() => {});
    }, [push]);

    React.useEffect(load, [load]);

    useSocketEvents(['assessment:new', 'patients:changed', 'message:new'], (e) => {
        load();
        if (e?.patientId) {
            setFlash((f) => ({ ...f, [e.patientId]: true }));
            setTimeout(() => setFlash((f) => ({ ...f, [e.patientId]: false })), 4000);
        }
    });

    if (!patients) return <div className="text-slate-400">Loading patients…</div>;

    const queueFn = QUEUES.find((q) => q[0] === queue)[2];
    const shown = patients
        .filter(queueFn)
        .filter((p) => tier === 'All' || (tier === 'None' ? !p.latest_risk : p.latest_risk === tier))
        .filter((p) => !search || `${p.name} ${p.mrn || ''}`.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h2 className="text-2xl">{user.role === 'admin' ? 'All patients' : 'My patients'}</h2>
                    <p className="text-sm text-slate-500">
                        {user.role === 'admin' ? 'Every patient in the program.' : `Patients assigned to you as ${ROLE_LABELS[user.role]}.`} Updates appear live.
                    </p>
                </div>
                <button className="btn-primary" onClick={() => setShowAdd(true)}><div className="icon-user-plus"></div>Add patient</button>
            </div>

            {metrics && !metrics.empty && <Outcomes m={metrics} />}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {LEVELS.map((l) => {
                    const count = patients.filter((p) => p.latest_risk === l).length;
                    return (
                        <button key={l} onClick={() => setTier(tier === l ? 'All' : l)}
                            className={`card !p-3 text-left transition-all ${tier === l ? 'ring-2' : 'hover:shadow-md'}`}
                            style={tier === l ? { '--tw-ring-color': RISK_STYLES[l].color } : undefined}>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500"><div className={RISK_STYLES[l].icon} style={{ color: RISK_STYLES[l].color }}></div>{l}</div>
                            <div className="text-2xl font-bold text-slate-900">{count}</div>
                        </button>
                    );
                })}
            </div>

            <div className="card !p-0 overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
                    <div className="flex gap-1 overflow-x-auto">
                        {QUEUES.map(([k, label, fn]) => {
                            const n = patients.filter(fn).length;
                            return (
                                <button key={k} onClick={() => setQueue(k)}
                                    className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${queue === k ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    {label}{k !== 'all' && n > 0 && <span className={`ml-1.5 text-xs rounded-full px-1.5 ${k === 'overdue' ? 'bg-red-500 text-white' : queue === k ? 'bg-white/20' : 'bg-slate-200'}`}>{n}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <input type="text" placeholder="Search name or MRN…" value={search} onChange={(e) => setSearch(e.target.value)} className="lg:!w-64 !py-1.5" />
                </div>
                {shown.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">
                        {patients.length === 0 ? (user.role === 'admin' ? 'No patients yet.' : 'No patients are assigned to you yet.') : 'Nothing in this list.'}
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {shown.map((p) => (
                            <li key={p.id}>
                                <button onClick={() => navigate(`/patients/${p.id}`)}
                                    className={`w-full text-left px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 hover:bg-slate-50 transition-colors duration-700 ${flash[p.id] ? 'bg-sky-50' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                                            {p.name}
                                            {p.mrn && <span className="text-xs text-slate-400 font-normal">MRN {p.mrn}</span>}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate">
                                            {p.staff.length ? p.staff.map((s) => s.name).join(', ') : 'No care team'}
                                            {p.last_contact_at && <> · Last contact {timeAgo(p.last_contact_at)}</>}
                                            {p.attempts_on_latest > 0 && <> · {p.attempts_on_latest} attempt{p.attempts_on_latest > 1 ? 's' : ''}</>}
                                            {!p.login_email && <> · {p.invite_pending ? 'Invited' : 'No app access'}</>}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                        {p.overdue && <Flag cls="bg-red-100 text-red-800" icon="icon-alarm-clock">Overdue</Flag>}
                                        {p.needsReview && <Flag cls="bg-amber-100 text-amber-800" icon="icon-eye">Review</Flag>}
                                        {p.unread > 0 && <Flag cls="bg-sky-100 text-sky-800" icon="icon-message-square">{p.unread}</Flag>}
                                        {p.followUpDue && <Flag cls="bg-violet-100 text-violet-800" icon="icon-calendar-clock">F/U due</Flag>}
                                        <StatusPill status={p.case_status} />
                                        <span className="text-xs text-slate-400 w-20 md:text-right">{timeAgo(p.latest_assessment_at)}</span>
                                        <div className="w-32 md:text-right"><RiskBadge risk={p.latest_risk} score={p.latest_score} /></div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {showAdd && <AddPatient onClose={() => setShowAdd(false)} onCreated={(id) => { setShowAdd(false); push({ title: 'Patient added' }); navigate(`/patients/${id}/invite`); }} />}
        </div>
    );
}

function Flag({ cls, icon, children }) {
    return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}><span className={icon}></span>{children}</span>;
}

// Program outcomes tied to the goal: active follow-up, fewer ED visits, lower cost of care.
function Outcomes({ m }) {
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
    const ed = m.edTrend;
    const edChange = ed && ed.baseline ? Math.round(((ed.latest - ed.baseline) / ed.baseline) * 100) : null;
    const tiles = [
        { label: 'High/Critical contacted within window', value: pct(m.highRiskContactedWithinSla, m.highRiskAssessments90d), sub: `${m.highRiskContactedWithinSla} of ${m.highRiskAssessments90d} (90 d)`, icon: 'icon-timer' },
        { label: 'Median time to first outreach', value: m.medianHoursToContact !== null ? `${m.medianHoursToContact} h` : '—', sub: 'High/Critical, 90 d', icon: 'icon-clock' },
        { label: 'Patient reach rate', value: m.reachRate !== null ? `${m.reachRate}%` : '—', sub: `${m.followUps90d} outreach attempts (90 d)`, icon: 'icon-phone-call' },
        { label: 'Self-reported ED visits', value: edChange !== null ? `${edChange > 0 ? '+' : ''}${edChange}%` : '—', sub: ed ? `${ed.baseline} → ${ed.latest} (first vs latest check-in, ${ed.patients} pts)` : 'Needs 2+ check-ins per patient', icon: 'icon-hospital', good: edChange !== null && edChange < 0 },
        { label: 'ED visits avoided by outreach', value: m.edAvoided90d, sub: 'Logged by care team (90 d)', icon: 'icon-shield-check' },
        { label: 'Loops closed', value: m.closedCases, sub: `${m.openCases} open · ${m.checkIns30d} check-ins (30 d)`, icon: 'icon-circle-check' },
    ];
    return (
        <div className="card !p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><span className="icon-trending-down text-[var(--primary)]"></span>Program outcomes</h3>
                <span className="text-xs text-slate-400">Active follow-up · ED reduction · cost of care</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                {tiles.map((t) => (
                    <div key={t.label} className="rounded-lg bg-slate-50 p-3">
                        <div className="text-[11px] text-slate-500 leading-tight flex gap-1"><span className={`${t.icon} shrink-0`}></span>{t.label}</div>
                        <div className={`text-xl font-bold mt-1 ${t.good ? 'text-green-600' : 'text-slate-900'}`}>{t.value}</div>
                        <div className="text-[11px] text-slate-400 leading-tight">{t.sub}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
