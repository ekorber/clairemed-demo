import { Link } from "react-router-dom";

const features = [
  {
    title: "Conversational AI Intake",
    body: "Claire interviews the patient before the visit — one question at a time, streamed token-by-token, adapting every follow-up to the previous answer. The interview follows the structure clinicians actually use (OLDCARTS for the presenting complaint), and patients can speak instead of type: tap the mic, review the transcript, then send.",
  },
  {
    title: "Red-Flag Screening",
    body: "Claire screens for danger signs specific to the complaint — chest pain prompts questions about breathlessness and radiating pain, headaches about sudden onset and vision changes. Anything concerning is surfaced at the top of the note and badged in the sidebar. Claire gathers information only; she never diagnoses, and says so if asked.",
  },
  {
    title: "Structured History Capture",
    body: "Answers are organized into chief complaint, history of present illness, medications with doses, allergies with reactions, family and social history, and a review of systems — with the patient's own words preserved as quotes so the physician hears the story, not a paraphrase.",
  },
  {
    title: "Draft SOAP Notes",
    body: "Moments after the interview ends, a decision-ready SOAP note is drafted: subjective filled in from intake, objective left for the visit, assessment framed strictly as areas to explore, and a plan of suggested follow-up questions. One click copies the full note as clean plain text — EMR-agnostic by design.",
  },
];

const architecture = [
  {
    title: "Frontend",
    body: "React + TypeScript SPA built with Vite and styled with Tailwind CSS. The patient chat is mobile-first; the notes browser adapts from a two-pane desktop layout to a drill-in list on phones.",
  },
  {
    title: "Backend",
    body: "Django with DRF and streaming SSE endpoints for real-time chat, backed by MySQL 8. Guardrails throughout: message and audio size caps, interview length limits, and clean error recovery on every LLM path.",
  },
  {
    title: "AI Layer",
    body: "OpenAI gpt-5-mini powers the interviewer — a clinical system prompt with a hidden stage-marker protocol that tracks interview progress — and drafts the note via Structured Outputs against a strict JSON schema. gpt-4o-mini-transcribe handles speech input.",
  },
  {
    title: "Infra",
    body: "Docker Compose runs the whole stack — nginx serving the built SPA and proxying the API (buffering off, so streams actually stream), gunicorn, and MySQL — on a single GCP Compute Engine VM behind HTTPS.",
  },
];

const nextSteps = [
  { title: "EMR Integration", body: "Push signed notes into EMRs directly (e.g. via FHIR) instead of copy-paste export." },
  { title: "Physician Sign-Off Workflow", body: "Section-level editing, sign-to-finalize with an audit trail, and read-only signed notes." },
  { title: "Scheduling & SMS Invites", body: "Real appointments with tokenized intake links texted to patients before their visit." },
  { title: "Provider Accounts & Roles", body: "Clinic admin and provider logins, per-provider patient lists, and note format preferences." },
  { title: "Analytics Dashboard", body: "Intakes completed, documentation time saved, red-flag rates, and after-hours charting reduction." },
  { title: "Voice-First Mode", body: "A fully spoken interview with text-to-speech replies for patients who prefer talking to typing." },
  { title: "Multi-Language Intake", body: "Interview patients in their own language and deliver the note in the clinic's." },
  { title: "Specialty Templates", body: "Tailored question flows and note formats per specialty — pediatrics, cardiology, mental health." },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">An AI clinical partner, <span className="text-teal-600">demoed end-to-end</span></h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          A working recreation of clairemed.ai's core loop: Claire interviews the patient before the
          visit, captures a structured medical history, flags what's urgent, and drafts the clinical
          note — so the physician walks in prepared and walks out with documentation nearly done.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          A demo by Eric Korber ·{" "}
          <a href="https://github.com/ekorber/clairemed-demo" target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 underline hover:text-teal-800">GitHub ↗</a>
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-bold">Get started</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <Link to="/chat" className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-teal-400 hover:shadow-sm">
            <h3 className="font-semibold text-teal-700">Chat with Claire →</h3>
            <p className="mt-2 text-sm text-slate-600">
              Take the patient's seat: start a pre-visit interview and answer by typing or speaking.
              Claire adapts her questions to what you tell her, then drafts your note.
            </p>
          </Link>
          <Link to="/notes" className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-teal-400 hover:shadow-sm">
            <h3 className="font-semibold text-teal-700">View notes →</h3>
            <p className="mt-2 text-sm text-slate-600">
              See the physician's side: every conversation with its structured history, red-flag
              alerts, draft SOAP note, and one-click export.
            </p>
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-bold">Features</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold text-teal-700">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-bold">Architecture</h2>
        <div className="mt-4 space-y-4">
          {architecture.map((a) => (
            <div key={a.title} className="rounded-xl border border-slate-200 bg-white p-5 sm:flex sm:gap-6">
              <h3 className="w-28 shrink-0 font-semibold text-slate-900">{a.title}</h3>
              <p className="mt-1 text-sm text-slate-600 sm:mt-0">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-xl font-bold">Sensible next steps</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {nextSteps.map((s) => (
            <div key={s.title} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-16 text-center text-sm text-slate-500">
        Demo only — not a medical device. Claire gathers information and never diagnoses.
      </p>
    </div>
  );
}
