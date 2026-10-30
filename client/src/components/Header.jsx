import React from 'react';
import { ROLE_LABELS, navigate } from '../api.js';
import { useSocketStatus } from './LiveStatus.jsx';

export default function Header({ user, route, onLogout }) {
    const live = useSocketStatus(!!user);
    const navLink = (path, label, icon) => (
        <button
            onClick={() => navigate(path)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${route === path ? 'bg-sky-50 text-[var(--primary-dark)] font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
        >
            <div className={icon}></div>{label}
        </button>
    );

    return (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
                <button onClick={() => navigate('/')} className="flex items-center gap-3 text-left">
                    <div className="bg-[var(--primary)] p-2 rounded-lg">
                        <div className="icon-activity text-white text-xl"></div>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 leading-none">Ashutosh Services</h1>
                        <p className="text-xs text-slate-500 font-medium">Risk Navigator & Stratification</p>
                    </div>
                </button>

                {user && user.role !== 'patient' && (
                    <nav className="hidden md:flex items-center gap-1">
                        {navLink('/', 'Patients', 'icon-users')}
                        {user.role === 'admin' && navLink('/admin', 'Admin', 'icon-settings')}
                    </nav>
                )}

                {user ? (
                    <div className="flex items-center gap-3 text-sm">
                        <span className={`hidden sm:flex items-center gap-1.5 text-xs ${live ? 'text-green-600' : 'text-slate-400'}`} title={live ? 'Receiving live updates' : 'Reconnecting…'}>
                            <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></span>
                            {live ? 'Live' : 'Offline'}
                        </span>
                        <div className="text-right hidden sm:block">
                            <div className="font-medium text-slate-800 leading-tight">{user.name}</div>
                            <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
                        </div>
                        <button onClick={onLogout} className="btn-ghost" title="Sign out">
                            <div className="icon-log-out"></div>
                            <span className="hidden sm:inline">Sign out</span>
                        </button>
                    </div>
                ) : (
                    <div className="hidden md:flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                            <div className="icon-clock text-base"></div>
                            <span>{new Date().toLocaleDateString()}</span>
                        </span>
                    </div>
                )}
            </div>
            {user && user.role === 'admin' && (
                <nav className="md:hidden flex gap-1 px-4 pb-2">
                    {navLink('/', 'Patients', 'icon-users')}
                    {navLink('/admin', 'Admin', 'icon-settings')}
                </nav>
            )}
        </header>
    );
}
