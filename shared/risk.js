/**
 * Calculates patient risk level based on clinical and social factors.
 * Uses a priority system to ensure higher risks take precedence.
 */
export function calculateRisk(patient) {
  // Define risk levels with numeric priority
  const LEVELS = {
    STABLE: { value: 0, label: "Stable" },
    RISING: { value: 1, label: "Rising Risk" },
    HIGH: { value: 2, label: "High Risk" },
    CRITICAL: { value: 3, label: "Critical" }
  };

  // Start at Stable
  let currentRisk = LEVELS.STABLE;

  // Helper to upgrade risk if the new risk is higher than current
  const assess = (condition, riskLevel) => {
    if (condition && riskLevel.value > currentRisk.value) {
      currentRisk = riskLevel;
    }
  };

  // 1. EVALUATE STANDARD CLINICAL & UTILIZATION FACTORS
  
  // --- CRITICAL RISK FACTORS ---
  assess(patient.edVisitsLast30Days >= 2, LEVELS.CRITICAL);

  // --- HYPERTENSION STRATIFICATION (NEW) ---
  // Hypertensive Crisis / Emergency zone -> Critical
  if (patient.bpSystolic && patient.bpDiastolic) {
      assess(patient.bpSystolic >= 180 || patient.bpDiastolic >= 120, LEVELS.CRITICAL);
      
      // Severe Hypertension (Stage 2 High) -> High Risk
      assess(patient.bpSystolic >= 160 || patient.bpDiastolic >= 100, LEVELS.HIGH);
      
      // Uncontrolled Hypertension (Stage 2) -> Rising Risk
      assess(patient.bpSystolic >= 140 || patient.bpDiastolic >= 90, LEVELS.RISING);
  }

  // --- HIGH RISK FACTORS ---
  assess(patient.hospitalizationsLast90Days >= 1, LEVELS.HIGH);
  
  const highRiskConditions = ["Heart Failure", "CKD", "Cancer"];
  const hasHighRiskCondition = patient.chronicConditions && patient.chronicConditions.some(c => highRiskConditions.includes(c));
  assess(hasHighRiskCondition, LEVELS.HIGH);

  // --- DIABETES & HbA1c STRATIFICATION ---
  // Poor Control (>8%): Significantly increased risk of acute/chronic complications & ED use
  assess(patient.hbA1c > 8.0, LEVELS.HIGH);
  
  // Intermediate Control (7-8%): Elevated risk compared to baseline
  assess(patient.hbA1c >= 7.0 && patient.hbA1c <= 8.0, LEVELS.RISING);

  // --- DEPRESSION & MENTAL HEALTH STRATIFICATION ---
  // PHQ-9 Item 9 (Suicidality) -> Immediate High Risk / Critical Action
  assess(patient.phq9_item9 > 0, LEVELS.HIGH); 
  
  // PHQ-9 Severity Bands
  assess(patient.phq9 >= 15, LEVELS.HIGH);
  assess(patient.phq9 >= 10, LEVELS.RISING);
  
  assess(patient.gad7 >= 15, LEVELS.HIGH); // Severe Anxiety
  assess(patient.auditC >= 8, LEVELS.HIGH); // Harmful Alcohol Use
  assess(patient.substanceUse === "Active", LEVELS.HIGH);

  // --- RISING RISK FACTORS ---
  assess(patient.medicationAdherence === "Poor", LEVELS.RISING);
  assess(patient.missedAppointments >= 2, LEVELS.RISING);
  
  assess(patient.phq2 >= 3, LEVELS.RISING);
  assess(patient.gad7 >= 10, LEVELS.RISING); // Moderate Anxiety
  assess(patient.auditC >= 4, LEVELS.RISING); // Hazardous Alcohol Use
  assess(patient.pegScore >= 7, LEVELS.RISING);
  assess(patient.bhAssessment === "High Risk", LEVELS.RISING);
  assess(patient.alcoholUse === "Heavy", LEVELS.RISING);
  assess(patient.tobaccoUse === "Yes" && patient.tobaccoCounseled === "No", LEVELS.RISING);

  // 2. MUSCULOSKELETAL PAIN ASSESSMENT
  const redFlags = patient.msk_redFlags || [];
  if (patient.msk_hasComplaint) {
      // Red Flags Logic
      if (redFlags.includes("Neurologic Deficits")) {
          assess(true, LEVELS.CRITICAL);
      }
      
      if (redFlags.length > 0) {
          assess(true, LEVELS.HIGH);
      }

      // Pain Characteristics
      assess(patient.msk_painAtRestOrNight, LEVELS.HIGH);
      assess(patient.msk_painScore >= 8, LEVELS.HIGH);
      assess(patient.msk_painScore >= 5, LEVELS.RISING);
      assess(patient.msk_durationWeeks > 4, LEVELS.RISING);
  }

  // 3. EVALUATE SEXUAL HISTORY SCORE
  let sexualRiskScore = 0;
  if (patient.partners !== "Monogamous") sexualRiskScore += 2;
  if (patient.practices !== "Safe") sexualRiskScore += 2;
  if (patient.protectionFromSTIs !== "Consistent") sexualRiskScore += 2;
  if (patient.pastSTIs === "Yes") sexualRiskScore += 1;
  if (patient.pregnancyIntention === "Trying / Not Using Contraception") sexualRiskScore += 1;

  if (sexualRiskScore >= 5) {
    assess(true, LEVELS.HIGH);
  } else if (sexualRiskScore >= 3) {
    assess(true, LEVELS.RISING);
  }

  // 4. APPLY SDOH ESCALATION LOGIC
  const hasSDOH = 
    patient.housingInstability === "Yes" || 
    patient.foodInsecurity === "Yes" ||
    patient.transportationBarrier === "Yes" || 
    patient.socialSupport === "Poor";

  if (hasSDOH) {
    if (currentRisk.label === "Stable") {
      currentRisk = LEVELS.RISING;
    } else if (currentRisk.label === "Rising Risk") {
      currentRisk = LEVELS.HIGH;
    }
  }

  return currentRisk.label;
}

export const INITIAL_PATIENT_STATE = {
    name: "",
    dob: "",
    age: "",
    sex: "Male",
    height: "",
    weight: "",
    bmi: "",
    bpSystolic: "",
    bpDiastolic: "",
    hbA1c: 0, 
    
    chronicConditions: [],
    edVisitsLast30Days: 0,
    hospitalizationsLast90Days: 0,
    medicationAdherence: "Good",
    missedAppointments: 0,

    tobaccoUse: "No",
    tobaccoCounseled: "No",
    alcoholUse: "None",
    substanceUse: "None",
    
    // Musculoskeletal
    msk_hasComplaint: false,
    msk_painScore: 0,
    msk_durationWeeks: 0,
    msk_painAtRestOrNight: false,
    msk_redFlags: [],

    // Detailed Sexual History
    partners: "Monogamous",
    practices: "Safe",
    protectionFromSTIs: "Consistent",
    pastSTIs: "No",
    pregnancyIntention: "Using Contraception",

    // SDOH
    housingInstability: "No",
    foodInsecurity: "No",
    transportationBarrier: "No",
    socialSupport: "Good",

    pegScore: 0,
    phq2: 0,
    phq9: 0,
    phq9_item9: 0, 
    gad7: 0, 
    auditC: 0, 
    bhAssessment: "Not Done"
};

export const CHRONIC_CONDITIONS_LIST = [
    "Diabetes",
    "Hypertension",
    "Heart Failure",
    "COPD",
    "Asthma",
    "CKD",
    "Cancer",
    "Depression",
    "Substance Use Disorder"
];

export const MSK_RED_FLAGS_LIST = [
    "Fever / Chills",
    "Unexplained Weight Loss",
    "History of Cancer",
    "IV Drug Use",
    "Significant Trauma",
    "Neurologic Deficits"
];

export const RISK_LEVELS = ["Stable", "Rising Risk", "High Risk", "Critical"];
