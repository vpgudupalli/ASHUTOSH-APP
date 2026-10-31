import React from 'react';
import { api } from '../api.js';

export default function Login({ onSignedIn, notice, inviteCode }) {
    const [mode, setMode] = React.useState(inviteCode ? 'register' : 'login'); // login | register | mfa
    const [form, setForm] = React.useState({ inviteCode: inviteCode || '', email: '', password: '', dob: '', phone: '', privacyAck: false });
    const [mfa, setMfa] = React.useState({ token: '', code: '' });
    const [error, setError] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            if (mode === 'login') {
                const r = await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
                if (r.mfaRequired) { setMfa({ token: r.mfaToken, code: '' }); setMode('mfa'); return; }
            } else if (mode === 'mfa') {
                await api('/auth/mfa/verify', { method: 'POST', body: { mfaToken: mfa.token, code: mfa.code } });
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

    const titles = { login: 'Sign in', register: 'Join with your invite code', mfa: 'Two-step verification' };

    return (
        <div className="max-w-md mx-auto py-6">
            {notice && <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">{notice}</div>}
            <div className="card">
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="bg-sky-50 p-3 rounded-full mb-3"><div className={`${mode === 'mfa' ? 'icon-smartphone' : 'icon-shield-check'} text-3xl text-[var(--primary)]`}></div></div>
                    <h2 className="text-2xl">{titles[mode]}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {mode === 'login' && 'Patients, providers, NPs and case managers sign in here.'}
                        {mode === 'register' && 'Your care team gave you an invite code. Use it to create your account with any email you like.'}
                        {mode === 'mfa' && 'Enter the 6-digit code from your authenticator app.'}
                    </p>
                </div>

                <form onSubmit={submit} className="space-y-4">
                    {mode === 'mfa' ? (
                        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={mfa.code}
                            onChange={(e) => setMfa((m) => ({ ...m, code: e.target.value.replace(/\D/g, '') }))} className="text-center text-2xl tracking-[0.5em]" />
                    ) : (
                        <>
                            {mode === 'register' && (
                                <>
                                    <div><label>Invite code</label><input type="text" value={form.inviteCode} onChange={set('inviteCode')} required placeholder="e.g. K7M2-QX9P" autoComplete="off" className="uppercase tracking-widest" /></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label>Date of birth</label><input type="date" value={form.dob} onChange={set('dob')} required /></div>
                                        <div><label>Phone (optional)</label><input type="text" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></div>
                                    </div>
                                </>
                            )}
                            <div><label>Email</label><input type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></div>
                            <div>
                                <label>Password</label>
                                <input type="password" value={form.password} onChange={set('password')} required minLength={mode === 'register' ? 10 : undefined}
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                                {mode === 'register' && <p className="text-xs text-slate-400 mt-1">At least 10 characters, with letters and numbers.</p>}
                            </div>
                            {mode === 'register' && (
                                <label className="!mb-0 flex items-start gap-2 text-xs font-normal text-slate-600 bg-slate-50 rounded-md p-3">
                                    <input type="checkbox" checked={form.privacyAck} onChange={set('privacyAck')} className="mt-0.5 shrink-0" required />
                                    <span>I understand that the health information I enter is shared securely with my care team, is protected under HIPAA, and that this app is
                                        <b> not for emergencies</b> – in an emergency I will call 911.</span>
                                </label>
                            )}
                        </>
                    )}

                    {error && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

                    <button type="submit" disabled={busy} className="btn-primary w-full !py-2.5">
                        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'mfa' ? 'Verify' : 'Create account'}
                    </button>
                </form>

                {mode === 'mfa' && <button className="text-sm text-slate-500 mt-4 w-full" onClick={() => { setMode('login'); setError(''); }}>Back</button>}
                {mode !== 'mfa' && (
                    <div className="text-center text-sm text-slate-500 mt-6 pt-4 border-t border-slate-100">
                        {mode === 'login' ? (
                            <>New patient with an invite code? <button className="text-[var(--primary-dark)] font-medium" onClick={() => { setMode('register'); setError(''); }}>Create your account</button></>
                        ) : (
                            <>Already have an account? <button className="text-[var(--primary-dark)] font-medium" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>
                        )}
                    </div>
                )}
                <p className="text-xs text-slate-400 text-center mt-4">No invite code? Ask your nurse, provider or case manager. Staff accounts are created by your administrator.</p>
            </div>
        </div>
    );
}
