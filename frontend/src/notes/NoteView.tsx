import { useState } from "react";
import type { ConversationDetail } from "../api/types";
import { noteToText } from "./noteText";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2 text-sm text-slate-800">{children}</div>
    </div>
  );
}

const List = ({ items, empty = "None reported" }: { items: string[]; empty?: string }) =>
  items.length
    ? <ul className="list-disc space-y-1 pl-4">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    : <p className="text-slate-400">{empty}</p>;

export default function NoteView({ detail }: { detail: ConversationDetail }) {
  const [copied, setCopied] = useState(false);
  const note = detail.note?.data;
  const patientLine = `${detail.patient_first_name}, ${detail.patient_age}, ${detail.patient_sex}`;

  if (!note)
    return <p className="p-8 text-slate-500">This note isn't ready yet. The interview may still be in progress.</p>;

  const copy = async () => {
    await navigator.clipboard.writeText(noteToText(note, patientLine));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      {note.red_flags.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <h2 className="font-bold text-red-700">⚠ Red flags</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
            {note.red_flags.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{note.chief_complaint}</h1>
          <p className="text-sm text-slate-500">{patientLine} · {new Date(detail.created_at).toLocaleDateString()}</p>
        </div>
        <button onClick={() => void copy()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
          {copied ? "Copied ✓" : "Copy note"}
        </button>
      </div>
      <Card title="History of present illness">
        <p>{note.hpi_narrative}</p>
        {note.patient_quotes.length > 0 && (
          <p className="mt-2 italic text-slate-500">{note.patient_quotes.map((q) => `“${q}”`).join(" · ")}</p>
        )}
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Allergies">
          <List items={note.allergies.map((a) => `${a.substance} - ${a.reaction} (${a.severity})`)} />
        </Card>
        <Card title="Current medications">
          <List items={note.medications.map((m) => `${m.name} ${m.dose}, ${m.frequency}`)} />
        </Card>
        <Card title="Medical history"><List items={note.medical_history} /></Card>
        <Card title="Family history"><List items={note.family_history} /></Card>
      </div>
      <Card title="Social history">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Object.entries(note.social_history).map(([k, v]) => (
            <div key={k}><dt className="text-xs capitalize text-slate-400">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Card>
      <Card title="Review of systems">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs font-semibold text-slate-400">Positives</p><List items={note.review_of_systems.positives} empty="None" /></div>
          <div><p className="text-xs font-semibold text-slate-400">Negatives</p><List items={note.review_of_systems.negatives} empty="None" /></div>
        </div>
      </Card>
      <Card title="Draft SOAP note">
        <div className="space-y-3">
          <div><p className="font-semibold">Subjective</p><p>{note.soap.subjective}</p></div>
          <div><p className="font-semibold">Objective</p><p className="text-slate-500">{note.soap.objective}</p></div>
          <div><p className="font-semibold">Assessment <span className="font-normal text-slate-400">(areas to explore, not diagnoses)</span></p><List items={note.soap.assessment} /></div>
          <div><p className="font-semibold">Plan</p><List items={note.soap.plan} /></div>
        </div>
      </Card>
    </div>
  );
}
