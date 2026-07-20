# Alice: implemented features

What this demo actually does, as built. Alice is a recreation of a slice of
[Claire](https://clairemed.ai), an AI clinical intake assistant for outpatient clinics.

The original scoping notes for this project were extracted from clairemed.ai on 2026-07-18 and
covered the full product. Only part of that was built. This file now describes what exists;
see [Not implemented](#not-implemented) for the rest.

## Patient intake chat

Route: `/chat`

- Start form collecting first name, age, and sex. Age is validated server side to 1 to 129.
- LLM-driven adaptive interview using `gpt-5-mini`, streamed token by token over SSE.
- Interview follows OLDCARTS for the presenting complaint, then works through past medical
  history, medications, allergies, family history, social history, and a brief review of
  systems before wrapping up.
- Stage indicator above the chat (Your concern, History, Lifestyle, Wrap-up), driven by
  invisible `<<STAGE:>>` markers the model emits and the server strips.
- Patient messages are capped at 2000 characters.
- Completion state with a link through to the generated note.
- Failed sends and failed note generation can be retried without losing the conversation.

### Voice input

- Tap Speak to record, with a live bar showing a pulsing indicator, an input level meter, and
  elapsed time against a 60 second cap.
- Cancel discards the recording; Done transcribes it into the text box for review before sending.
- Transcription uses `gpt-4o-mini-transcribe`, with a spinner while it runs.
- Feature detected: browsers without `MediaRecorder` or microphone access fall back to typing,
  and a denied permission surfaces a message rather than failing silently.

## Safety behaviour

Implemented in the interviewer system prompt, with the parts that must not fail enforced in code.

- **Emergency escalation.** Possible emergency signs stop the interview. Alice tells the patient
  to call their local emergency number or go to an emergency department in her very next message,
  before asking anything else, and does not resume routine history taking.
- **Self-harm.** Suicidal ideation or self-harm surfaces crisis resources (988 in the US, local
  crisis lines elsewhere), asks directly about immediate safety, plan, and means, and never
  agrees to keep it secret.
- **No false escalation.** Alice cannot alert anyone and is explicitly barred from implying that
  she has. Nothing recorded reaches a human in real time; it goes into a note read before the
  appointment.
- **Scope limits.** No diagnosing, no interpreting findings, no treatment advice, and no
  prescribing, refilling, or arranging medication. Requests are declined once and recorded for
  the clinician.
- **Harm from others.** Disclosures of being hurt or threatened are acknowledged and recorded
  without interrogation.
- **Prompt injection.** Patient messages are treated as health information, never as
  instructions. Attempts to change role, extract the system prompt, or forge protocol markers
  are declined and the interview continues.
- **Difficult conversations.** Explicit handling for off-topic, evasive, refusing, rambling,
  and unintelligible replies, for someone answering on behalf of another person, and for
  patients writing in a language other than English (Alice replies in their language).
- **Live emergency flag.** When Alice escalates she emits an `<<URGENT>>` marker, which latches
  `emergency_flagged` on the conversation as the reply is saved. This is deliberately separate
  from the note's red flags: an emergency interview is often abandoned because the patient left
  to get help, so it never reaches note generation and would otherwise appear in the list as an
  ordinary unfinished intake.
- **Dash stripping.** Em and en dashes are replaced in the streaming filter rather than left to
  the prompt, which regressed twice as the prompt grew.

Detection is self-reported by the interviewing model. The marker is the seam where an
independent classifier would slot in.

## Note generation

- Synchronous `POST /api/conversations/<id>/generate-note/`, triggered automatically when the
  interview completes.
- Strict JSON schema output covering chief complaint, a sidebar one-liner, HPI narrative, red
  flags, allergies, medications, medical history, family history, social history, review of
  systems (positives and negatives), a draft SOAP note, and verbatim patient quotes.
- `soap.objective` is overwritten server side with a fixed placeholder, so the model cannot
  invent examination findings even if it tries.
- `soap.assessment` is phrased as areas for the physician to explore, never as diagnoses.

## Note review

Routes: `/notes`, `/notes/:id`

- Sidebar list of conversations showing patient name, red flag badge, emergency badge, the
  summary one-liner, and timestamp.
- Detail view with a red flag banner, HPI with the patient's own quotes, allergies, medications,
  medical history, family history, social history, review of systems, and the draft SOAP note.
- Copy note copies a plain text version for pasting into an EMR. The raw transcript is
  deliberately excluded.
- Full conversation transcript below the note, collapsed by default, available even when no note
  was generated.
- Delete a conversation with an inline confirmation. Messages and the note cascade with it.

## Home page

Route: `/`. Overview of the demo, how to get started, feature summary, architecture notes, and
an explicit list of what a production version would need next.

## Stack and infrastructure

- **Frontend:** TypeScript, React 19, Vite, Tailwind CSS v4, React Router.
- **Backend:** Django with Django REST Framework, SSE streaming for chat replies.
- **AI:** OpenAI `gpt-5-mini` for the interview and note drafting, `gpt-4o-mini-transcribe` for
  speech.
- **Data:** MySQL 8 in the Docker stack. Local development falls back to SQLite when
  `MYSQL_HOST` is unset.
- **Serving:** Docker Compose with three services, MySQL, Django under gunicorn, and nginx
  serving the built SPA and proxying `/api/` with buffering disabled so SSE streams incrementally.
- **Health check:** `GET /api/health/`.
- **Tests:** 49 backend (pytest), 40 frontend (vitest and Testing Library).

## Not implemented

Present in the original scope or in the source product, deliberately absent here.

- **Authentication and roles.** The API is unauthenticated and `GET /api/conversations/`
  returns every conversation to any caller. This is the largest gap between demo and product,
  given the data involved.
- **Tokenized invite links.** There is no token or no-login patient link. Anyone opens `/chat`
  and types a name. No SMS or email delivery.
- **Patients and appointments.** No patient or appointment records exist. A conversation carries
  a first name, age, and sex and nothing else.
- **Note editing and signing.** Notes cannot be edited, signed, or finalised, and there is no
  read-only signed state or authorship trail. Copy to clipboard is the only export.
- **Intake lifecycle statuses.** Only `active`, `generating`, and `complete` are used.
  `abandoned` exists in the model but is never assigned.
- **Asynchronous note jobs.** Generation is synchronous, with no queue or status tracking.
- **Configurable note formats.** SOAP only, with a fixed schema.
- **EMR integration.** None, by design.
- **Audit log, admin analytics, provider onboarding, MFA.** None.
- **Rate limiting and conversation length caps.** The pacing guidance lives in the prompt only;
  nothing in code limits how many messages a conversation can accumulate.
- **Deployment.** Runs locally and under Docker Compose. It is not deployed to GCP or any other
  host, and there is no HTTPS or managed certificate setup.
