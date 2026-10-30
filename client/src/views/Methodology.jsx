import React from 'react';
import { DOMAIN_LIST, TIERS, TIER_THRESHOLDS, TIER_INFO, CONDITIONS, PAIN_RED_FLAGS, REFERENCES } from '../../../shared/risk.js';
import { RISK_STYLES } from '../components/RiskBadge.jsx';

// Generated from the same rules the scoring engine runs, so it never drifts out of date.
export default function Methodology() {
    const maxScore = DOMAIN_LIST.reduce((a, d) => a + d.cap, 0);
    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h2 className="text-2xl">Scoring methodology</h2>
                <p className="text-sm text-slate-500 max-w-3xl mt-1">
                    How Risk Navigator turns a patient's check-in into a risk tier and action plan. Validated screening instruments are scored with
                    their published cut-offs; their results feed a capped, domain-based composite score. Safety findings can raise the tier regardless of points.
                </p>
            </div>

            <div className="card">
                <h3 className="text-base mb-3">Principles</h3>
                <ul className="text-sm text-slate-700 space-y-1.5 list-disc pl-5">
                    <li><b>Each domain is capped.</b> Selecting many items in one area (e.g. all social needs, or many conditions) cannot by itself push a patient to High or Critical.</li>
                    <li><b>Missing answers never add risk.</b> They reduce the completeness percentage, which the reviewer sees alongside the score.</li>
                    <li><b>Safety rules set a minimum tier</b> for findings that need prompt action no matter what else is reported (below).</li>
                    <li><b>Transparent.</b> Reviewers see every factor, its points, and the targeted recommendation it triggers.</li>
                    <li><b>Calibrate before relying on it.</b> Point weights are a composite built from the instruments below, not a single validated model. Validate locally against 90-day ED visits and admissions, and adjust thresholds with your clinical leadership.</li>
                </ul>
            </div>

            <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Tier</th><th className="px-4 py-2">Points</th><th className="px-4 py-2">Contact within</th><th className="px-4 py-2">Actions</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {[...TIERS].reverse().map((t, i, arr) => {
                            const next = i === 0 ? null : TIER_THRESHOLDS[arr[i - 1]] - 1;
                            return (
                                <tr key={t} className="align-top">
                                    <td className="px-4 py-2 font-semibold" style={{ color: RISK_STYLES[t].color }}>{t}</td>
                                    <td className="px-4 py-2 whitespace-nowrap tabular-nums">{TIER_THRESHOLDS[t]}{next !== null ? `–${next}` : '+'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">{TIER_INFO[t].followUp}</td>
                                    <td className="px-4 py-2 text-slate-600">{TIER_INFO[t].actions.join(' · ')}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="card !p-0 overflow-x-auto">
                <div className="px-4 py-3 font-semibold text-slate-800">Domains (max {maxScore} points)</div>
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Domain</th><th className="px-4 py-2">Cap</th><th className="px-4 py-2">Basis</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {DOMAIN_LIST.map((d) => <tr key={d.key}><td className="px-4 py-2 font-medium">{d.label}</td><td className="px-4 py-2 tabular-nums">{d.cap}</td><td className="px-4 py-2 text-slate-600">{d.source || 'Patient-reported'}</td></tr>)}
                    </tbody>
                </table>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="card">
                    <h3 className="text-base mb-3">Safety escalation rules (minimum tier)</h3>
                    <ul className="text-sm space-y-1.5 text-slate-700">
                        <li><b className="text-red-700">Critical</b> – any emergency warning symptom (chest pain, severe dyspnea, stroke signs, new confusion, fainting, severe bleeding, sudden severe headache, current self-harm thoughts)</li>
                        <li><b className="text-red-700">Critical</b> – PHQ-9 item 9 positive (same-day suicide risk assessment)</li>
                        {PAIN_RED_FLAGS.map((r) => <li key={r.key}><b style={{ color: RISK_STYLES[r.floor].color }}>{r.floor}</b> – {r.label.replace(/"/g, '')} ({r.why})</li>)}
                        <li><b className="text-orange-700">High</b> – BP ≥180/120, SpO₂ &lt;88%, glucose &lt;54 or &gt;400 mg/dL, interpersonal safety concern</li>
                        <li><b className="text-amber-700">Moderate</b> – ≥2 ED visits in 30 days</li>
                    </ul>
                </div>
                <div className="card">
                    <h3 className="text-base mb-3">Key cut-offs</h3>
                    <ul className="text-sm space-y-1 text-slate-700">
                        <li>BP: 130–139/80–89 +1 · ≥140/90 +2 · ≥160/100 +3 · ≥180/120 +4</li>
                        <li>HbA1c: 7–8% +1 · &gt;8% +2 · &gt;9% +3 · &gt;10% +4</li>
                        <li>PHQ-9: 5–9 +1 · 10–14 +2 · 15–19 +3 · ≥20 +4 (PHQ-2 ≥3 +1 if PHQ-9 incomplete)</li>
                        <li>GAD-7: 10–14 +1 · ≥15 +2</li>
                        <li>AUDIT-C: ≥4 men / ≥3 women +1 · ≥8 +2</li>
                        <li>PEG: 4–6.9 +1 · ≥7 +2; pain &gt;12 weeks +1</li>
                        <li>ED visits (30 d): 1 +2 · 2 +3 · ≥3 +4; hospital stays (90 d): 1 +3 · ≥2 +4</li>
                        <li>ADL help: 1–2 +1 · 3–4 +2 · 5–6 +3; ≥2 falls or injurious fall +2</li>
                        <li>Polypharmacy ≥5 meds +1, ≥10 +2; adherence fair +1, poor +2</li>
                        <li>Conditions: {CONDITIONS.filter((c) => c.weight > 1).map((c) => c.label.split(' (')[0]).join(', ')} +2 each; others +1</li>
                    </ul>
                </div>
            </div>

            <div className="card">
                <h3 className="text-base mb-3">References</h3>
                <ol className="text-xs text-slate-600 space-y-1 list-decimal pl-5">{REFERENCES.map((r) => <li key={r}>{r}</li>)}</ol>
            </div>
        </div>
    );
}
