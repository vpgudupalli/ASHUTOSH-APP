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
                <p className="text-sm text-slate-500">Staff accounts, care team assignments, EMR integration, and the HIPAA audit trail.</p>
            </div>
            <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
                {[['assign', 'Care team assignments'], ['users', 'Users'], ['inquiries', 'Website inquiries'], ['emr', 'EMR integration'], ['audit', 'Audit log']].map(([k, label]) => (
                    <button
                        key={k}
                        onClick={() => setTab(k)}
                        className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-[var(--primary)] text-[var(--primary-dark)] font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'assign' && <Assignments push={push} />}
            {tab === 'users' && <Users push={push} />}
            {tab === 'inquiries' && <Inquiries push={push} />}
            {tab === 'emr' && <EmrKeys push={push} />}
            {tab === 'audit' && <AuditLog push={push} />}
        </div>
    );
}

function EmrKeys({ push }) {
    const [keys, setKeys] = React.useState([]);
    const [name, setName] = React.useState('');
    const [newKey, setNewKey] = React.useState('');
    const load = React.useCallback(() => {
        api('/admin/api-keys').then((d) => setKeys(d.keys)).catch((e) => push({ error: true, title: e.message }));
    }, [push]);
    React.useEffect(load, [load]);
    const base = `${window.location.origin}/fhir`;

    const create = async (e) => {
        e.preventDefault();
        try {
            const r = await api('/admin/api-keys', { method: 'POST', body: { name } });
            setNewKey(r.key);
            setName('');
            load();
        } catch (err) { push({ error: true, title: err.message }); }
    };
    const revoke = async (id) => {
        if (!window.confirm('Revoke this key? Systems using it will lose access immediately.')) return;
        await api(`/admin/api-keys/${id}`, { method: 'DELETE' }).catch((e) => push({ error: true, title: e.message }));
        load();
    };

    return (
        <div className="space-y-6">
            <div className="card space-y-3 text-sm text-slate-700">
                <h3 className="text-base">HL7 FHIR R4 API</h3>
                <p>Any EMR or integration engine (Epic, Oracle Health/Cerner, athenahealth, eClinicalWorks, NextGen, Mirth/Rhapsody) can pull patient-reported data, risk scores and care-team messages using standard FHIR resources. Vitals and screening scores use LOINC codes; conditions use ICD-10-CM and SNOMED CT. Link patients to the EMR by entering their MRN on the patient's record.</p>
                <div className="bg-slate-50 rounded-md p-3 font-mono text-xs space-y-1 overflow-x-auto">
                    <div>GET {base}/metadata</div>
                    <div>GET {base}/Patient?identifier=&lt;MRN&gt;</div>
                    <div>GET {base}/Patient/&lt;id&gt;/$everything</div>
                    <div>GET {base}/Observation?patient=&lt;id&gt; · /Condition · /RiskAssessment · /Communication</div>
                    <div className="text-slate-500">Header: Authorization: Bearer &lt;API key&gt;</div>
                </div>
                <p className="text-xs text-slate-500">Every FHIR request is recorded in the audit log. Before connecting a production EMR, sign a BAA / data-sharing agreement with the receiving organization.</p>
            </div>
            <form onSubmit={create} className="card flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1"><label>New API key for</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Epic sandbox"' required /></div>
                <button className="btn-primary">Create key</button>
            </form>
            {newKey && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
                    <div className="font-semibold text-green-900">Copy this key now – it will not be shown again.</div>
                    <code className="block mt-2 bg-white border rounded px-3 py-2 break-all">{newKey}</code>
                    <button className="btn-ghost mt-2" onClick={() => { navigator.clipboard?.writeText(newKey); push({ title: 'Copied' }); }}>Copy</button>
                </div>
            )}
            <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Key</th><th className="px-4 py-2">Created</th><th className="px-4 py-2">Last used</th><th className="px-4 py-2"></th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {keys.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No API keys yet.</td></tr>}
                        {keys.map((k) => (
                            <tr key={k.id} className={k.revoked_at ? 'opacity-50' : ''}>
                                <td className="px-4 py-2 font-medium">{k.name}</td>
                                <td className="px-4 py-2 font-mono text-xs">{k.key_prefix}…</td>
                                <td className="px-4 py-2">{new Date(k.created_at).toLocaleDateString()} · {k.created_by_name}</td>
                                <td className="px-4 py-2">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</td>
                                <td className="px-4 py-2 text-right">{k.revoked_at ? 'Revoked' : <button className="text-red-600" onClick={() => revoke(k.id)}>Revoke</button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function AuditLog({ push }) {
    const [entries, setEntries] = React.useState(null);
    const [action, setAction] = React.useState('');
    React.useEffect(() => {
        api(`/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`).then((d) => setEntries(d.entries)).catch((e) => push({ error: true, title: e.message }));
    }, [action, push]);
    const actions = ['', 'login', 'login_failed', 'account_locked', 'patient_view', 'messages_view', 'assessment_create', 'assessment_review', 'follow_up_create', 'note_create', 'message_send', 'report_print', 'fhir_read', 'user_create', 'user_update', 'assign', 'mfa_enabled', 'api_key_create'];
    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <p className="text-sm text-slate-600">Who accessed or changed patient information, when, and from where (last 1,000 events). Retain for at least 6 years.</p>
                <div className="flex gap-2">
                    <select value={action} onChange={(e) => setAction(e.target.value)} className="!w-48 !py-1.5 text-sm">
                        {actions.map((a) => <option key={a} value={a}>{a || 'All actions'}</option>)}
                    </select>
                    <a className="btn-ghost whitespace-nowrap" href={`/api/admin/audit?format=csv${action ? `&action=${action}` : ''}`}><span className="icon-download"></span>CSV</a>
                </div>
            </div>
            <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Detail</th><th className="px-3 py-2">IP</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {entries === null && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>}
                        {entries?.map((e) => (
                            <tr key={e.id}>
                                <td className="px-3 py-1.5 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                                <td className="px-3 py-1.5">{e.user_name || (e.action === 'fhir_read' ? 'EMR (API key)' : '—')}{e.user_role ? ` (${ROLE_LABELS[e.user_role]})` : ''}</td>
                                <td className="px-3 py-1.5 font-mono">{e.action}</td>
                                <td className="px-3 py-1.5">{e.patient_name || (e.patient_id ? `#${e.patient_id}` : '')}</td>
                                <td className="px-3 py-1.5 text-slate-500">{e.detail}</td>
                                <td className="px-3 py-1.5 text-slate-400">{e.ip}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Assignments({ push }) {
    const [patients, setPatients] = React.useState([]);
    const [staff, setStaff] = React.useState([]);
    const [pick, setPick] = React.useState({}); // patientId -> staffId

    const load = React.useCallback(() => {
        Promise.all([api('/patients'), api('/admin/staff')])
            .then(([p, s]) => { setPatients(p.patients); setStaff(s.staff); })
            .catch((e) => push({ error: true, title: e.message }));
    }, [push]);
    React.useEffect(load, [load]);
    useSocketEvents(['patients:changed', 'assessment:new'], load);

    const assign = async (patientId) => {
        const staffId = pick[patientId];
        if (!staffId) return;
        try {
            await api(`/admin/patients/${patientId}/assignments`, { method: 'POST', body: { staffId: Number(staffId) } });
            setPick((p) => ({ ...p, [patientId]: '' }));
            load();
        } catch (e) { push({ error: true, title: e.message }); }
    };
    const unassign = async (patientId, staffId) => {
        try {
            await api(`/admin/patients/${patientId}/assignments/${staffId}`, { method: 'DELETE' });
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
        api('/admin/users').then((d) => setUsers(d.users)).catch((e) => push({ error: true, title: e.message }));
    }, [push]);
    React.useEffect(load, [load]);

    const update = async (id, body, msg) => {
        try {
            await api(`/admin/users/${id}`, { method: 'PATCH', body });
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
                                    <select
                                        value={u.role}
                                        onChange={(e) => {
                                            const role = e.target.value;
                                            if (u.role === 'patient' && !window.confirm(
                                                `Make ${u.name} a ${ROLE_LABELS[role]}?\n\nTheir login becomes a staff login. Their patient record stays in the system but is no longer linked to this login (you can send a new invite later if needed).`
                                            )) { e.target.value = u.role; return; }
                                            update(u.id, { role }, u.role === 'patient' ? `${u.name} is now ${ROLE_LABELS[role]}` : 'Role updated');
                                        }}
                                        className="!py-1 !px-2 text-sm !w-auto"
                                    >
                                        {u.role === 'patient' && <option value="patient" disabled>{ROLE_LABELS.patient}</option>}
                                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                    </select>
                                </td>
                                <td className="px-4 py-2.5">
                                    {u.active ? 'Active' : 'Disabled'}
                                    {u.locked && <span className="ml-1 text-xs text-red-600">(locked)</span>}
                                    <div className="text-xs text-slate-400">{u.mfa_enabled ? 'MFA on' : 'MFA off'} · {u.last_login_at ? `last sign-in ${new Date(u.last_login_at).toLocaleDateString()}` : 'never signed in'}</div>
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                    {u.locked && <button className="text-[var(--primary-dark)] mr-3" onClick={() => update(u.id, { unlock: true }, 'Account unlocked')}>Unlock</button>}
                                    {u.mfa_enabled && <button className="text-[var(--primary-dark)] mr-3" onClick={() => update(u.id, { resetMfa: true }, 'MFA reset – user must set it up again')}>Reset MFA</button>}
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
            await api('/admin/users', { method: 'POST', body: form });
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
                    <input type="text" value={form.password} onChange={set('password')} minLength={10} required />
                    <p className="text-xs text-slate-400 mt-1">Share this with them securely. At least 10 characters, letters and numbers.</p>
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
                <div><label>New password</label><input type="text" value={pw} onChange={(e) => setPw(e.target.value)} minLength={10} required /></div>
                <div className="flex justify-end gap-2">
                    <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn-primary">Save</button>
                </div>
            </form>
        </Modal>
    );
}

function Inquiries({ push }) {
    const [items, setItems] = React.useState(null);
    const load = React.useCallback(() => {
        api('/admin/inquiries').then((d) => setItems(d.inquiries)).catch((e) => push({ error: true, title: e.message }));
    }, [push]);
    React.useEffect(load, [load]);
    useSocketEvents(['inquiry:new'], load);
    const mark = async (id, handled) => {
        await api(`/admin/inquiries/${id}`, { method: 'PATCH', body: { handled } }).catch((e) => push({ error: true, title: e.message }));
        load();
    };
    if (!items) return <div className="text-slate-400">Loading…</div>;
    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-600">Demo and contact requests submitted on your public website. New ones appear here live.</p>
            {items.length === 0 && <div className="card text-center text-slate-400">No inquiries yet.</div>}
            {items.map((i) => (
                <div key={i.id} className={`card !p-4 ${i.handled_at ? 'opacity-60' : '!border-l-4 !border-l-sky-500'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div>
                            <div className="font-semibold text-slate-900">{i.name}{i.organization ? <span className="font-normal text-slate-500"> · {i.organization}</span> : ''}{i.role ? <span className="font-normal text-slate-500"> · {i.role}</span> : ''}</div>
                            <div className="text-sm text-slate-600"><a className="text-[var(--primary-dark)]" href={`mailto:${i.email}`}>{i.email}</a>{i.phone ? ` · ${i.phone}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">{i.topic}</span>
                            <span className="text-slate-400">{new Date(i.created_at).toLocaleString()}</span>
                        </div>
                    </div>
                    {i.message && <p className="text-sm text-slate-800 mt-2 whitespace-pre-wrap">{i.message}</p>}
                    <div className="mt-2 text-xs flex items-center gap-3">
                        {i.handled_at
                            ? <><span className="text-green-700">Handled by {i.handled_by_name} {new Date(i.handled_at).toLocaleDateString()}</span><button className="text-slate-500" onClick={() => mark(i.id, false)}>Reopen</button></>
                            : <button className="btn-ghost !py-1" onClick={() => mark(i.id, true)}><span className="icon-check"></span>Mark handled</button>}
                    </div>
                </div>
            ))}
        </div>
    );
}
