import React from 'react';

export const RISK_STYLES = {
    Critical: { badge: 'bg-red-100 text-red-800 ring-red-200', panel: 'bg-red-50 border-red-200', text: 'text-red-700', icon: 'icon-siren', color: '#dc2626' },
    High: { badge: 'bg-orange-100 text-orange-800 ring-orange-200', panel: 'bg-orange-50 border-orange-200', text: 'text-orange-700', icon: 'icon-triangle-alert', color: '#ea580c' },
    Moderate: { badge: 'bg-amber-100 text-amber-800 ring-amber-200', panel: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: 'icon-trending-up', color: '#d97706' },
    Mild: { badge: 'bg-sky-100 text-sky-800 ring-sky-200', panel: 'bg-sky-50 border-sky-200', text: 'text-sky-700', icon: 'icon-info', color: '#0284c7' },
    Low: { badge: 'bg-green-100 text-green-800 ring-green-200', panel: 'bg-green-50 border-green-200', text: 'text-green-700', icon: 'icon-circle-check', color: '#16a34a' },
};

export default function RiskBadge({ risk, score }) {
    if (!risk) {
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200">No check-in yet</span>;
    }
    const s = RISK_STYLES[risk] || RISK_STYLES.Low;
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${s.badge}`}>
            <span className={s.icon}></span>{risk}{score !== undefined && score !== null ? ` · ${score}` : ''}
        </span>
    );
}

export function timeAgo(date) {
    if (!date) return '—';
    const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
    return new Date(date).toLocaleDateString();
}

export const fmt = (date) => (date ? new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
