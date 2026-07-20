export type ChatEvent =
  | { conversation_id: string }
  | { delta: string }
  | { done: true; stage: string | null; interview_complete: boolean }
  | { error: string };

export interface NoteData {
  chief_complaint: string;
  summary_one_liner: string;
  hpi_narrative: string;
  red_flags: string[];
  allergies: { substance: string; reaction: string; severity: string }[];
  medications: { name: string; dose: string; frequency: string }[];
  medical_history: string[];
  family_history: string[];
  social_history: { smoking: string; alcohol: string; drugs: string; occupation: string; exercise: string; sleep: string; stress: string };
  review_of_systems: { positives: string[]; negatives: string[] };
  soap: { subjective: string; objective: string; assessment: string[]; plan: string[] };
  patient_quotes: string[];
}

export interface NoteResult { data: NoteData; red_flags: string[] }

export interface ConversationSummary {
  id: string;
  patient_first_name: string;
  patient_age: number;
  patient_sex: string;
  status: "active" | "generating" | "complete" | "abandoned";
  chief_complaint_summary: string;
  has_red_flags: boolean;
  /** Alice escalated to emergency or crisis care during the interview. Set live, so it
   *  is present even when the interview was abandoned and no note exists. */
  emergency_flagged: boolean;
  created_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: { role: "assistant" | "patient"; content: string; created_at: string }[];
  note: { data: NoteData; red_flags: string[] } | null;
}
