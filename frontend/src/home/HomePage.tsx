import { Link } from "react-router-dom";

const stages = [
  { title: "1 · Intake", body: "Claire interviews the patient before the visit — one question at a time, adapting follow-ups to each answer, with speech or text input." },
  { title: "2 · History capture", body: "Answers are structured into chief complaint, HPI (OLDCARTS), medications, allergies, family and social history — red flags surfaced early." },
  { title: "3 · Note drafting", body: "A draft SOAP note is generated for the physician to review — subjective filled in, assessment framed as areas to explore, never a diagnosis." },
];

const tech = [
  "React + TypeScript + Tailwind (Vite)", "Django + DRF, SSE token streaming",
  "MySQL 8", "OpenAI gpt-5-mini (interview + structured note)",
  "OpenAI gpt-4o-mini-transcribe (speech input)", "Docker Compose on a GCP Compute Engine VM",
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">An AI clinical partner, <span className="text-teal-600">demoed end-to-end</span></h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          A working recreation of clairemed.ai's core loop: a pre-visit AI intake interview that
          becomes a structured, physician-ready clinical note.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/chat" className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700">Start a patient intake</Link>
          <Link to="/notes" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold hover:bg-slate-100">View notes</Link>
          <a href="https://github.com/ekorber/clairemed-demo" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold hover:bg-slate-100">GitHub ↗</a>
        </div>
      </section>
      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {stages.map((s) => (
          <div key={s.title} className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-teal-700">{s.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{s.body}</p>
          </div>
        ))}
      </section>
      <section className="mt-16">
        <h2 className="text-xl font-bold">Under the hood</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {tech.map((t) => (
            <li key={t} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">{t}</li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-slate-500">
          Demo only — not a medical device. Claire gathers information and never diagnoses.
        </p>
      </section>
    </div>
  );
}
