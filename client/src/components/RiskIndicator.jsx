import React from 'react';

export default function RiskIndicator({ risk, date }) {
    const RISK_CONFIG = {
        "Critical": {
            styles: {
                bg: "bg-red-50",
                border: "border-red-200",
                text: "text-red-700",
                badge: "bg-red-100 text-red-800",
                icon: "icon-siren",
                color: "#ef4444"
            },
            actions: [
                "Immediate intervention / contact same day",
                "Urgent in-person evaluation",
                "Full care coordination across providers",
                "Daily monitoring (telehealth / RPM)",
                "Crisis or behavioral health support",
                "Escalate to clinical leadership if needed"
            ]
        },
        "High Risk": {
            styles: {
                bg: "bg-orange-50",
                border: "border-orange-200",
                text: "text-orange-700",
                badge: "bg-orange-100 text-orange-800",
                icon: "icon-triangle-alert",
                color: "#f97316"
            },
            actions: [
                "Immediate patient contact",
                "Enroll in intensive care management programs",
                "Arrange rapid follow-up (24–48h)",
                "Coordinate with hospital / SNF / home health",
                "Provide targeted interventions (meds, social, transport)"
            ]
        },
        "Rising Risk": {
            styles: {
                bg: "bg-yellow-50",
                border: "border-yellow-200",
                text: "text-yellow-700",
                badge: "bg-yellow-100 text-yellow-800",
                icon: "icon-trending-up",
                color: "#eab308"
            },
            actions: [
                "Early care team outreach (phone / portal)",
                "Schedule near-term appointments",
                "Behavioral counseling / health coaching",
                "Enroll in preventive or early care management programs",
                "Monitor labs & vitals"
            ]
        },
        "Stable": {
            styles: {
                bg: "bg-green-50",
                border: "border-green-200",
                text: "text-green-700",
                badge: "bg-green-100 text-green-800",
                icon: "icon-circle-check",
                color: "#22c55e"
            },
            actions: [
                "Routine follow-ups",
                "Preventive care reminders",
                "Patient education",
                "Monitor via portal / RPM"
            ]
        }
    };

    const config = RISK_CONFIG[risk] || RISK_CONFIG["Stable"];
    const { styles, actions } = config;

    return (
        <div className={`rounded-xl border ${styles.border} ${styles.bg} mb-8 transition-all duration-300 ease-in-out overflow-hidden`}>
            {/* Header / Status Section */}
            <div className="p-6 pb-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full bg-white shadow-sm ring-1 ring-inset ${styles.border}`}>
                            <div className={`${styles.icon} text-3xl`} style={{ color: styles.color }}></div>
                        </div>
                        <div className="text-center sm:text-left">
                            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Current Risk Stratification</h2>
                            <div className={`text-3xl font-bold ${styles.text} tracking-tight`}>{risk}</div>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <div className="flex items-center justify-between sm:justify-end gap-2 text-sm text-slate-600 bg-white/60 px-3 py-1.5 rounded-lg border border-white/50 shadow-sm">
                            <span>{date ? "Last Saved:" : "Assessment Date:"}</span>
                            <span className="font-medium">{(date ? new Date(date) : new Date()).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions / Protocol Section */}
            <div className="px-6 py-4 bg-white/50 border-t border-white/50 backdrop-blur-sm">
                <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <div className="icon-clipboard-list text-slate-400"></div>
                        Recommended Clinical Actions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                        {actions.map((action, index) => (
                            <div key={index} className="flex items-start gap-2 text-sm text-slate-700">
                                <div className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0`} style={{ backgroundColor: styles.color }}></div>
                                <span>{action}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}