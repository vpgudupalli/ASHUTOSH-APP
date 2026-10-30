import React from 'react';
import { navigate } from '../api.js';
import { RISK_STYLES } from './RiskBadge.jsx';

export function useToasts() {
    const [toasts, setToasts] = React.useState([]);
    const dismiss = React.useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
    const push = React.useCallback((toast) => {
        const id = Math.random().toString(36).slice(2);
        setToasts((t) => [...t.slice(-4), { id, ...toast }]);
        setTimeout(() => dismiss(id), toast.error ? 6000 : 8000);
    }, [dismiss]);
    return { toasts, push, dismiss };
}

export default function Toasts({ toasts, dismiss }) {
    return (
        <div className="fixed top-20 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
            {toasts.map((t) => {
                const style = t.risk ? RISK_STYLES[t.risk] : null;
                return (
                    <div
                        key={t.id}
                        onClick={() => { if (t.href) navigate(t.href); dismiss(t.id); }}
                        className={`rounded-lg shadow-lg border bg-white p-3 text-sm cursor-pointer border-l-4 ${t.error ? 'border-l-red-500' : ''}`}
                        style={style ? { borderLeftColor: style.color } : undefined}
                    >
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                            <div className={t.error ? 'icon-circle-x text-red-500' : style ? style.icon : 'icon-circle-check text-green-500'} style={style ? { color: style.color } : undefined}></div>
                            {t.title}
                        </div>
                        {t.body && <div className="text-slate-500 mt-0.5">{t.body}</div>}
                    </div>
                );
            })}
        </div>
    );
}
