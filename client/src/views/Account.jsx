import React from 'react';
import { api, ROLE_LABELS } from '../api.js';

export default function Account({ user, push, onChanged }) {
    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-2xl">My account</h2>
                <p className="text-sm text-slate-500">{user.name} · {user.email} · {ROLE_LABELS[user.role]}</p>
            </div>
            {user.mfaSetupRequired && (
                <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    Your organization requires two-step verification for staff before you can view patient information. Set it up below.
                </div>
            )}
            <Mfa user={user} push={push} onChanged={onChanged} />
            <Password push={push} />
        </div>
    );
}

function Mfa({ user, push, onChanged }) {
    const [setup, setSetup] = React.useState(null);
    const [code, setCode] = React.useState('');
    const [pw, setPw] = React.useState('');
    const [error, setError] = React.useState('');

    const start = async () => {
        setError('');
        try { setSetup(await api('/auth/mfa/setup', { method: 'POST' })); } catch (e) { setError(e.message); }
    };
    const enable = async (e) => {
        e.preventDefault();
        try {
            await api('/auth/mfa/enable', { method: 'POST', body: { code } });
            push({ title: 'Two-step verification is on' });
            setSetup(null);
            onChanged();
        } catch (err) { setError(err.message); }
    };
    const disable = async (e) => {
        e.preventDefault();
        try {
            await api('/auth/mfa/disable', { method: 'POST', body: { password: pw } });
            push({ title: 'Two-step verification turned off' });
            setPw('');
            onChanged();
        } catch (err) { setError(err.message); }
    };

    return (
        <div className="card space-y-4">
            <div className="section-title !mb-0">
                <span className="icon-smartphone text-[var(--primary)]"></span>
                <h3 className="flex-1">Two-step verification (MFA)</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${user.mfaEnabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{user.mfaEnabled ? 'On' : 'Off'}</span>
            </div>
            <p className="text-sm text-slate-600">Protects your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password) in addition to your password.</p>
            {!user.mfaEnabled && !setup && <button className="btn-primary" onClick={start}>Set up two-step verification</button>}
            {setup && (
                <form onSubmit={enable} className="space-y-3">
                    <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-1">
                        <li>Open your authenticator app and scan this QR code.</li>
                        <li>Enter the 6-digit code it shows.</li>
                    </ol>
                    <img src={setup.qr} alt="QR code for authenticator app" className="w-44 h-44 border rounded-lg" />
                    <p className="text-xs text-slate-500">Can't scan? Enter this key: <code className="bg-slate-100 px-1 rounded break-all">{setup.secret}</code></p>
                    <div className="flex gap-2 max-w-xs">
                        <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
                        <button className="btn-primary">Turn on</button>
                    </div>
                </form>
            )}
            {user.mfaEnabled && !user.mfaSetupRequired && (
                <form onSubmit={disable} className="flex gap-2 max-w-md">
                    <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password to turn off" required />
                    <button className="btn-ghost whitespace-nowrap">Turn off</button>
                </form>
            )}
            {error && <div className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{error}</div>}
        </div>
    );
}

function Password({ push }) {
    const [f, setF] = React.useState({ currentPassword: '', newPassword: '' });
    const [error, setError] = React.useState('');
    const submit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await api('/auth/password', { method: 'POST', body: f });
            setF({ currentPassword: '', newPassword: '' });
            push({ title: 'Password changed' });
        } catch (err) { setError(err.message); }
    };
    return (
        <form onSubmit={submit} className="card space-y-3">
            <div className="section-title !mb-0"><span className="icon-key-round text-[var(--primary)]"></span><h3>Change password</h3></div>
            <div><label>Current password</label><input type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required autoComplete="current-password" /></div>
            <div><label>New password</label><input type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required minLength={10} autoComplete="new-password" />
                <p className="text-xs text-slate-400 mt-1">At least 10 characters, with letters and numbers.</p></div>
            {error && <div className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">{error}</div>}
            <button className="btn-primary">Update password</button>
        </form>
    );
}
