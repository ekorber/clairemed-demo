import type { ConversationDetail, NoteData } from "../api/types";

export const FAKE_NOTE: NoteData = {
  chief_complaint: "Chest tightness on exertion",
  summary_one_liner: "Chest tightness on exertion, 2 wks",
  hpi_narrative: "Ana reports two weeks of chest tightness when climbing stairs.",
  red_flags: ["Chest pain with exertion"],
  allergies: [{ substance: "Penicillin", reaction: "rash", severity: "mild" }],
  medications: [{ name: "Lisinopril", dose: "10 mg", frequency: "daily" }],
  medical_history: ["Hypertension"],
  family_history: ["Father: heart disease"],
  social_history: { smoking: "Never", alcohol: "Socially", drugs: "None", occupation: "Teacher", exercise: "Walks", sleep: "6h", stress: "Moderate" },
  review_of_systems: { positives: ["fatigue"], negatives: ["no fever"] },
  soap: { subjective: "Two weeks of exertional chest tightness.",
    objective: "To be completed at visit. No examination performed during pre-visit intake.",
    assessment: ["Consider exploring cardiac risk factors"], plan: ["Ask about palpitations"] },
  patient_quotes: ["like a band around my chest"],
};

export const FAKE_DETAIL: ConversationDetail = {
  id: "abc", patient_first_name: "Ana", patient_age: 34, patient_sex: "female",
  status: "complete", chief_complaint_summary: "Chest tightness on exertion, 2 wks",
  has_red_flags: true, created_at: "2026-07-18T12:00:00Z",
  messages: [
    { role: "assistant", content: "What brings you in today?", created_at: "2026-07-18T12:00:00Z" },
    { role: "patient", content: "Chest tightness when I climb stairs.", created_at: "2026-07-18T12:00:30Z" },
  ],
  note: { data: FAKE_NOTE, red_flags: FAKE_NOTE.red_flags },
};
