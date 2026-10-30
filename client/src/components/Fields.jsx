import React from 'react';

// Small, patient-friendly input building blocks used by the check-in form.

export function Chips({ options, value, onChange, multi = false, tone = 'sky' }) {
    const selected = (o) => (multi ? (value || []).includes(o) : value === o);
    const click = (o) => {
        if (multi) onChange(selected(o) ? value.filter((x) => x !== o) : [...(value || []), o]);
        else onChange(selected(o) ? '' : o); // click again to clear
    };
    const on = tone === 'red' ? 'bg-red-600 border-red-600 text-white' : 'bg-[var(--primary)] border-[var(--primary)] text-white';
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((o) => {
                const label = typeof o === 'string' ? o : o.label;
                const key = typeof o === 'string' ? o : o.key;
                return (
                    <button
                        type="button" key={key} onClick={() => click(key)}
                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${selected(key) ? on : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export function CheckList({ items, value, onChange, cols = 2, tone }) {
    const list = value || [];
    const toggle = (k) => onChange(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
    const colCls = cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : cols === 1 ? '' : 'sm:grid-cols-2';
    return (
        <div className={`grid grid-cols-1 ${colCls} gap-2`}>
            {items.map((it) => {
                const on = list.includes(it.key);
                const onCls = tone === 'red' ? 'border-red-400 bg-red-50' : 'border-[var(--primary)] bg-sky-50';
                return (
                    <label key={it.key} className={`!mb-0 flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${on ? onCls : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input type="checkbox" className="mt-0.5 shrink-0" checked={on} onChange={() => toggle(it.key)} />
                        <span className={`text-sm font-normal ${on ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{it.label}</span>
                    </label>
                );
            })}
        </div>
    );
}

export function Num({ label, value, onChange, unit, placeholder, step, min = 0, max, hint }) {
    return (
        <div>
            <label>{label}</label>
            <div className="relative">
                <input
                    type="number" inputMode="decimal" value={value ?? ''} step={step} min={min} max={max} placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)} className={unit ? 'pr-14' : ''}
                />
                {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{unit}</span>}
            </div>
            {hint && <div className="text-xs mt-1 min-h-[1rem]">{hint}</div>}
        </div>
    );
}

export function Question({ label, help, children }) {
    return (
        <div className="space-y-2">
            <div>
                <div className="text-sm font-medium text-slate-800">{label}</div>
                {help && <div className="text-xs text-slate-500">{help}</div>}
            </div>
            {children}
        </div>
    );
}

// Rows of questions answered on the same 0–3 frequency scale (PHQ-9, GAD-7).
export function FrequencyGrid({ items, options, value, onChange, highlight }) {
    const set = (i, v) => {
        const next = [...value];
        next[i] = next[i] === v ? null : v;
        onChange(next);
    };
    return (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {items.map((q, i) => (
                <div key={i} className={`p-3 ${highlight === i && value[i] > 0 ? 'bg-red-50' : ''}`}>
                    <div className="text-sm text-slate-800 mb-2">{i + 1}. {q}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {options.map((o, v) => (
                            <button
                                type="button" key={v} onClick={() => set(i, v)}
                                className={`px-2 py-1.5 rounded-md border text-xs ${value[i] === v ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                {o}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function Section({ id, icon, title, subtitle, children, done }) {
    return (
        <section id={id} className="card scroll-mt-24">
            <div className="section-title">
                <div className={`${icon} text-[var(--primary)]`}></div>
                <div className="flex-1">
                    <h3>{title}</h3>
                    {subtitle && <p className="text-xs font-normal text-slate-500">{subtitle}</p>}
                </div>
                {done && <span className="text-xs text-green-600 flex items-center gap-1"><span className="icon-circle-check"></span>Answered</span>}
            </div>
            <div className="space-y-5">{children}</div>
        </section>
    );
}
