import React from 'react';
import { api, ROLE_LABELS } from '../api.js';
import RiskBadge from '../components/RiskBadge.jsx';
import { Modal } from '../components/AddPatient.jsx';
import { useSocketEvents } from '../components/LiveStatus.jsx';

const STAFF_ROLES = ['provider', 'np', 'case_manager', 'admin'];

export default function AdminPanel({ push }) {
    const [tab, setTab] = React.useState('assign');
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl">Administration</h2>
                <p className="text-sm text-slate-500">Manage staff accounts and assign care teams to patients.</p>
            </div>
            <div className="flex gap-1 border-b border-slate-200">
                {[['assign', 'Care team assignments'], ['users', 'Users']].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setTab(k)}
                        className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-[var(--primary)] text-[var(--primary-dark)] font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'assign' ? <Assignments push={push} /> : <Users push={push} />}
        </div>
    );
}

function Assignments({ push }) {
    const [patients, setPatients] = React.useState([]);
    const [staff, setStaff] = React.useState([]);
    const [pick, setPick] = React.useState({}); // patientId -> staffId

    const load = React.useCallback(() => {
        Promise.all([api('/patients'), api('/staff')])
            .then(([p, s]) => { setPatients(p.patients); setStaff(s.staff); })
            .catch((e) => push({ error: true, title: e.message }));
    }, [push]);
    React.useEffect(load, [load]);
    useSocketEvents(['patients:changed', 'assessment:new'], load);

    const assign = async (patientId) => {
        const staffId = pick[patientId];
        if (!staffId) return;
        try {
            await api(`/patients/${patientId}/assignments`, { method: 'POST', body: { staffId: Number(staffId) } });
            setPick((p) => ({ ...p, [patientId]: '' }));
            load();
        } catch (e) { push({ error: true, title: e.message }); }
    };
    const unassign = async (patientId, staffId) => {
        try {
            await api(`/patients/${patientId}/assignments/${staffId}`, { method: 'DELETE' });
            load();
        } catch (e) { push({ error: true, title: e.message }); }
    };

    if (staff.length === 0) {
        return <div className="card text-sm text-slate-500">Create provider, NP or case manager accounts on the <b>Users</b> tab first, then assign them to patients here.</div>;
    }

    return (
        <div className="card !p-0 overflow-hidden">
            {patients.length === 0 && <div className="p-8 text-center text-slate-400">No patients yet.</div>}
            <ul className="divide-y divide-slate-100">
                {patients.map((p) => {
                    const available = staff.filter((s) => !p.staff.some((x) => x.id === s.id));
                    return (
                        <li key={p.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                            <div className="lg:w-64">
                                <div className="font-medium text-slate-900">{p.name}</div>
                                <div className="mt-1"><RiskBadge risk={p.latest_risk} /></div>
                            </div>
                            <div className="flex-1 flex flex-wrap gap-2">
                                {p.staff.length === 0 && <span className="text-sm text-slate-400">No care team assigned</span>}
                                {p.staff.map((s) => (
                                    <span key={s.id} className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-900 text-xs px-2.5 py-1 rounded-full">
                                        {s.name} · {ROLE_LABELS[s.role]}
                                        <button onClick={() => unassign(p.id, s.id)} title="Remove" className="text-sky-400 hover:text-red-600"><div className="icon-x"></div></button>
                                    </span>
                                ))}
                            </div>
                            {available.length > 0 && (
                                <div className="flex gap-2 lg:w-80">
                                    <select value={pick[p.id] || ''} onChange={(e) => setPick((x) => ({ ...x, [p.id]: e.target.value }))} className="!py-1.5 text-sm">
                                        <option value="">Assign staff…</option>
                                        {available.map((s) => <option key={s.id} value={s.id}>{s.name} ({ROLE_LABELS[s.role]})</option>)}
                                    </select>
                                    <button className="btn-primary" disabled={!pick[p.id]} onClick={() => assign(p.id)}>Add</button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Users({ push }) {
    const [users, setUsers] = React.useState([]);
    const [creating, setCreating] = React.useState(false);
    const [resetting, setResetting] = React.useState(null);

    const load = React.useCallback(() => {
        api('/users').then((d) => setUsers(d.users)).catch((e) => push({ error: true, title: e.message }));
    }, [push]);
    React.useEffect(load, [load]);

    const update = async (id, body, msg) => {
        try {
            await api(`/users/${id}`, { method: 'PATCH', body });
            push({ title: msg });
            load();
        } catch (e) { push({ error: true, title: e.message }); }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button className="btn-primary" onClick={() => setCreating(true)}><div className="icon-user-plus"></div>New staff account</button>
            </div>
            <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                            <th className="px-4 py-2 font-medium">Name</th>
                            <th className="px-4 py-2 font-medium">Email</th>
                            <th className="px-4 py-2 font-medium">Role</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {users.map((u) => (
                            <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                                <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                                <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                                <td className="px-4 py-2.5">
                                    {u.role === 'patient' ? ROLE_LABELS.patient : (
                                        <select value={u.role} onChange={(e) => update(u.id, { role: e.target.value }, 'Role updated')} className="!py-1 !px-2 text-sm !w-auto">
                                            {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                        </select>
                                    )}
                                </td>
                                <td className="px-4 py-2.5">{u.active ? 'Active' : 'Disabled'}</td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                    <button className="text-[var(--primary-dark)] mr-3" onClick={() => setResetting(u)}>Reset password</button>
                                    <button className={u.active ? 'text-red-600' : 'text-green-700'} onClick={() => update(u.id, { active: !u.active }, u.active ? 'Account disabled' : 'Account enabled')}>
                                        {u.active ? 'Disable' : 'Enable'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {creating && <NewStaff onClose={() => setCreating(false)} onDone={() => { setCreating(false); push({ title: 'Account created' }); load(); }} />}
            {resetting && (
                <ResetPassword
                    user={resetting}
                    onClose={() => setResetting(null)}
                    onSave={(password) => { update(resetting.id, { password }, 'Password reset'); setResetting(null); }}
                />
            )}
        </div>
    );
}

function NewStaff({ onClose, onDone }) {
    const [form, setForm] = React.useState({ name: '', email: '', role: 'provider', password: '' });
    const [error, setError] = React.useState('');
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const submit = async (e) => {
        e.preventDefault();
        try {
            await api('/users', { method: 'POST', body: form });
            onDone();
        } catch (err) { setError(err.message); }
    };
    return (
        <Modal title="New staff account" onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <div><label>Full name</label><input type="text" value={form.name} onChange={set('name')} required /></div>
                <div><label>Email</label><input type="email" value={form.email} onChange={set('email')} required /></div>
                <div>
                    <label>Role</label>
                    <select value={form.role} onChange={set('role')}>
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                </div>
                <div>
                    <label>Temporary password</label>
                    <input type="text" value={form.password} onChange={set('password')} minLength={8} required />
                    <p className="text-xs text-slate-400 mt-1">Share this with them securely. At least 8 characters.</p>
                </div>
                {error && <div className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{error}</div>}
                <div className="flex justify-end gap-2">
                    <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn-primary">Create</button>
                </div>
            </form>
        </Modal>
    );
}

function ResetPassword({ user, onClose, onSave }) {
    const [pw, setPw] = React.useState('');
    return (
        <Modal title={`Reset password for ${user.name}`} onClose={onClose}>
            <form onSubmit={(e) => { e.preventDefault(); onSave(pw); }} className="space-y-4">
                <div><label>New password</label><input type="text" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required /></div>
                <div className="flex justify-end gap-2">
                    <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn-primary">Save</button>
                </div>
            </form>
        </Modal>
    );
}
