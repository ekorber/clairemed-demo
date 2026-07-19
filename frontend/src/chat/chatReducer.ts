export interface ChatMessage { role: "assistant" | "patient"; content: string }

export interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  streaming: string;
  stage: string | null;
  phase: "form" | "starting" | "idle" | "streaming" | "generating" | "done" | "error";
  errorKind: "chat" | "note" | null;
  error: string | null;
  interviewComplete: boolean;
}

export type ChatAction =
  | { type: "START" }
  | { type: "CONVERSATION_ID"; id: string }
  | { type: "PATIENT_MESSAGE"; content: string }
  | { type: "DELTA"; text: string }
  | { type: "STREAM_DONE"; stage: string | null; interviewComplete: boolean }
  | { type: "GENERATING" }
  | { type: "NOTE_READY" }
  | { type: "ERROR"; kind: "chat" | "note"; message: string }
  | { type: "RETRY" };

export const initialChatState: ChatState = {
  conversationId: null, messages: [], streaming: "", stage: null,
  phase: "form", errorKind: null, error: null, interviewComplete: false,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "START":
      return { ...state, phase: "starting" };
    case "CONVERSATION_ID":
      return { ...state, conversationId: action.id };
    case "PATIENT_MESSAGE":
      return { ...state, phase: "streaming",
        messages: [...state.messages, { role: "patient", content: action.content }] };
    case "DELTA":
      return { ...state, phase: "streaming", streaming: state.streaming + action.text };
    case "STREAM_DONE":
      return { ...state, phase: "idle", streaming: "",
        stage: action.stage ?? state.stage,
        interviewComplete: action.interviewComplete || state.interviewComplete,
        // trimEnd: the stream may end with the newline that preceded a stripped marker
        messages: state.streaming.trim()
          ? [...state.messages, { role: "assistant", content: state.streaming.trimEnd() }]
          : state.messages };
    case "GENERATING":
      return { ...state, phase: "generating", errorKind: null, error: null };
    case "NOTE_READY":
      return { ...state, phase: "done" };
    case "ERROR":
      return { ...state, phase: "error", errorKind: action.kind, error: action.message, streaming: "" };
    case "RETRY":
      return { ...state, phase: "idle", errorKind: null, error: null };
  }
}
