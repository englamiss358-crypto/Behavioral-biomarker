# Behavioral Biomarkers Enhancement Layer (MVP)

A complete bilingual (EN/AR) preventive behavioral biomarker assessment MVP.

## What is included

- Symptom intake page: `ui/01-symptom-intake.html`
- Behavioral assessment page: `ui/02-assessment.html`
- Results dashboard page: `ui/03-result.html`
- Clinician dashboard page: `ui/04-clinician-dashboard.html`
- Backend API and static server: `backend/src/server.js`

The UI now follows a layered narrative:

- Intake captures the symptom story as a preventive signal.
- Assessment translates habits and state into behavioral inputs.
- Results explain the pattern across four biomarker layers.
- Clinician dashboard summarizes both the population signal and the individual assessment trail.

## Key features

- Automatic browser language detection (Arabic/English)
- Manual language switcher on all UI pages
- RTL/LTR layout switching based on active language
- End-to-end flow:
  - Symptoms captured on intake page as context for the behavioral pattern
  - Passed to assessment page for structured follow-up questions
  - Slider scores and symptoms passed to results page
  - Backend API computes layered scores and final preventive metrics
- Clinician monitoring dashboard:
  - Aggregated averages and risk distribution
  - Recent assessment table with symptom preview and risk labels
  - Time window filtering (24h / 7d / 30d / all)
  - Risk filtering (low / moderate / high / all)
  - Symptom keyword search filtering
  - CSV export for visible filtered records
- PDF export from results page
- Local fallback scoring on results page if API is unavailable
- Assessment session persistence (JSON file in backend)

## Metric model

- Layer 1: Behavioral Indicators
- Layer 2: Psychosomatic Biomarkers
- Layer 3: Lifestyle Biomarkers
- Layer 4: Temporal & Trigger Patterns
- Final metrics:
  - Stress Load
  - Sleep Quality
  - Mental Recovery
  - Emotional Fatigue
  - Burnout Risk
  - Pattern Confidence

## Run locally

1. Open terminal in `mvp/backend`
2. Install dependencies:
   - `npm install`
3. Start server:
   - `npm run start`
4. Open:
   - `http://localhost:8080`

## API endpoints

- `GET /api/health`
- `POST /api/auth/login`
  - Body fields: `username`, `password`
  - Returns: `token`, `expiresInMs`, `username`
- `GET /api/auth/verify`
  - Requires header: `Authorization: Bearer <token>`
- `POST /api/assess`
  - Body fields: `symptoms`, `sleep`, `stress`, `exercise`, `caffeine`, `language`
  - Returns layered metrics in addition to final scores
- `GET /api/assessments?limit=20&window=7d&risk=high`
  - `window`: `all` | `24h` | `7d` | `30d`
- `risk`: `all` | `low` | `moderate` | `high`
  - `q`: symptom keyword search text
  - Requires header: `Authorization: Bearer <token>`
- `GET /api/stats?window=7d&risk=high`
  - `window`: `all` | `24h` | `7d` | `30d`
  - `risk`: `all` | `low` | `moderate` | `high`
  - `q`: symptom keyword search text
  - Requires header: `Authorization: Bearer <token>`

## Notes

- Stored assessments are saved in `backend/data/assessments.json`
- Language preference is stored in browser `localStorage` using key `bbel-lang`
- Clinician token is stored in browser `localStorage` using key `bbel-clinician-token`
- Default clinician credentials for local MVP:
  - `username`: `clinician`
  - `password`: `clinic123`
  - Override via env vars: `CLINICIAN_USER`, `CLINICIAN_PASSWORD`, `CLINICIAN_SESSION_TTL_MS`
  - Temporary demo access can be controlled with `CLINICIAN_DEMO_MODE=true|false` (default is `true`)

## Positioning

- The system is preventive and explanatory, not diagnostic.
- Layered scores are meant to surface patterns that may need lifestyle or clinical follow-up.
- The backend is the source of truth for scoring; UI fallbacks exist only for local resilience.
- Clinician access is currently in demo mode for evaluation and can be re-locked later with one environment flag.
