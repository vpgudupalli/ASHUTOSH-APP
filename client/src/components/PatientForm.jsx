import React from 'react';
import {
    scoreAssessment, INITIAL_ASSESSMENT, CONDITIONS, URGENT_SYMPTOMS, DISABILITIES, ADLS, PAIN_RED_FLAGS,
    PHQ9_ITEMS, GAD7_ITEMS, FREQ_OPTIONS, AUDITC_ITEMS, PEG_ITEMS, bmi, bpCategory, PHQ9_BANDS, GAD7_BANDS,
} from '../../../shared/risk.js';
import { Chips, CheckList, Num, Question, FrequencyGrid, Section } from './Fields.jsx';
import RiskBadge from './RiskBadge.jsx';

const SECTIONS = [
    { id: 'today', label: 'Today', icon: 'icon-heart-pulse', domains: ['symptoms'] },
    { id: 'about', label: 'About me', icon: 'icon-user', domains: [] },
    { id: 'vitals', label: 'Vitals', icon: 'icon-activity', domains: ['vitals'] },
    { id: 'conditions', label: 'Conditions & meds', icon: 'icon-pill', domains: ['conditions', 'medications'] },
    { id: 'care', label: 'Hospital & ED', icon: 'icon-hospital', domains: ['utilization'] },
    { id: 'function', label: 'Daily living', icon: 'icon-accessibility', domains: ['function'] },
    { id: 'lifestyle', label: 'Lifestyle', icon: 'icon-footprints', domains: ['lifestyle', 'substance'] },
    { id: 'mental', label: 'Mood', icon: 'icon-brain', domains: ['mental'] },
    { id: 'pain', label: 'Pain', icon: 'icon-bone', domains: ['pain'] },
    { id: 'sexual', label: 'Sexual health', icon: 'icon-heart-handshake', domains: ['sexual'] },
    { id: 'social', label: 'Home & resources', icon: 'icon-home', domains: ['sdoh'] },
    { id: 'note', label: 'Message', icon: 'icon-message-square', domains: [] },
];

const YN = ['Yes', 'No'];

export default function PatientForm({ initial, onSave, saving, isPatient }) {
    const [d, setD] = React.useState(() => ({ ...INITIAL_ASSESSMENT, ...initial, patientNote: '', wantsCallback: false, urgentSymptoms: [], feelingToday: '' }));
    const set = (field) => (value) => setD((prev) => ({ ...prev, [field]: value }));
    const result = React.useMemo(() => scoreAssessment(d), [d]);
    const assessed = Object.fromEntries(result.domains.map((x) => [x.key, x.assessed]));
    const sectionDone = (s) => s.domains.length > 0 && s.domains.some((k) => assessed[k]);

    const b = bmi(d);
    const bpCat = bpCategory(d.bpSystolic === '' ? null : Number(d.bpSystolic), d.bpDiastolic === '' ? null : Number(d.bpDiastolic));
    const phq9Total = result.derived.phq9;
    const gadTotal = result.derived.gad7;
    const item9 = Number(d.phq?.[8]) > 0;
    const you = isPatient ? 'you' : 'the patient';
    const your = isPatient ? 'your' : "the patient's";

    return (
        <div className="lg:grid lg:grid-cols-[200px_1fr] gap-6 pb-28" data-name="patient-form">
            {/* Section navigation */}
            <nav className="hidden lg:block">
                <div className="sticky top-24 space-y-0.5">
                    {SECTIONS.map((s) => (
                        <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }); }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-white hover:text-slate-900">
                            <span className={`${s.icon} text-slate-400`}></span>
                            <span className="flex-1">{s.label}</span>
                            {sectionDone(s) && <span className="icon-circle-check text-green-500 text-xs"></span>}
                        </a>
                    ))}
                </div>
            </nav>

            <div className="space-y-6 min-w-0">
                {(result.emergency || item9) && (
                    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
                        <div className="font-bold flex items-center gap-2 text-lg"><span className="icon-siren"></span>{isPatient ? 'If this is happening now, get help right away' : 'Urgent safety finding'}</div>
                        <ul className="mt-2 text-sm space-y-1 list-disc pl-5">
                            {result.emergency && <li>For chest pain, trouble breathing, stroke signs, fainting or severe bleeding: <b>call 911</b> or go to the nearest emergency room.</li>}
                            {(item9 || d.urgentSymptoms.includes('selfharm')) && <li>For thoughts of hurting yourself: call or text <b>988</b> (Suicide &amp; Crisis Lifeline), available 24/7.</li>}
                            <li>{isPatient ? 'Saving this check-in alerts your care team immediately, but do not wait for them in an emergency.' : 'Care team must contact the patient today.'}</li>
                        </ul>
                    </div>
                )}

                <Section id="today" icon="icon-heart-pulse" title="How are you feeling today?" done={sectionDone(SECTIONS[0])}>
                    <Chips options={['Good', 'Okay', 'Not well', 'Very unwell']} value={d.feelingToday} onChange={set('feelingToday')} />
                    <Question label={`Do ${you} have any of these right now?`} help="Select any that apply. These are emergency warning signs.">
                        <CheckList items={URGENT_SYMPTOMS} value={d.urgentSymptoms} onChange={set('urgentSymptoms')} tone="red" />
                    </Question>
                </Section>

                <Section id="about" icon="icon-user" title="About me">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label>Full name</label><input type="text" value={d.name} onChange={(e) => set('name')(e.target.value)} /></div>
                        <div><label>Date of birth</label><input type="date" value={d.dob} onChange={(e) => set('dob')(e.target.value)} /></div>
                        <div><label>Phone</label><input type="text" inputMode="tel" value={d.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="(555) 555-5555" /></div>
                        <div><label>Preferred language</label><input type="text" value={d.preferredLanguage} onChange={(e) => set('preferredLanguage')(e.target.value)} /></div>
                    </div>
                    <Question label="Sex assigned at birth"><Chips options={['Female', 'Male', 'Intersex / other']} value={d.sex} onChange={set('sex')} /></Question>
                    <Question label="Best way for the care team to reach me"><Chips options={['Phone call', 'Text message', 'App message', 'Email']} value={d.preferredContact} onChange={set('preferredContact')} /></Question>
                    <div className="max-w-sm"><label>Best time to reach me</label><input type="text" value={d.bestTime} onChange={(e) => set('bestTime')(e.target.value)} placeholder="e.g. weekdays after 3pm" /></div>
                </Section>

                <Section id="vitals" icon="icon-activity" title="Vitals & measurements" subtitle="Fill in whatever you have. Leave blank anything you don't know." done={sectionDone(SECTIONS[2])}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Num label="Height (feet)" value={d.heightFt} onChange={set('heightFt')} unit="ft" max={8} />
                        <Num label="Height (inches)" value={d.heightIn} onChange={set('heightIn')} unit="in" max={11} />
                        <Num label="Weight" value={d.weightLb} onChange={set('weightLb')} unit="lb" />
                        <div><label>BMI</label><input type="text" readOnly value={b ?? ''} placeholder="Auto" className="bg-slate-100" /></div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Num label="Blood pressure – top" value={d.bpSystolic} onChange={set('bpSystolic')} unit="mmHg" placeholder="e.g. 128" />
                        <Num label="Blood pressure – bottom" value={d.bpDiastolic} onChange={set('bpDiastolic')} unit="mmHg" placeholder="e.g. 82"
                            hint={bpCat && <span className={/Severe|≥160/.test(bpCat) ? 'text-red-600 font-semibold' : /Stage/.test(bpCat) ? 'text-orange-600' : 'text-slate-500'}>{bpCat}</span>} />
                        <Num label="Heart rate" value={d.heartRate} onChange={set('heartRate')} unit="bpm" />
                        <Num label="Oxygen level" value={d.spo2} onChange={set('spo2')} unit="%" max={100} />
                        <Num label="Temperature" value={d.tempF} onChange={set('tempF')} unit="°F" step="0.1" />
                        <Num label="Blood sugar" value={d.glucose} onChange={set('glucose')} unit="mg/dL" />
                        <div><label>Blood sugar taken</label>
                            <select value={d.glucoseContext} onChange={(e) => set('glucoseContext')(e.target.value)}>
                                <option value="">—</option><option>Fasting</option><option>Before a meal</option><option>After a meal</option><option>Random</option>
                            </select>
                        </div>
                        <Num label="Last HbA1c" value={d.hbA1c} onChange={set('hbA1c')} unit="%" step="0.1" hint={d.hbA1c !== '' && <span className="text-slate-500">{Number(d.hbA1c) > 9 ? 'Poor control' : Number(d.hbA1c) >= 7 ? 'Above goal' : 'At goal (<7%)'}</span>} />
                    </div>
                </Section>

                <Section id="conditions" icon="icon-pill" title="Health conditions & medications" done={sectionDone(SECTIONS[3])}>
                    <Question label={`Which conditions ${isPatient ? 'have you been told you have' : 'does the patient have'}?`}>
                        <CheckList items={CONDITIONS} value={d.conditions} onChange={set('conditions')} cols={3} />
                    </Question>
                    <div><label>Other conditions</label><input type="text" value={d.otherConditions} onChange={(e) => set('otherConditions')(e.target.value)} placeholder="Anything not listed above" /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Num label="How many prescription medicines do you take daily?" value={d.medCount} onChange={set('medCount')} />
                    </div>
                    <Question label="How often do you take your medicines as prescribed?">
                        <Chips options={[{ key: 'Good', label: 'Always / almost always' }, { key: 'Fair', label: 'Sometimes miss' }, { key: 'Poor', label: 'Often miss' }]} value={d.medicationAdherence} onChange={set('medicationAdherence')} />
                    </Question>
                    <div><label>Any problems with your medicines? (cost, side effects, refills)</label><input type="text" value={d.medicationConcerns} onChange={(e) => set('medicationConcerns')(e.target.value)} /></div>
                </Section>

                <Section id="care" icon="icon-hospital" title="Hospital, ER & appointments" done={sectionDone(SECTIONS[4])}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Num label="ER / ED visits – last 30 days" value={d.edVisits30d} onChange={set('edVisits30d')} />
                        <Num label="Hospital stays – last 90 days" value={d.hospitalizations90d} onChange={set('hospitalizations90d')} />
                        <Num label="Missed appointments – last 6 months" value={d.missedAppointments} onChange={set('missedAppointments')} />
                    </div>
                </Section>

                <Section id="function" icon="icon-accessibility" title="Daily living, falls & disabilities" done={sectionDone(SECTIONS[5])}>
                    <Question label="Do you need help from another person with any of these?">
                        <CheckList items={ADLS} value={d.adlHelp} onChange={set('adlHelp')} cols={3} />
                    </Question>
                    <Question label="Do you use a mobility aid?"><Chips options={['None', 'Cane', 'Walker', 'Wheelchair', 'Scooter']} value={d.mobilityAid} onChange={set('mobilityAid')} /></Question>
                    <Question label="How many times have you fallen in the past 12 months?">
                        <Chips options={['0', '1', '2+']} value={d.falls12mo} onChange={set('falls12mo')} />
                        {d.falls12mo && d.falls12mo !== '0' && (
                            <label className="!mb-0 flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={d.fallInjury} onChange={(e) => set('fallInjury')(e.target.checked)} />I was injured in a fall</label>
                        )}
                    </Question>
                    <Question label="Do you have any of these disabilities or limitations?" help="This helps your care team communicate with you the best way.">
                        <CheckList items={DISABILITIES} value={d.disabilities} onChange={set('disabilities')} />
                    </Question>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Question label="Do you live alone?"><Chips options={YN} value={d.livesAlone} onChange={set('livesAlone')} /></Question>
                        <Question label="Do you have a caregiver or someone who helps you?"><Chips options={YN} value={d.hasCaregiver} onChange={set('hasCaregiver')} /></Question>
                    </div>
                </Section>

                <Section id="lifestyle" icon="icon-footprints" title="Lifestyle" done={sectionDone(SECTIONS[6])}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Num label="Days per week you exercise (brisk walk or more)" value={d.activityDays} onChange={set('activityDays')} max={7} />
                        <Num label="Minutes each time" value={d.activityMinutes} onChange={set('activityMinutes')} unit="min" />
                        <Num label="Hours of sleep per night" value={d.sleepHours} onChange={set('sleepHours')} unit="hrs" step="0.5" />
                    </div>
                    <Question label="Tobacco (cigarettes, cigars, chew)">
                        <Chips options={['Never', 'Former', 'Current']} value={d.tobacco} onChange={set('tobacco')} />
                        <label className="!mb-0 flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={d.vaping} onChange={(e) => set('vaping')(e.target.checked)} />I currently vape / use e-cigarettes</label>
                    </Question>
                    <Question label="Alcohol" help="1 drink = 12 oz beer, 5 oz wine, or 1.5 oz liquor">
                        {AUDITC_ITEMS.map((item, i) => (i > 0 && d.auditC[0] === 0) ? null : (
                            <div key={i}>
                                <div className="text-sm text-slate-700 mb-1.5">{item.q}</div>
                                <Chips options={item.options.map((label, v) => ({ key: v, label }))} value={d.auditC[i]}
                                    onChange={(v) => { const next = [...d.auditC]; next[i] = v === '' ? null : v; setD((p) => ({ ...p, auditC: next })); }} />
                            </div>
                        ))}
                    </Question>
                    <Question label="In the past year, have you used a recreational drug or a prescription medicine for non-medical reasons?">
                        <Chips options={[{ key: 'Never', label: 'No' }, { key: 'Past year', label: 'Yes, in the past year' }, { key: 'Current', label: 'Yes, in the past 30 days' }]} value={d.drugUse} onChange={set('drugUse')} />
                    </Question>
                </Section>

                <Section id="mental" icon="icon-brain" title="Mood & stress" subtitle="Over the last 2 weeks, how often have you been bothered by the following?" done={sectionDone(SECTIONS[7])}>
                    <FrequencyGrid items={PHQ9_ITEMS} options={FREQ_OPTIONS} value={d.phq} onChange={set('phq')} highlight={8} />
                    {phq9Total !== null && <div className="text-sm text-slate-600">Depression (PHQ-9): <b>{phq9Total}</b> – {PHQ9_BANDS(phq9Total)}</div>}
                    <div className="text-sm font-medium text-slate-800 pt-2">Anxiety – over the last 2 weeks, how often have you been bothered by:</div>
                    <FrequencyGrid items={GAD7_ITEMS} options={FREQ_OPTIONS} value={d.gad} onChange={set('gad')} />
                    {gadTotal !== null && <div className="text-sm text-slate-600">Anxiety (GAD-7): <b>{gadTotal}</b> – {GAD7_BANDS(gadTotal)}</div>}
                </Section>

                <Section id="pain" icon="icon-bone" title="Pain" done={sectionDone(SECTIONS[8])}>
                    <Question label="Do you have pain in your back, joints, or muscles?"><Chips options={YN} value={d.painHas} onChange={set('painHas')} /></Question>
                    {d.painHas === 'Yes' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label>Where is the pain?</label><input type="text" value={d.painLocation} onChange={(e) => set('painLocation')(e.target.value)} placeholder="e.g. lower back, right knee" /></div>
                                <Num label="How many weeks have you had it?" value={d.painWeeks} onChange={set('painWeeks')} unit="weeks" />
                            </div>
                            {PEG_ITEMS.map((q, i) => (
                                <div key={i}>
                                    <label className="flex justify-between">{q}<span className="font-bold text-slate-900">{d.peg[i] ?? '–'}</span></label>
                                    <input type="range" min="0" max="10" value={d.peg[i] ?? 0} className="w-full accent-[var(--primary)]"
                                        onChange={(e) => { const next = [...d.peg]; next[i] = Number(e.target.value); setD((p) => ({ ...p, peg: next })); }} />
                                </div>
                            ))}
                            <label className="!mb-0 flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={d.painRestNight} onChange={(e) => set('painRestNight')(e.target.checked)} />Pain is there even at rest or wakes me at night</label>
                            <Question label="Do any of these apply?">
                                <CheckList items={PAIN_RED_FLAGS} value={d.painRedFlags} onChange={set('painRedFlags')} tone="red" />
                            </Question>
                        </>
                    )}
                </Section>

                <Section id="sexual" icon="icon-heart-handshake" title="Sexual health" subtitle="Private and confidential – shared only with your care team. Skip anything you prefer not to answer." done={sectionDone(SECTIONS[9])}>
                    <Question label="Have you been sexually active in the past 12 months?"><Chips options={['Yes', 'No', 'Prefer not to say']} value={d.sexActive} onChange={set('sexActive')} /></Question>
                    {d.sexActive === 'Yes' && (
                        <>
                            <Question label="Number of partners in the past 12 months">
                                <Chips options={['1', '2–4', '5+']} value={d.sexPartners} onChange={set('sexPartners')} />
                                <label className="!mb-0 flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={d.sexNewPartner} onChange={(e) => set('sexNewPartner')(e.target.checked)} />I have a new partner in the past 3 months</label>
                            </Question>
                            <Question label="How often do you use condoms?"><Chips options={['Always', 'Sometimes', 'Never', 'Not applicable']} value={d.sexCondom} onChange={set('sexCondom')} /></Question>
                            <Question label="Have you had a sexually transmitted infection (STI) in the past 12 months?"><Chips options={YN} value={d.sexSti12mo} onChange={set('sexSti12mo')} /></Question>
                            <Question label="Pregnancy plans">
                                <Chips options={['Not applicable', 'Using birth control', 'Trying to get pregnant', 'Not using birth control, do not want pregnancy']} value={d.sexPregnancy} onChange={set('sexPregnancy')} />
                            </Question>
                            <label className="!mb-0 flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={d.sexWantsTesting} onChange={(e) => set('sexWantsTesting')(e.target.checked)} />I would like STI / HIV testing</label>
                        </>
                    )}
                </Section>

                <Section id="social" icon="icon-home" title="Home & resources" subtitle="Your answers help us connect you with support." done={sectionDone(SECTIONS[10])}>
                    <Question label="What is your living situation today?"><Chips options={['Steady place to live', 'Steady, but worried about losing it', 'No steady place']} value={d.sdohHousing} onChange={set('sdohHousing')} /></Question>
                    <Question label="In the past 12 months, did you worry your food would run out before you had money to buy more?"><Chips options={['Never', 'Sometimes', 'Often']} value={d.sdohFood} onChange={set('sdohFood')} /></Question>
                    <Question label="In the past 12 months, has lack of transportation kept you from medical appointments or getting medicine?"><Chips options={YN} value={d.sdohTransport} onChange={set('sdohTransport')} /></Question>
                    <Question label="In the past 12 months, has the electric, gas, oil, or water company threatened to shut off services?"><Chips options={['No', 'Yes', 'Already shut off']} value={d.sdohUtilities} onChange={set('sdohUtilities')} /></Question>
                    <Question label="How hard is it to pay for basics like food, housing, medical care, and heating?"><Chips options={['Not hard', 'Somewhat', 'Very hard']} value={d.sdohFinancial} onChange={set('sdohFinancial')} /></Question>
                    <Question label="How often do you feel lonely or isolated?"><Chips options={['Never', 'Rarely', 'Sometimes', 'Often', 'Always']} value={d.sdohLonely} onChange={set('sdohLonely')} /></Question>
                    <Question label="Do you feel unsafe at home, or has anyone hurt, threatened, or scared you?" help="If you are in danger now, call 911. National Domestic Violence Hotline: 1-800-799-7233.">
                        <Chips options={YN} value={d.sdohSafety} onChange={set('sdohSafety')} />
                    </Question>
                </Section>

                <Section id="note" icon="icon-message-square" title={isPatient ? 'Message to my care team' : 'Note from patient (optional)'}>
                    <textarea
                        rows={4} value={d.patientNote} onChange={(e) => set('patientNote')(e.target.value)}
                        placeholder={isPatient ? 'Anything you want your nurse, provider, or case manager to know – new symptoms, questions, what you need help with…' : 'Patient-reported concerns'}
                        className="w-full rounded-md border border-slate-300 shadow-sm px-4 py-2 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                    <label className="!mb-0 flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={d.wantsCallback} onChange={(e) => set('wantsCallback')(e.target.checked)} />{isPatient ? 'Please call me back' : 'Patient requests a call back'}</label>
                </Section>
            </div>

            {/* Sticky save bar */}
            <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                    <div className="text-sm text-slate-500 flex items-center gap-3 min-w-0">
                        {!isPatient && <RiskBadge risk={result.tier} />}
                        <span className="truncate">
                            {isPatient
                                ? <>{result.completeness}% complete · Saving sends this to your care team instantly.</>
                                : <>Score {result.score}/{result.maxScore} · {result.completeness}% complete</>}
                        </span>
                    </div>
                    <button onClick={() => onSave(d)} disabled={saving} className="btn-primary !px-5 !py-2.5 shrink-0">
                        <div className="icon-send"></div>{saving ? 'Saving…' : isPatient ? 'Send to care team' : 'Save assessment'}
                    </button>
                </div>
            </div>
        </div>
    );
}
