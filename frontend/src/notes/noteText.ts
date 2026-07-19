import type { NoteData } from "../api/types";

const section = (title: string, body: string) => (body.trim() ? `${title}\n${body.trim()}\n` : "");
const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

export function noteToText(note: NoteData, patientLine: string): string {
  const social = Object.entries(note.social_history).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  return [
    `PRE-VISIT NOTE - ${patientLine}`,
    `Chief complaint: ${note.chief_complaint}\n`,
    section("RED FLAGS", bullets(note.red_flags) || "- None reported"),
    section("HISTORY OF PRESENT ILLNESS", note.hpi_narrative),
    section("PATIENT QUOTES", bullets(note.patient_quotes.map((q) => `"${q}"`))),
    section("ALLERGIES", bullets(note.allergies.map((a) => `${a.substance} - ${a.reaction} (${a.severity})`)) || "- None reported"),
    section("MEDICATIONS", bullets(note.medications.map((m) => `${m.name} ${m.dose}, ${m.frequency}`)) || "- None reported"),
    section("MEDICAL HISTORY", bullets(note.medical_history) || "- None reported"),
    section("FAMILY HISTORY", bullets(note.family_history) || "- None reported"),
    section("SOCIAL HISTORY", social),
    section("REVIEW OF SYSTEMS", `Positives:\n${bullets(note.review_of_systems.positives) || "- none"}\nNegatives:\n${bullets(note.review_of_systems.negatives) || "- none"}`),
    section("SUBJECTIVE", note.soap.subjective),
    section("OBJECTIVE", note.soap.objective),
    section("ASSESSMENT", bullets(note.soap.assessment)),
    section("PLAN", bullets(note.soap.plan)),
  ].join("\n");
}
