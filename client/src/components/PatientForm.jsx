import React from 'react';
import RiskIndicator from './RiskIndicator.jsx';
import {
    calculateRisk,
    INITIAL_PATIENT_STATE,
    CHRONIC_CONDITIONS_LIST,
    MSK_RED_FLAGS_LIST,
} from '../../../shared/risk.js';

export default function PatientForm({ initial, onSave, saving, savedAt }) {

    const [patient, setPatient] = React.useState(() => ({ ...INITIAL_PATIENT_STATE, ...initial }));


    const risk = calculateRisk(patient);

    const toggleCondition = (condition) => {
        setPatient(prev => ({
            ...prev,
            chronicConditions: prev.chronicConditions.includes(condition)
                ? prev.chronicConditions.filter(c => c !== condition)
                : [...prev.chronicConditions, condition]
        }));
    };
    
    const toggleRedFlag = (flag) => {
        setPatient(prev => ({
            ...prev,
            msk_redFlags: prev.msk_redFlags.includes(flag)
                ? prev.msk_redFlags.filter(f => f !== flag)
                : [...prev.msk_redFlags, flag]
        }));
    };

    const handleChange = (field, value) => {
        setPatient(prev => {
            const newState = { ...prev, [field]: value };
            
            // Auto-calculate BMI if height or weight changes
            if (field === 'height' || field === 'weight') {
                const h = field === 'height' ? value : prev.height;
                const w = field === 'weight' ? value : prev.weight;
                if (h && w) {
                    const heightInMeters = h / 100;
                    const calculatedBMI = (w / (heightInMeters * heightInMeters)).toFixed(1);
                    newState.bmi = calculatedBMI;
                }
            }
            
            // Auto-calculate Age if DOB changes
            if (field === 'dob') {
                if (value) {
                    const dobDate = new Date(value);
                    const today = new Date();
                    let age = today.getFullYear() - dobDate.getFullYear();
                    const m = today.getMonth() - dobDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
                        age--;
                    }
                    newState.age = age;
                }
            }

            return newState;
        });
    };

    // Helper to get depression severity label
    const getPHQ9Severity = (score) => {
        if (score >= 20) return { label: "Severe", color: "text-red-600" };
        if (score >= 15) return { label: "Moderately Severe", color: "text-orange-600" };
        if (score >= 10) return { label: "Moderate", color: "text-yellow-600" };
        if (score >= 5) return { label: "Mild", color: "text-blue-600" };
        return { label: "None/Minimal", color: "text-slate-500" };
    };

    const phq9Status = getPHQ9Severity(patient.phq9);

    // Helper for HbA1c Status
    const getHbA1cStatus = (val) => {
        if (!val) return { label: "Not Entered", color: "text-slate-400" };
        if (val > 8.0) return { label: "Poor Control (>8.0)", color: "text-red-600 font-bold" };
        if (val >= 7.0) return { label: "Intermediate (7.0-8.0)", color: "text-yellow-600 font-bold" };
        return { label: "Good Control (<7.0)", color: "text-green-600 font-bold" };
    };
    const hba1cStatus = getHbA1cStatus(patient.hbA1c);

    // Helper for BP Status
    const getBPStatus = (sys, dia) => {
        if (!sys || !dia) return { label: "", color: "text-slate-400" };
        
        if (sys >= 180 || dia >= 120) {
            return { label: "Hypertensive Crisis", color: "text-red-700 font-bold" };
        }
        if (sys >= 160 || dia >= 100) {
            return { label: "Severe HTN (Stage 2+)", color: "text-orange-600 font-bold" };
        }
        if (sys >= 140 || dia >= 90) {
            return { label: "Stage 2 HTN", color: "text-yellow-600 font-bold" };
        }
        if (sys >= 130 || dia >= 80) {
            return { label: "Stage 1 HTN", color: "text-yellow-500" };
        }
        if (sys >= 120 && dia < 80) {
            return { label: "Elevated", color: "text-blue-600" };
        }
        return { label: "Normal", color: "text-green-600" };
    };

    const bpStatus = getBPStatus(patient.bpSystolic, patient.bpDiastolic);

    return (
        <div className="pb-28" data-name="patient-form">

            <RiskIndicator risk={risk} date={savedAt} />

            {onSave && (
                <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                        <div className="text-sm text-slate-500">
                            Calculated risk: <span className="font-semibold text-slate-800">{risk}</span>
                            <span className="hidden sm:inline"> · Saving shares this with the care team instantly.</span>
                        </div>
                        <button
                            onClick={() => onSave(patient)}
                            disabled={saving}
                            className="px-5 py-2.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-dark)] text-white font-medium disabled:opacity-60 flex items-center gap-2"
                        >
                            <div className="icon-save"></div>
                            {saving ? 'Saving…' : 'Save Assessment'}
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column - Demographics, Vitals & Clinical History */}
                <div className="lg:col-span-2 space-y-8">
                    
                    {/* Demographics Section */}
                    <div className="card">
                        <div className="section-title">
                            <div className="icon-user text-[var(--primary)]"></div>
                            <h3>Patient Demographics</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label>Patient Name</label>
                                <input 
                                    type="text" 
                                    value={patient.name} 
                                    onChange={e => handleChange('name', e.target.value)}
                                    placeholder="Enter full name"
                                />
                            </div>
                            <div>
                                <label>Date of Birth</label>
                                <input 
                                    type="date" 
                                    value={patient.dob}
                                    onChange={e => handleChange('dob', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Vitals Section (New) */}
                    <div className="card">
                        <div className="section-title">
                            <div className="icon-heart-pulse text-[var(--primary)]"></div>
                            <h3>Vitals & Measurements</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <label>Age</label>
                                <input 
                                    type="number" 
                                    value={patient.age} 
                                    onChange={e => handleChange('age', e.target.value)}
                                    placeholder="Yrs"
                                />
                            </div>
                            <div>
                                <label>Sex</label>
                                <select value={patient.sex} onChange={e => handleChange('sex', e.target.value)}>
                                    <option>Male</option>
                                    <option>Female</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label>Height (cm)</label>
                                <input 
                                    type="number" 
                                    value={patient.height} 
                                    onChange={e => handleChange('height', e.target.value)}
                                    placeholder="cm"
                                />
                            </div>
                            <div>
                                <label>Weight (kg)</label>
                                <input 
                                    type="number" 
                                    value={patient.weight} 
                                    onChange={e => handleChange('weight', e.target.value)}
                                    placeholder="kg"
                                />
                            </div>
                            <div>
                                <label>BMI</label>
                                <input 
                                    type="number" 
                                    value={patient.bmi} 
                                    readOnly
                                    className="bg-slate-100 cursor-not-allowed"
                                    placeholder="Calc."
                                />
                            </div>
                            
                            <div className="col-span-2 md:col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <label className="mb-2 block text-slate-700 font-semibold text-xs uppercase tracking-wide">Blood Pressure</label>
                                <div className="flex gap-2 items-center">
                                    <div className="w-1/2">
                                        <input 
                                            type="number" 
                                            value={patient.bpSystolic} 
                                            onChange={e => handleChange('bpSystolic', Number(e.target.value))}
                                            placeholder="SYS"
                                            className="text-center"
                                        />
                                    </div>
                                    <span className="text-slate-400">/</span>
                                    <div className="w-1/2">
                                        <input 
                                            type="number" 
                                            value={patient.bpDiastolic} 
                                            onChange={e => handleChange('bpDiastolic', Number(e.target.value))}
                                            placeholder="DIA"
                                            className="text-center"
                                        />
                                    </div>
                                </div>
                                <div className={`text-xs mt-1 text-center min-h-[1rem] ${bpStatus.color}`}>
                                    {bpStatus.label}
                                </div>
                            </div>

                            <div>
                                <label>HbA1c Level (%)</label>
                                <div className="relative mb-1">
                                    <input 
                                        type="number" step="0.1" 
                                        value={patient.hbA1c} 
                                        onChange={e => handleChange('hbA1c', Number(e.target.value))} 
                                    />
                                </div>
                                <div className={`text-xs ${hba1cStatus.color}`}>
                                    {hba1cStatus.label}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chronic Conditions */}
                    <div className="card">
                        <div className="section-title">
                            <div className="icon-activity text-[var(--primary)]"></div>
                            <h3>Chronic Conditions</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            {CHRONIC_CONDITIONS_LIST.map(c => (
                                <label key={c} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${patient.chronicConditions.includes(c) ? 'border-[var(--primary)] bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="checkbox" 
                                        className="mr-3"
                                        checked={patient.chronicConditions.includes(c)} 
                                        onChange={() => toggleCondition(c)} 
                                    />
                                    <span className={`text-sm ${patient.chronicConditions.includes(c) ? 'font-medium text-[var(--primary-dark)]' : 'text-slate-600'}`}>{c}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    
                    {/* Musculoskeletal Pain Assessment */}
                    <div className="card border-l-4 border-l-slate-400">
                        <div className="section-title">
                            <div className="icon-bone text-[var(--primary)]"></div>
                            <h3>Musculoskeletal Pain Assessment</h3>
                        </div>
                        
                        <div className="mb-4">
                            <label className="flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="mr-3 h-5 w-5"
                                    checked={patient.msk_hasComplaint} 
                                    onChange={e => handleChange('msk_hasComplaint', e.target.checked)} 
                                />
                                <span className="font-medium text-slate-900">Does patient have a musculoskeletal complaint?</span>
                            </label>
                        </div>

                        {patient.msk_hasComplaint && (
                            <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-6 pt-4 border-t border-slate-100">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="flex justify-between">
                                            Pain Score (0-10)
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${patient.msk_painScore >= 8 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {patient.msk_painScore}
                                            </span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="10" step="1"
                                            value={patient.msk_painScore} 
                                            onChange={e => handleChange('msk_painScore', Number(e.target.value))}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                                        />
                                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                                            <span>No Pain</span>
                                            <span>Severe</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label>Duration (Weeks)</label>
                                        <input 
                                            type="number" min="0"
                                            value={patient.msk_durationWeeks} 
                                            onChange={e => handleChange('msk_durationWeeks', Number(e.target.value))}
                                            placeholder="Weeks"
                                        />
                                    </div>
                                    <div className="flex items-end pb-2">
                                        <label className="flex items-center cursor-pointer p-2 bg-slate-50 rounded-md border border-slate-200 w-full hover:bg-slate-100 transition-colors">
                                            <input 
                                                type="checkbox" 
                                                className="mr-3"
                                                checked={patient.msk_painAtRestOrNight} 
                                                onChange={e => handleChange('msk_painAtRestOrNight', e.target.checked)} 
                                            />
                                            <span className="text-sm">Pain at Rest / Night?</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                                    <h4 className="text-red-800 text-sm font-bold mb-3 flex items-center gap-2">
                                        <div className="icon-triangle-alert w-4 h-4"></div>
                                        Red Flags Checklist
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {MSK_RED_FLAGS_LIST.map(flag => (
                                            <label key={flag} className="flex items-center cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    className="mr-2 text-red-600 focus:ring-red-500"
                                                    checked={patient.msk_redFlags.includes(flag)} 
                                                    onChange={() => toggleRedFlag(flag)} 
                                                />
                                                <span className="text-sm text-red-900">{flag}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Utilization & Adherence */}
                    <div className="card">
                        <div className="section-title">
                            <div className="icon-hospital text-[var(--primary)]"></div>
                            <h3>Utilization & Adherence</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label>ED Visits (Last 30 Days)</label>
                                <input 
                                    type="number" min="0" 
                                    value={patient.edVisitsLast30Days} 
                                    onChange={e => handleChange('edVisitsLast30Days', Number(e.target.value))} 
                                />
                            </div>
                            <div>
                                <label>Hospitalizations (Last 90 Days)</label>
                                <input 
                                    type="number" min="0"
                                    value={patient.hospitalizationsLast90Days} 
                                    onChange={e => handleChange('hospitalizationsLast90Days', Number(e.target.value))} 
                                />
                            </div>
                            <div>
                                <label>Missed Appointments</label>
                                <input 
                                    type="number" min="0"
                                    value={patient.missedAppointments} 
                                    onChange={e => handleChange('missedAppointments', Number(e.target.value))} 
                                />
                            </div>
                            <div>
                                <label>Medication Adherence</label>
                                <select 
                                    value={patient.medicationAdherence} 
                                    onChange={e => handleChange('medicationAdherence', e.target.value)}
                                >
                                    <option>Good</option>
                                    <option>Fair</option>
                                    <option>Poor</option>
                                </select>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right Column - Social & Screening */}
                <div className="lg:col-span-1 space-y-8">
                    
                    {/* Social Determinants of Health (SDOH) */}
                    <div className="card">
                        <div className="section-title">
                            <div className="icon-home text-[var(--primary)]"></div>
                            <h3>Social Determinants (SDOH)</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label>Housing Instability</label>
                                <select value={patient.housingInstability} onChange={e => handleChange('housingInstability', e.target.value)}>
                                    <option>No</option>
                                    <option>Yes</option>
                                </select>
                            </div>
                            <div>
                                <label>Food Insecurity</label>
                                <select value={patient.foodInsecurity} onChange={e => handleChange('foodInsecurity', e.target.value)}>
                                    <option>No</option>
                                    <option>Yes</option>
                                </select>
                            </div>
                            <div>
                                <label>Transportation Barrier</label>
                                <select value={patient.transportationBarrier} onChange={e => handleChange('transportationBarrier', e.target.value)}>
                                    <option>No</option>
                                    <option>Yes</option>
                                </select>
                            </div>
                            <div>
                                <label>Social Support</label>
                                <select value={patient.socialSupport} onChange={e => handleChange('socialSupport', e.target.value)}>
                                    <option>Good</option>
                                    <option>Poor</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Behavioral & Social */}
                    <div className="card">
                        <div className="section-title">
                            <div className="icon-users text-[var(--primary)]"></div>
                            <h3>Social History & Lifestyle</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-md border border-slate-100 space-y-4">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                                    <div className="icon-heart-handshake text-[var(--primary)]"></div>
                                    <h4 className="text-sm font-semibold text-slate-700">Sexual Health Assessment</h4>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-3">
                                    <div>
                                        <label className="text-xs">Partners</label>
                                        <select value={patient.partners} onChange={e => handleChange('partners', e.target.value)} className="text-sm py-1.5">
                                            <option>Monogamous</option>
                                            <option>Multiple / New</option>
                                            <option>Unknown</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs">Practices</label>
                                        <select value={patient.practices} onChange={e => handleChange('practices', e.target.value)} className="text-sm py-1.5">
                                            <option>Safe</option>
                                            <option>Unsafe</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs">Protection Usage</label>
                                        <select value={patient.protectionFromSTIs} onChange={e => handleChange('protectionFromSTIs', e.target.value)} className="text-sm py-1.5">
                                            <option>Consistent</option>
                                            <option>Inconsistent</option>
                                            <option>None</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs">History of STIs?</label>
                                        <select value={patient.pastSTIs} onChange={e => handleChange('pastSTIs', e.target.value)} className="text-sm py-1.5">
                                            <option>No</option>
                                            <option>Yes</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs">Pregnancy Intention</label>
                                        <select value={patient.pregnancyIntention} onChange={e => handleChange('pregnancyIntention', e.target.value)} className="text-sm py-1.5">
                                            <option>Using Contraception</option>
                                            <option>Trying / Not Using Contraception</option>
                                            <option>Not Active</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label>Tobacco Use</label>
                                <select value={patient.tobaccoUse} onChange={e => handleChange('tobaccoUse', e.target.value)}>
                                    <option>No</option>
                                    <option>Yes</option>
                                </select>
                            </div>
                            {patient.tobaccoUse === 'Yes' && (
                                <div className="pl-4 border-l-2 border-[var(--primary)]">
                                    <label>Tobacco Counseled?</label>
                                    <select value={patient.tobaccoCounseled} onChange={e => handleChange('tobaccoCounseled', e.target.value)}>
                                        <option>No</option>
                                        <option>Yes</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <label>Alcohol Use</label>
                                <select value={patient.alcoholUse} onChange={e => handleChange('alcoholUse', e.target.value)}>
                                    <option>None</option>
                                    <option>Moderate</option>
                                    <option>Heavy</option>
                                </select>
                            </div>
                            <div>
                                <label>Substance Use</label>
                                <select value={patient.substanceUse} onChange={e => handleChange('substanceUse', e.target.value)}>
                                    <option>None</option>
                                    <option>History</option>
                                    <option>Active</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Screening Tools */}
                    <div className="card">
                        <div className="section-title">
                            <div className="icon-clipboard-list text-[var(--primary)]"></div>
                            <h3>Screening Tools</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                                <label className="flex justify-between items-center mb-2">
                                    <span className="font-semibold text-slate-800">PHQ-9 Depression</span>
                                    <span className="text-slate-400 font-normal text-xs">(0-27)</span>
                                </label>
                                <input 
                                    type="number" min="0" max="27" 
                                    value={patient.phq9} 
                                    onChange={e => handleChange('phq9', Number(e.target.value))} 
                                    className="mb-2"
                                />
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Severity:</span>
                                    <span className={`font-bold ${phq9Status.color}`}>{phq9Status.label}</span>
                                </div>
                                
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={patient.phq9_item9 > 0} 
                                            onChange={e => handleChange('phq9_item9', e.target.checked ? 1 : 0)}
                                            className="text-red-600 focus:ring-red-500 rounded"
                                        />
                                        <span className="text-sm font-medium text-red-800">Item 9 (Suicidal Thoughts) Positive?</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="flex justify-between">
                                    PHQ-2 Score (Pre-screen)
                                    <span className="text-slate-400 font-normal text-xs">(0-6)</span>
                                </label>
                                <input 
                                    type="number" min="0" max="6" 
                                    value={patient.phq2} 
                                    onChange={e => handleChange('phq2', Number(e.target.value))} 
                                />
                            </div>

                            <div>
                                <label className="flex justify-between">
                                    GAD-7 (Anxiety)
                                    <span className="text-slate-400 font-normal text-xs">(0-21)</span>
                                </label>
                                <input 
                                    type="number" min="0" max="21" 
                                    value={patient.gad7} 
                                    onChange={e => handleChange('gad7', Number(e.target.value))} 
                                />
                            </div>
                            
                            <div>
                                <label className="flex justify-between">
                                    AUDIT-C (Alcohol)
                                    <span className="text-slate-400 font-normal text-xs">(0-12)</span>
                                </label>
                                <input 
                                    type="number" min="0" max="12" 
                                    value={patient.auditC} 
                                    onChange={e => handleChange('auditC', Number(e.target.value))} 
                                />
                            </div>
                            
                            <div>
                                <label className="flex justify-between">
                                    PEG Score (Pain)
                                    <span className="text-slate-400 font-normal text-xs">(0-10)</span>
                                </label>
                                <input 
                                    type="number" min="0" max="10" 
                                    value={patient.pegScore} 
                                    onChange={e => handleChange('pegScore', Number(e.target.value))} 
                                />
                            </div>
                            
                            <div>
                                <label>BH Assessment</label>
                                <select value={patient.bhAssessment} onChange={e => handleChange('bhAssessment', e.target.value)}>
                                    <option>Not Done</option>
                                    <option>Normal</option>
                                    <option>Needs Follow-up</option>
                                    <option>High Risk</option>
                                </select>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}