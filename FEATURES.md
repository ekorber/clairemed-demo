# ClaireMed Demo — Feature Extraction

Source: clairemed.ai (homepage, How It Works, For Clinic Owners, For Clinic Administrators), fetched 2026-07-18.

## What the product is

Claire is an AI clinical partner for outpatient clinics. Before an appointment, it runs a
conversational AI intake interview with the patient, structures the answers into a clinical
history, flags red-flag symptoms, and drafts a SOAP note that the physician reviews, edits,
and signs. It is EMR-agnostic (notes are exported/copied, not written into an EMR), priced
per provider, and heavily emphasizes HIPAA/PHIPA/PIPEDA compliance.

## Core demo features (must-have)

### 1. Patient intake chat (the centerpiece)
- Tokenized, no-login patient link (simulating an SMS/email invite) opening a mobile-first chat UI.
- LLM-driven conversational interview: chief complaint, onset, severity, then **adaptive
  follow-ups based on each answer**.
- Coverage of structured domains: HPI, past medical history, medications, allergies,
  review of systems.
- Red-flag symptom detection during the interview.
- Completion state ("Thanks, your doctor will see this before your visit").

### 2. History structuring pipeline
- Convert the raw interview transcript into structured sections: Chief Complaint, HPI,
  PMH / medications, Review of Systems — preserving the patient's own words where relevant.
- Surface flagged red-flag patterns prominently.

### 3. SOAP note generation
- Generate a draft SOAP note from the structured history (site promises "under 3 minutes
  from end of intake" — async job with status tracking).
- Note format preference per provider (SOAP as default; format is configurable per the site's
  "your preferred format" claim).

### 4. Provider dashboard
- Appointment/intake list with per-patient status: invite sent → intake in progress →
  intake complete → note drafted → signed.
- Red-flag indicators visible at the list level.
- Pre-visit view: structured history + flagged findings for a given patient.

### 5. Note review, edit, sign
- Editor for the drafted note (section-level editing is enough for a demo).
- Sign/finalize action (physician retains authorship); signed notes become read-only.
- Copy/export of the note (EMR-agnostic story → clipboard / download, no EMR integration).

### 6. Patient & appointment management
- Create patients and appointments (minimal fields), generate/send the intake link.

### 7. Auth & roles
- Provider and clinic-admin logins; patients access only via intake token.
- Role-based access: providers see their own patients; admins see clinic-wide.

## Secondary features (site-supported, build if time allows)

- **Audit log** of PHI access (the site stresses "all PHI access logged and monitored") —
  a simple viewable access log makes the compliance story tangible in a demo.
- **Admin analytics**: intakes completed, notes drafted, estimated documentation time saved,
  after-hours charting reduction.
- **Provider onboarding** ("connecting takes under a minute per provider") — a short
  self-serve provider setup flow.
- **MFA** on staff accounts (site mentions least-privilege + MFA).
- Capacity/ROI calculator exists on the site but is a marketing tool — out of scope.

## Explicitly out of scope

- Marketing pages, blog, pricing/billing ($99/mo), Book Demo flow, real SMS/email delivery,
  actual EMR integration, formal HIPAA compliance program (demo only mimics the controls).

## Tech mapping (chosen stack)

- **Frontend**: TypeScript + React (Vite), responsive desktop + mobile (patient chat is
  mobile-first; dashboard is desktop-first but responsive). Tailwind recommended.
- **Backend**: Django + Django REST Framework; SSE token streaming for chat replies;
  synchronous note-generation endpoint.
- **AI**: OpenAI — `gpt-5-mini` for the adaptive interview agent, red-flag detection, and
  structured SOAP drafting; `gpt-4o-mini-transcribe` for speech input.
- **Data**: MySQL 8 on the VM.
- **Hosting**: GCP Compute Engine instance in a new `clairemed-demo` project — nginx +
  gunicorn serving Django and the built React bundle; HTTPS via managed cert or certbot
  (supports the encryption-in-transit story). Fitting, since Claire itself runs on GCP.
