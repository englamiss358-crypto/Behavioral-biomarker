const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const UI_DIR = path.join(ROOT_DIR, "ui");
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "assessments.json");
const CLINICIAN_USER = String(process.env.CLINICIAN_USER || "clinician");
const CLINICIAN_PASSWORD = String(process.env.CLINICIAN_PASSWORD || "clinic123");
const CLINICIAN_DEMO_MODE = String(process.env.CLINICIAN_DEMO_MODE || "true").toLowerCase() !== "false";
const SESSION_TTL_MS = Math.max(Number(process.env.CLINICIAN_SESSION_TTL_MS) || 12 * 60 * 60 * 1000, 60 * 1000);
const sessions = new Map();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseScore(value, fallback) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return clamp(parsed, 0, 10);
}

function signalFromSymptoms(text) {
  const lengthScore = clamp(Math.round(String(text || "").length / 20), 0, 10);
  return lengthScore;
}

function buildMetrics({ symptoms, sleep, stress, exercise, caffeine }) {
  const symptomSignal = signalFromSymptoms(symptoms);
  const behavioralIndicators = Math.round(((stress * 0.55) + ((10 - sleep) * 0.3) + ((10 - exercise) * 0.15)) * 10);
  const psychosomaticBiomarkers = Math.round(((stress * 0.5) + (caffeine * 0.2) + ((10 - sleep) * 0.2) + (exercise * 0.1)) * 10);
  const lifestyleBiomarkers = Math.round((((10 - exercise) * 0.35) + ((10 - caffeine) * 0.25) + ((10 - sleep) * 0.2) + (stress * 0.2)) * 10);
  const temporalTriggerPatterns = Math.round(((stress * 0.42) + ((10 - sleep) * 0.25) + (caffeine * 0.18) + (symptomSignal * 0.15)) * 10);
  const stressLoad = Math.round((stress * 0.55 + caffeine * 0.2 + (10 - sleep) * 0.15 + (10 - exercise) * 0.1) * 10);
  const sleepQuality = Math.round((sleep * 0.72 + (10 - caffeine) * 0.14 + (10 - stress) * 0.14) * 10);
  const mentalRecovery = Math.round((sleep * 0.36 + exercise * 0.34 + (10 - stress) * 0.18 + (10 - caffeine) * 0.12) * 10);
  const emotionalFatigue = Math.round(((stress * 0.45) + ((10 - sleep) * 0.25) + ((10 - exercise) * 0.15) + (caffeine * 0.15)) * 10);
  const patternConfidence = clamp(Math.round((behavioralIndicators + psychosomaticBiomarkers + lifestyleBiomarkers + temporalTriggerPatterns) / 4), 0, 100);
  const burnoutRisk = Math.round((stress * 0.5 + caffeine * 0.2 + (10 - sleep) * 0.2 + (10 - exercise) * 0.1) * 10);

  let burnoutLevel = "low";
  if (burnoutRisk >= 70) {
    burnoutLevel = "high";
  } else if (burnoutRisk >= 40) {
    burnoutLevel = "moderate";
  }

  return {
    behavioralIndicators,
    psychosomaticBiomarkers,
    lifestyleBiomarkers,
    temporalTriggerPatterns,
    stressLoad,
    sleepQuality,
    mentalRecovery,
    emotionalFatigue,
    patternConfidence,
    burnoutRisk,
    burnoutLevel
  };
}

function sanitizeSymptoms(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf8");
  }
}

async function readAssessments() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAssessments(items) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), "utf8");
}

function normalizeRequest(payload) {
  return {
    symptoms: sanitizeSymptoms(payload.symptoms),
    sleep: parseScore(payload.sleep, 6),
    stress: parseScore(payload.stress, 7),
    exercise: parseScore(payload.exercise, 4),
    caffeine: parseScore(payload.caffeine, 5),
    language: String(payload.language || "en").toLowerCase().startsWith("ar") ? "ar" : "en"
  };
}

function parseWindowDays(value) {
  const raw = String(value || "all").toLowerCase();
  if (raw === "24h") {
    return 1;
  }
  if (raw === "7d") {
    return 7;
  }
  if (raw === "30d") {
    return 30;
  }
  return null;
}

function filterByWindow(items, windowValue) {
  const days = parseWindowDays(windowValue);
  if (!days) {
    return items;
  }

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const timeMs = new Date(item.timestamp).getTime();
    return Number.isFinite(timeMs) && timeMs >= cutoffMs;
  });
}

function parseRiskLevel(value) {
  const raw = String(value || "all").toLowerCase();
  if (raw === "low" || raw === "moderate" || raw === "high") {
    return raw;
  }
  return null;
}

function filterByRisk(items, riskValue) {
  const risk = parseRiskLevel(riskValue);
  if (!risk) {
    return items;
  }

  return items.filter((item) => String(item?.metrics?.burnoutLevel || "").toLowerCase() === risk);
}

function filterBySymptomsQuery(items, queryValue) {
  const query = String(queryValue || "")
    .trim()
    .toLowerCase();

  if (!query) {
    return items;
  }

  return items.filter((item) => {
    const symptoms = String(item?.input?.symptoms || "").toLowerCase();
    return symptoms.includes(query);
  });
}

function createSession(username) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function getSession(token) {
  const existing = sessions.get(token);
  if (!existing) {
    return null;
  }

  if (existing.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return existing;
}

function authMiddleware(req, res, next) {
  if (CLINICIAN_DEMO_MODE) {
    req.clinician = { username: "demo" };
    next();
    return;
  }

  req.clinician = { username: "public" };
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "behavioral-biomarkers-mvp" });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (username !== CLINICIAN_USER || password !== CLINICIAN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = createSession(username);
  res.json({ token, expiresInMs: SESSION_TTL_MS, username });
});

app.get("/api/auth/verify", authMiddleware, (req, res) => {
  res.json({ ok: true, username: req.clinician.username });
});

app.post("/api/assess", async (req, res) => {
  try {
    const normalized = normalizeRequest(req.body || {});
    const metrics = buildMetrics(normalized);

    const response = {
      timestamp: new Date().toISOString(),
      input: normalized,
      metrics
    };

    const all = await readAssessments();
    all.unshift(response);
    await writeAssessments(all.slice(0, 500));

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "Failed to compute assessment." });
  }
});

app.get("/api/assessments", authMiddleware, async (req, res) => {
  try {
    const limit = clamp(Number(req.query.limit) || 20, 1, 200);
    const all = await readAssessments();
    const filtered = filterBySymptomsQuery(
      filterByRisk(filterByWindow(all, req.query.window), req.query.risk),
      req.query.q
    );
    res.json({ total: filtered.length, items: filtered.slice(0, limit) });
  } catch {
    res.status(500).json({ error: "Failed to read assessments." });
  }
});

app.get("/api/stats", authMiddleware, async (req, res) => {
  try {
    const all = filterBySymptomsQuery(
      filterByRisk(filterByWindow(await readAssessments(), req.query.window), req.query.risk),
      req.query.q
    );

    if (all.length === 0) {
      res.json({
        total: 0,
        averageBehavioralIndicators: 0,
        averagePsychosomaticBiomarkers: 0,
        averageLifestyleBiomarkers: 0,
        averageTemporalTriggerPatterns: 0,
        averageStressLoad: 0,
        averageSleepQuality: 0,
        averageMentalRecovery: 0,
        averageEmotionalFatigue: 0,
        averagePatternConfidence: 0,
        averageBurnoutRisk: 0,
        riskBuckets: {
          low: 0,
          moderate: 0,
          high: 0
        }
      });
      return;
    }

    const sums = all.reduce(
      (acc, item) => {
        const metrics = item.metrics || {};
        const level = String(metrics.burnoutLevel || "").toLowerCase();

        acc.behavioral += Number(metrics.behavioralIndicators) || 0;
        acc.psychosomatic += Number(metrics.psychosomaticBiomarkers) || 0;
        acc.lifestyle += Number(metrics.lifestyleBiomarkers) || 0;
        acc.temporal += Number(metrics.temporalTriggerPatterns) || 0;
        acc.stress += Number(metrics.stressLoad) || 0;
        acc.sleep += Number(metrics.sleepQuality) || 0;
        acc.recovery += Number(metrics.mentalRecovery) || 0;
        acc.fatigue += Number(metrics.emotionalFatigue) || 0;
        acc.confidence += Number(metrics.patternConfidence) || 0;
        acc.burnout += Number(metrics.burnoutRisk) || 0;

        if (level === "high") {
          acc.risk.high += 1;
        } else if (level === "moderate") {
          acc.risk.moderate += 1;
        } else {
          acc.risk.low += 1;
        }

        return acc;
      },
      {
        behavioral: 0,
        psychosomatic: 0,
        lifestyle: 0,
        temporal: 0,
        stress: 0,
        sleep: 0,
        recovery: 0,
        fatigue: 0,
        confidence: 0,
        burnout: 0,
        risk: {
          low: 0,
          moderate: 0,
          high: 0
        }
      }
    );

    const count = all.length;
    res.json({
      total: count,
      averageBehavioralIndicators: Math.round(sums.behavioral / count),
      averagePsychosomaticBiomarkers: Math.round(sums.psychosomatic / count),
      averageLifestyleBiomarkers: Math.round(sums.lifestyle / count),
      averageTemporalTriggerPatterns: Math.round(sums.temporal / count),
      averageStressLoad: Math.round(sums.stress / count),
      averageSleepQuality: Math.round(sums.sleep / count),
      averageMentalRecovery: Math.round(sums.recovery / count),
      averageEmotionalFatigue: Math.round(sums.fatigue / count),
      averagePatternConfidence: Math.round(sums.confidence / count),
      averageBurnoutRisk: Math.round(sums.burnout / count),
      riskBuckets: sums.risk
    });
  } catch {
    res.status(500).json({ error: "Failed to compute stats." });
  }
});

app.use(express.static(UI_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(UI_DIR, "01-symptom-intake.html"));
});

app.listen(PORT, () => {
  console.log(`Behavioral Biomarkers MVP server listening on http://localhost:${PORT}`);
});
