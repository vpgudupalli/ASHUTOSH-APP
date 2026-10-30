import React from 'react';

export const RISK_STYLES = {
    'Critical': { badge: 'bg-red-100 text-red-800 ring-red-200', icon: 'icon-siren', color: '#ef4444' },
    'High Risk': { badge: 'bg-orange-100 text-orange-800 ring-orange-200', icon: 'icon-triangle-alert', color: '#f97316' },
    'Rising Risk': { badge: 'bg-yellow-100 text-yellow-800 ring-yellow-200', icon: 'icon-trending-up', color: '#eab308' },
    'Stable': { badge: 'bg-green-100 text-green-800 ring-green-200', icon: 'icon-circle-check', color: '#22c55e' },
};

export default function RiskBadge({ risk }) {
    if (!risk) {
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200">No assessment</span>;
    }
    const s = RISK_STYLES[risk] || RISK_STYLES.Stable;
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ${s.badge}`}>
            <span className={s.icon}></span>{risk}
        </span>
    );
}

export function timeAgo(date) {
    if (!date) return '—';
    const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(date).toLocaleDateString();
}
