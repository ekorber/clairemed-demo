# ClaireMed Demo — Design Spec

Date: 2026-07-18
Status: Approved design (pending user review of this document)

## Overview

A demo recreating the core product loop of clairemed.ai (Claire, an AI clinical partner):
a conversational AI patient-intake interview that produces a structured, physician-ready
clinical note. Public demo — no authentication. Three pages, responsive for desktop and
mobile.

**Stack:** TypeScript + React (Vite) + Tailwind CSS · Django + Django REST Framework ·
MySQL 8 · OpenAI (`gpt-5-mini` for chat/notes, `gpt-4o-mini-transcribe` for speech) ·
Docker Compose on a single GCP Compute Engine VM in a new `clairemed-demo` GCP project.

## Goals

- Credible end-to-end demo of: intake chat → structured history → draft SOAP note.
- Clinically sensible interview content (standard history-taking domains, red-flag screening).
- Highly readable note layout.
- Streaming chat (SSE-style token streaming) and speech input for accessibility.

## Non-goals

- Marketing pages, auth/roles, billing, EMR integration, real SMS/email delivery,
  actual HIPAA compliance (the demo mimics the product, not the compliance program).

## Pages

### 1. Home (`/`)
- Project overview: what Claire does, the three-stage workflow (Intake → History Capture →
  Note Drafting), feature list, tech stack, and architecture summary.
- Link to the GitHub repo (`github.com/ekorber/clairemed-demo`).
- CTAs: "Start a patient intake" → Chat, "View notes" → Notes.

### 2. Chat (`/chat`)
- Mobile-first patient intake chat.
- Start form: first name, age, sex (used to personalize the interview and label the note).
- Conversational interview, one question at a time; Claire's replies stream token-by-token.
- **Speech input:** tap-to-talk mic button using the MediaRecorder API (webm/opus).
  Audio is uploaded to the backend, transcribed via OpenAI, and the transcript fills the
  text input for the patient to review/edit before sending (important for medical accuracy).
  If mic permission is denied or unsupported, the button hides — typing always works.
- Subtle progress indicator showing interview stage (complaint → history → lifestyle → wrap-up).
- On completion: "generating your summary" state, then a link to the finished note.

### 3. Notes (`/notes`, `/notes/:conversationId`)
- Left sidebar: all conversations — patient name, chief-complaint one-liner, date,
  red-flag badge. On mobile, the sidebar becomes a full-screen list; selecting an item
  navigates to the note view with a back control.
- Main pane: the structured note (layout below).

## Clinical interview content

The interviewer agent follows standard clinical history-taking, adaptively (skips
irrelevant domains, digs into concerning answers), targeting ~10–15 exchanges with a hard
cap of 25 (then it wraps up with whatever it has):

1. **Chief complaint** — in the patient's own words.
2. **HPI via OLDCARTS** — Onset, Location, Duration, Character, Aggravating/alleviating
   factors, Radiation/related symptoms, Timing, Severity (1–10).
3. **Red-flag screening** keyed to the complaint (e.g., chest pain → shortness of breath,
   sweating, arm/jaw pain; headache → thunderclap onset, vision changes, neck stiffness).
   On a hit: flag it for the note and gently advise urgent care if severe. The agent never
   diagnoses and says so if asked.
4. **Past medical history** — chronic conditions, surgeries, hospitalizations.
5. **Medications** — prescription, OTC, supplements; dose and adherence.
6. **Allergies** — drug/food/environmental, with the reaction type.
7. **Family history** — first-degree relatives: heart disease, diabetes, cancer, stroke,
   mental health, hereditary conditions.
8. **Social history** — smoking/vaping, alcohol, recreational drugs, occupation, exercise,
   sleep, stress.
9. **Focused review of systems** — brief symptom sweep relevant to the complaint
   (fever, weight change, fatigue, etc.).

## Note structure

Scannable, card-based layout:

- **Header:** patient name, age/sex, date, chief-complaint one-liner.
- **Red-flag alert banner** at the very top when any urgent finding was flagged.
- **At-a-glance card grid:** Allergies (with reaction chips), Current Medications
  (name/dose/frequency), Medical History, Family History, Social History.
- **History of Present Illness:** short narrative paragraph; key patient quotes in italics.
- **Review of Systems:** pertinent positives and negatives as compact lists.
- **Draft SOAP note:**
  - *Subjective* — filled from intake.
  - *Objective* — placeholder "to be completed at visit" (no exam pre-visit; faithful to
    the real product).
  - *Assessment* — themes/considerations to explore, explicitly not a diagnosis.
  - *Plan* — suggested follow-up questions and checks for the visit.
- **Copy note** button (clipboard) — the "EMR-agnostic" export story.

## Architecture

### Data model (Django ORM on MySQL 8)

- `Conversation` — id (uuid), patient_first_name, patient_age, patient_sex, status
  (`active` | `generating` | `complete` | `abandoned`), chief_complaint_summary,
  has_red_flags, created_at, updated_at.
- `Message` — conversation FK, role (`assistant` | `patient`), content, created_at.
- `Note` — conversation OneToOne, structured JSON (schema below), red_flags list,
  created_at.

MySQL runs locally on the VM (`mysqlclient` driver). Django settings read DB and OpenAI
credentials from environment variables (`.env`, not committed).

### API (DRF)

- `POST /api/conversations/` — start conversation (patient info) → returns id + Claire's
  streamed opening message.
- `POST /api/conversations/:id/messages/` — patient message → response is a streamed
  `text/event-stream` of Claire's reply tokens (Django `StreamingHttpResponse` wrapping the
  OpenAI streaming API). The stream's final event carries metadata: interview stage, and
  `interview_complete: true` when the agent decides it's done.
- `POST /api/conversations/:id/generate-note/` — triggered by the frontend on completion;
  synchronous call that runs the note-generation prompt and stores the Note.
- `GET /api/conversations/` — sidebar list (name, summary, date, red-flag badge, status).
- `GET /api/conversations/:id/` — messages + note for the note page.
- `POST /api/transcribe/` — multipart audio upload → OpenAI transcription → `{ text }`.

Frontend consumes the streams with `fetch` + `ReadableStream` (EventSource is GET-only).
Gunicorn runs with `gthread` workers so streaming responses don't starve the worker pool.

### LLM usage (OpenAI)

- **Interviewer** — `gpt-5-mini`, minimal reasoning effort for latency, streaming on.
  System prompt encodes the interview domains, adaptive-follow-up behavior, red-flag
  screening, tone (warm, plain language, one question at a time), the never-diagnose rule,
  and the exchange cap. Full message history is resent each turn (short conversations —
  fine).
- **Note generator** — `gpt-5-mini` with Structured Outputs against a JSON schema:
  `{ chief_complaint, hpi_narrative, red_flags[], allergies[], medications[],
  medical_history[], family_history[], social_history{}, review_of_systems{positives[],
  negatives[]}, soap{subjective, assessment[], plan[]}, patient_quotes[] }`.
  One call at interview completion; also produces the sidebar one-liner summary.
- **Transcription** — `gpt-4o-mini-transcribe` (config-swappable to `whisper-1`).
- Model names and API key live in settings/env, never hardcoded in call sites.

### Error handling

- OpenAI call fails mid-chat: stream emits an error event; UI shows a retry affordance for
  the last patient message (message not lost — it's in the input history).
- Note generation fails: conversation stays `generating`-recoverable; note page shows a
  "retry generation" button hitting the same endpoint (idempotent — regenerates and
  overwrites).
- Transcription fails: toast + patient types instead; chat is never blocked on audio.
- Guardrails: max patient message length (~2,000 chars), max 25 exchanges, audio uploads
  capped (~2 MB / ~60 s).

### Deployment (GCP, Docker Compose)

- New GCP project `clairemed-demo`, one Compute Engine VM (`e2-small`, Debian) with only
  Docker installed on the host.
- The stack is a committed `docker-compose.yml` with three services:
  - `web` — Django + gunicorn (`gthread` workers), built from the repo's Dockerfile.
  - `db` — MySQL 8 with a named volume for data persistence.
  - `nginx` — serves the built SPA (baked into the image or a mounted volume from a
    multi-stage Vite build) and proxies `/api/` to `web`, with proxy buffering disabled
    for the SSE endpoints.
- Secrets (OpenAI key, DB credentials, Django secret) live in an uncommitted `.env` read
  by compose; model names are env-configurable too.
- Deploying is `git pull && docker compose up -d --build`. HTTPS via certbot (host certbot
  with certs mounted into the nginx container, or a certbot sidecar).

### Local development

- Native, not containerized, for fast iteration: Vite dev server (proxying `/api`) +
  `manage.py runserver`, both pointed at the **same MySQL container** started from the
  compose file (`docker compose up db`). This keeps dev/prod MySQL identical (version,
  auth plugin, charset) while preserving hot reload.

## Testing

- Backend: pytest — endpoint tests with the OpenAI client mocked; note-JSON schema
  validation; conversation state transitions; transcribe endpoint with a fixture file.
- Frontend: vitest smoke tests for the chat reducer/stream parser and note rendering from
  fixture JSON.
- Manual end-to-end pass (real OpenAI key) on desktop + mobile viewport before calling it
  done, including one conversation that trips a red flag.
