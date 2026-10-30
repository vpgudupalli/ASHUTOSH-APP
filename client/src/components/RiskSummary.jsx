import React from 'react';
import { TIERS, TIER_THRESHOLDS } from '../../../shared/risk.js';
import { RISK_STYLES } from './RiskBadge.jsx';

// Reviewer view of a scored assessment: why the patient landed in this tier and what to do.
export default function RiskSummary({ result, compact = false }) {
    if (!result) return null;
    const s = RISK_STYLES[result.tier];
    const scored = result.domains.filter((d) => d.factors.length);
    return (
        <div className={`rounded-xl border ${s.panel} overflow-hidden`}>
            <div className="p-5 flex flex-col md:flex-row md:items-center gap-5 justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-white shadow-sm"><div className={`${s.icon} text-3xl`} style={{ color: s.color }}></div></div>
                    <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Risk stratification</div>
                        <div className={`text-3xl font-bold ${s.text}`}>{result.tier}</div>
                        <div className="text-sm text-slate-600">Score {result.score} / {result.maxScore} · Contact: <b>{result.followUp}</b></div>
                    </div>
                </div>
                <TierScale score={result.score} tier={result.tier} />
            </div>

            {result.floors.length > 0 && (
                <div className="px-5 py-3 bg-white/70 border-t border-white text-sm">
                    <div className="font-semibold text-slate-800 flex items-center gap-2"><span className="icon-shield-alert text-red-600"></span>Safety escalation rules triggered</div>
                    <ul className="mt-1 space-y-0.5 text-slate-700">
                        {result.floors.map((f, i) => <li key={i}>• {f.reason} → at least <b>{f.tier}</b></li>)}
                    </ul>
                    {result.pointsTier !== result.tier && <div className="text-xs text-slate-500 mt-1">Points alone would be {result.pointsTier}.</div>}
                </div>
            )}

            <div className="grid lg:grid-cols-2 gap-px bg-white/60 border-t border-white">
                <div className="bg-white/80 p-5">
                    <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><span className="icon-clipboard-list text-slate-400"></span>Recommended actions</h4>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                        {result.tierActions.map((a, i) => <li key={`t${i}`} className="flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }}></span>{a}</li>)}
                    </ul>
                    {result.factorActions.length > 0 && (
                        <>
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1.5">Targeted to this patient</div>
                            <ul className="space-y-1.5 text-sm text-slate-700">
                                {result.factorActions.map((a, i) => <li key={`f${i}`} className="flex gap-2"><span className="icon-arrow-right text-slate-400 mt-0.5 shrink-0"></span>{a}</li>)}
                            </ul>
                        </>
                    )}
                    {result.considerations.length > 0 && (
                        <>
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-4 mb-1.5">Communication & care considerations</div>
                            <ul className="space-y-1 text-sm text-slate-700">
                                {result.considerations.map((c, i) => <li key={i} className="flex gap-2"><span className="icon-accessibility text-sky-500 mt-0.5 shrink-0"></span>{c}</li>)}
                            </ul>
                        </>
                    )}
                </div>
                <div className="bg-white/80 p-5">
                    <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><span className="icon-chart-bar text-slate-400"></span>What's driving the score</h4>
                    {scored.length === 0 && <p className="text-sm text-slate-500">No risk factors reported.</p>}
                    <div className="space-y-3">
                        {scored.map((d) => (
                            <div key={d.key}>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-slate-800">{d.label}</span>
                                    <span className="text-slate-500 tabular-nums">{d.points}/{d.cap}{d.raw > d.cap ? ` (capped from ${d.raw})` : ''}</span>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${(d.points / d.cap) * 100}%`, background: s.color }}></div>
                                </div>
                                {!compact && (
                                    <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
                                        {d.factors.map((f, i) => <li key={i}>{f.floor ? '⚠ ' : '• '}{f.label}{f.points ? ` (+${f.points})` : ''}</li>)}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                        Data completeness: <b>{result.completeness}%</b>
                        {result.missing.length > 0 && <> · Not answered: {result.missing.join(', ')}. Missing answers do not add risk – ask about them at follow-up.</>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function TierScale({ score, tier }) {
    return (
        <div className="flex gap-1 w-full md:w-80">
            {TIERS.map((t) => {
                const on = t === tier;
                return (
                    <div key={t} className="flex-1 text-center">
                        <div className={`h-2 rounded-full ${on ? '' : 'opacity-30'}`} style={{ background: RISK_STYLES[t].color }}></div>
                        <div className={`text-[10px] mt-1 ${on ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{t}</div>
                        <div className="text-[10px] text-slate-400">{TIER_THRESHOLDS[t]}+</div>
                    </div>
                );
            })}
        </div>
    );
}
