import React from 'react';
import { api } from '../api.js';

export default function Login({ onSignedIn }) {
    const [mode, setMode] = React.useState('login');
    const [form, setForm] = React.useState({ name: '', email: '', password: '', dob: '' });
    const [error, setError] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [allowSignup, setAllowSignup] = React.useState(false);

    React.useEffect(() => {
        api('/config').then((c) => setAllowSignup(c.allowPatientSignup)).catch(() => {});
    }, []);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            if (mode === 'login') {
                await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
            } else {
                await api('/auth/register', { method: 'POST', body: form });
            }
            await onSignedIn();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-md mx-auto py-8">
            <div className="card">
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="bg-sky-50 p-3 rounded-full mb-3">
                        <div className="icon-shield-check text-3xl text-[var(--primary)]"></div>
                    </div>
                    <h2 className="text-2xl">{mode === 'login' ? 'Sign in' : 'Create patient account'}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {mode === 'login'
                            ? 'Patients, providers, NPs and case managers sign in here.'
                            : 'Patients can create an account to share their health information with their care team.'}
                    </p>
                </div>

                <form onSubmit={submit} className="space-y-4">
                    {mode === 'register' && (
                        <>
                            <div>
                                <label>Full name</label>
                                <input type="text" value={form.name} onChange={set('name')} required autoComplete="name" />
                            </div>
                            <div>
                                <label>Date of birth</label>
                                <input type="date" value={form.dob} onChange={set('dob')} />
                            </div>
                        </>
                    )}
                    <div>
                        <label>Email</label>
                        <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
                    </div>
                    <div>
                        <label>Password</label>
                        <input
                            type="password" value={form.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : undefined}
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        />
                        {mode === 'register' && <p className="text-xs text-slate-400 mt-1">At least 8 characters.</p>}
                    </div>

                    {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

                    <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
                        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
                    </button>
                </form>

                {allowSignup && (
                    <div className="text-center text-sm text-slate-500 mt-6 pt-4 border-t border-slate-100">
                        {mode === 'login' ? (
                            <>New patient? <button className="text-[var(--primary-dark)] font-medium" onClick={() => { setMode('register'); setError(''); }}>Create an account</button></>
                        ) : (
                            <>Already have an account? <button className="text-[var(--primary-dark)] font-medium" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>
                        )}
                    </div>
                )}
                <p className="text-xs text-slate-400 text-center mt-4">Staff accounts are created by your administrator.</p>
            </div>
        </div>
    );
}
