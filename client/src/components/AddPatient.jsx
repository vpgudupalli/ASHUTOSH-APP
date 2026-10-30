import React from 'react';
import { api } from '../api.js';

export default function AddPatient({ onClose, onCreated }) {
    const [form, setForm] = React.useState({ name: '', dob: '', mrn: '', phone: '', email: '', password: '' });
    const [error, setError] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const { id } = await api('/patients', { method: 'POST', body: form });
            onCreated(id);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <Modal title="Add patient" onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <div>
                    <label>Full name</label>
                    <input type="text" value={form.name} onChange={set('name')} required />
                </div>
                <div>
                    <label>Date of birth</label>
                    <input type="date" value={form.dob} onChange={set('dob')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label>MRN (EMR)</label><input type="text" value={form.mrn} onChange={set('mrn')} /></div>
                    <div><label>Phone</label><input type="text" value={form.phone} onChange={set('phone')} /></div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-3">
                    <p className="text-xs text-slate-500">Optional: give the patient a login so they can enter their own data.</p>
                    <div>
                        <label>Patient email</label>
                        <input type="email" value={form.email} onChange={set('email')} />
                    </div>
                    {form.email && (
                        <div>
                            <label>Temporary password</label>
                            <input type="text" value={form.password} onChange={set('password')} minLength={10} required />
                        </div>
                    )}
                </div>
                {error && <div className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{error}</div>}
                <div className="flex justify-end gap-2">
                    <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add patient'}</button>
                </div>
            </form>
        </Modal>
    );
}

export function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><div className="icon-x text-xl"></div></button>
                </div>
                {children}
            </div>
        </div>
    );
}
