import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Main Function ────────────────────────────────────────────────────────────
export async function extractBiomarkers(symptomText) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: `You are a clinical behavioral analysis AI assistant.
Your job is to extract behavioral biomarkers from a patient's symptom description.
Respond ONLY with a valid JSON object. No explanation. No markdown. No extra text.

The JSON must follow this exact structure:
{
  "sleep": {
    "sleep_quality": 0-10,
    "sleep_duration_hours": 0-12,
    "daytime_sleepiness": 0-10,
    "sleep_onset_difficulty": 0-10,
    "early_awakening": 0-10
  },
  "stress": {
    "perceived_stress": 0-10,
    "work_overload": 0-10,
    "emotional_exhaustion": 0-10,
    "irritability": 0-10,
    "concentration_difficulty": 0-10
  },
  "activity": {
    "exercise_frequency": 0-7,
    "sedentary_hours": 0-16,
    "physical_fatigue": 0-10,
    "energy_level": 0-10
  },
  "nutrition": {
    "meal_regularity": 0-10,
    "appetite_changes": 0-10,
    "emotional_eating": 0-10,
    "hydration": 0-10,
    "caffeine_level": 0-10
  },
  "psychosomatic": {
    "headache_frequency": 0-10,
    "muscle_tension": 0-10,
    "chest_tightness": 0-10,
    "palpitations": 0-10,
    "ibs_symptoms": 0-10,
    "dizziness": 0-10
  },
  "cognitive": {
    "focus_ability": 0-10,
    "memory_complaints": 0-10,
    "brain_fog": 0-10,
    "decision_making": 0-10
  },
  "emotional": {
    "mood_stability": 0-10,
    "sadness_frequency": 0-10,
    "anxiety_level": 0-10,
    "hopelessness": 0-10,
    "social_withdrawal": 0-10
  },
  "temporal": {
    "work_triggered": 0-10,
    "weekend_improvement": 0-10,
    "morning_severity": 0-10,
    "evening_severity": 0-10
  },
  "confidence": 0-100,
  "key_findings": ["finding1", "finding2", "finding3"],
  "suggested_specialist": "specialty name in Arabic",
  "urgency": "routine | soon | urgent"
}

Rules:
- If information is not mentioned, use neutral value (5 for 0-10 scale)
- confidence = how confident you are based on available information
- key_findings = top 3 clinical observations in Arabic
- suggested_specialist = the most appropriate medical specialty in Arabic`,

    messages: [
      {
        role: "user",
        content: `Patient symptom description:\n"${symptomText}"\n\nExtract behavioral biomarkers as JSON.`,
      },
    ],
  });

  const raw = response.content[0].text.trim();
  const parsed = JSON.parse(raw);
  return parsed;
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────
export function calculateScores(biomarkers) {
  // Each layer score 0-100
  const sleep = avg([
    invert(biomarkers.sleep.sleep_quality),
    biomarkers.sleep.daytime_sleepiness,
    biomarkers.sleep.sleep_onset_difficulty,
    biomarkers.sleep.early_awakening,
  ]);

  const stress = avg([
    biomarkers.stress.perceived_stress,
    biomarkers.stress.work_overload,
    biomarkers.stress.emotional_exhaustion,
    biomarkers.stress.irritability,
    biomarkers.stress.concentration_difficulty,
  ]);

  const activity = avg([
    biomarkers.activity.physical_fatigue,
    invert(biomarkers.activity.energy_level),
    normalize(biomarkers.activity.sedentary_hours, 0, 16),
  ]);

  const nutrition = avg([
    invert(biomarkers.nutrition.meal_regularity),
    biomarkers.nutrition.appetite_changes,
    biomarkers.nutrition.emotional_eating,
    invert(biomarkers.nutrition.hydration),
  ]);

  const psychosomatic = avg([
    biomarkers.psychosomatic.headache_frequency,
    biomarkers.psychosomatic.muscle_tension,
    biomarkers.psychosomatic.chest_tightness,
    biomarkers.psychosomatic.palpitations,
    biomarkers.psychosomatic.ibs_symptoms,
    biomarkers.psychosomatic.dizziness,
  ]);

  const cognitive = avg([
    invert(biomarkers.cognitive.focus_ability),
    biomarkers.cognitive.memory_complaints,
    biomarkers.cognitive.brain_fog,
    invert(biomarkers.cognitive.decision_making),
  ]);

  const emotional = avg([
    invert(biomarkers.emotional.mood_stability),
    biomarkers.emotional.sadness_frequency,
    biomarkers.emotional.anxiety_level,
    biomarkers.emotional.hopelessness,
    biomarkers.emotional.social_withdrawal,
  ]);

  const temporal = avg([
    biomarkers.temporal.work_triggered,
    biomarkers.temporal.morning_severity,
    biomarkers.temporal.evening_severity,
    invert(biomarkers.temporal.weekend_improvement),
  ]);

  // Weighted Final Score
  const finalScore =
    sleep        * 0.15 +
    stress       * 0.15 +
    activity     * 0.10 +
    nutrition    * 0.10 +
    psychosomatic * 0.15 +
    cognitive    * 0.10 +
    emotional    * 0.15 +
    temporal     * 0.10;

  const riskLevel =
    finalScore >= 70 ? "HIGH" :
    finalScore >= 45 ? "MODERATE" : "LOW";

  return {
    layers: {
      sleep:         Math.round(sleep),
      stress:        Math.round(stress),
      activity:      Math.round(activity),
      nutrition:     Math.round(nutrition),
      psychosomatic: Math.round(psychosomatic),
      cognitive:     Math.round(cognitive),
      emotional:     Math.round(emotional),
      temporal:      Math.round(temporal),
    },
    finalScore: Math.round(finalScore),
    riskLevel,
  };
}

// ─── Report Generator ─────────────────────────────────────────────────────────
export async function generateMedicalReport(symptomText, biomarkers, scores) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: `You are a clinical report generator for physicians.
Generate a concise, professional medical behavioral report in Arabic.
Respond ONLY with a valid JSON object. No markdown. No extra text.

JSON structure:
{
  "summary": "2-3 sentence clinical summary in Arabic",
  "key_findings": ["finding1", "finding2", "finding3"],
  "behavioral_pattern": "description of the behavioral pattern in Arabic",
  "differential_considerations": ["consideration1", "consideration2"],
  "recommended_workup": ["test1", "test2"],
  "specialist_recommendation": {
    "primary": "specialty in Arabic",
    "secondary": "specialty in Arabic",
    "urgency": "routine | soon | urgent",
    "urgency_reason": "reason in Arabic"
  },
  "physician_note": "important note for the physician in Arabic",
  "disclaimer": "هذا تقرير سلوكي مساعد وليس تشخيصاً طبياً نهائياً"
}`,

    messages: [
      {
        role: "user",
        content: `Patient complaint: "${symptomText}"
Scores: ${JSON.stringify(scores.layers)}
Final Score: ${scores.finalScore}/100
Risk Level: ${scores.riskLevel}
Key biomarkers: ${JSON.stringify(biomarkers.key_findings)}

Generate the physician report.`,
      },
    ],
  });

  const raw = response.content[0].text.trim();
  return JSON.parse(raw);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function avg(arr) {
  const scaled = arr.map((v) => (v / 10) * 100);
  return scaled.reduce((a, b) => a + b, 0) / scaled.length;
}

function invert(v) {
  return 10 - v;
}

function normalize(v, min, max) {
  return ((v - min) / (max - min)) * 10;
}