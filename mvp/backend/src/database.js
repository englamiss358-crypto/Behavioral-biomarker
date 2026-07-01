import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "../data/biomarkers.db"));

// ─── Initialize Tables ────────────────────────────────────────────────────────
export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      symptom_text TEXT NOT NULL,
      biomarkers TEXT,
      scores TEXT,
      report TEXT,
      payment_token TEXT,
      is_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log("✅ Database ready");
}

// ─── Create Assessment ────────────────────────────────────────────────────────
export function createAssessment(id, symptomText) {
  const stmt = db.prepare(`
    INSERT INTO assessments (id, symptom_text) VALUES (?, ?)
  `);
  stmt.run(id, symptomText);
  return id;
}

// ─── Save Results ─────────────────────────────────────────────────────────────
export function saveResults(id, biomarkers, scores, report) {
  const stmt = db.prepare(`
    UPDATE assessments 
    SET biomarkers = ?, scores = ?, report = ?, status = 'complete'
    WHERE id = ?
  `);
  stmt.run(
    JSON.stringify(biomarkers),
    JSON.stringify(scores),
    JSON.stringify(report),
    id
  );
}

// ─── Get Assessment ───────────────────────────────────────────────────────────
export function getAssessment(id) {
  const stmt = db.prepare(`SELECT * FROM assessments WHERE id = ?`);
  const row = stmt.get(id);
  if (!row) return null;
  return {
    ...row,
    biomarkers: row.biomarkers ? JSON.parse(row.biomarkers) : null,
    scores: row.scores ? JSON.parse(row.scores) : null,
    report: row.report ? JSON.parse(row.report) : null,
  };
}

// ─── Mark as Paid ─────────────────────────────────────────────────────────────
export function markPaid(id, token) {
  const stmt = db.prepare(`
    UPDATE assessments SET is_paid = 1, payment_token = ? WHERE id = ?
  `);
  stmt.run(token, id);
}

// ─── Get All (for clinician dashboard) ───────────────────────────────────────
export function getAllAssessments() {
  const stmt = db.prepare(`
    SELECT id, symptom_text, scores, status, is_paid, created_at 
    FROM assessments 
    ORDER BY created_at DESC
  `);
  return stmt.all().map((row) => ({
    ...row,
    scores: row.scores ? JSON.parse(row.scores) : null,
  }));
}

export default db;