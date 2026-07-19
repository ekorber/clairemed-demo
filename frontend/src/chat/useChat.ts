import { useCallback, useReducer, useRef } from "react";
import { api } from "../api/client";
import { readSse } from "../api/sse";
import { chatReducer, initialChatState } from "./chatReducer";

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const idRef = useRef<string | null>(null);
  const lastSentRef = useRef<string>("");
  const lastStartRef = useRef<{ firstName: string; age: number; sex: string } | null>(null);

  const consume = useCallback(async (res: Response) => {
    for await (const event of readSse(res)) {
      if ("conversation_id" in event) {
        idRef.current = event.conversation_id;
        dispatch({ type: "CONVERSATION_ID", id: event.conversation_id });
      } else if ("delta" in event) dispatch({ type: "DELTA", text: event.delta });
      else if ("error" in event) throw new Error(event.error);
      else if ("done" in event)
        dispatch({ type: "STREAM_DONE", stage: event.stage, interviewComplete: event.interview_complete });
    }
  }, []);

  const start = useCallback(async (p: { firstName: string; age: number; sex: string }) => {
    lastStartRef.current = p;
    dispatch({ type: "START" });
    try {
      await consume(await api.startConversation(p));
    } catch {
      dispatch({ type: "ERROR", kind: "chat", message: "Couldn't start the interview. Please try again." });
    }
  }, [consume]);

  const send = useCallback(async (content: string, opts?: { isRetry?: boolean }) => {
    if (!idRef.current) return;
    lastSentRef.current = content;
    if (!opts?.isRetry) dispatch({ type: "PATIENT_MESSAGE", content });
    try {
      await consume(await api.sendMessage(idRef.current, content));
    } catch (e) {
      dispatch({ type: "ERROR", kind: "chat", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }, [consume]);

  const retryLastSend = useCallback(() => {
    dispatch({ type: "RETRY" });
    if (!idRef.current || !lastSentRef.current) {
      if (lastStartRef.current) void start(lastStartRef.current);
      return;
    }
    void send(lastSentRef.current, { isRetry: true });
  }, [send, start]);

  const generate = useCallback(async () => {
    if (!idRef.current) return;
    dispatch({ type: "GENERATING" });
    try {
      await api.generateNote(idRef.current);
      dispatch({ type: "NOTE_READY" });
    } catch {
      dispatch({ type: "ERROR", kind: "note", message: "Note generation failed." });
    }
  }, []);

  return { state, start, send, retryLastSend, generate };
}
