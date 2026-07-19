import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import StartForm from "./StartForm";
import StageIndicator from "./StageIndicator";
import { useChat } from "./useChat";

export default function ChatPage() {
  const { state, start, send, retryLastSend, generate } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = state.phase !== "idle" || state.interviewComplete;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages, state.streaming]);

  useEffect(() => {
    if (state.interviewComplete && state.phase === "idle") void generate();
  }, [state.interviewComplete, state.phase, generate]);

  if (state.phase === "form" || (state.phase === "starting" && state.messages.length === 0 && !state.streaming))
    return state.phase === "form"
      ? <StartForm onStart={(p) => void start(p)} />
      : <p className="mt-16 text-center text-slate-500">Connecting you with Claire…</p>;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send(text);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-2xl flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <span className="text-sm font-semibold text-slate-600">Talking with Claire</span>
        <StageIndicator stage={state.stage} />
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {state.messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] ${
            m.role === "assistant" ? "bg-white border border-slate-200" : "ml-auto bg-teal-600 text-white"}`}>
            {m.content}
          </div>
        ))}
        {state.streaming && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[15px]">
            {state.streaming}<span className="animate-pulse">▍</span>
          </div>
        )}
        {state.phase === "generating" && <p className="text-center text-sm text-slate-500">Drafting your pre-visit summary…</p>}
        {state.phase === "done" && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-center">
            <p className="font-medium text-teal-800">All done — thank you!</p>
            <Link to={`/notes/${state.conversationId}`} className="mt-2 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">View the note</Link>
          </div>
        )}
        {state.phase === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm">
            <p className="text-red-700">{state.error}</p>
            <button onClick={() => (state.errorKind === "note" ? void generate() : retryLastSend())}
              className="mt-2 rounded-lg bg-red-600 px-4 py-1.5 font-semibold text-white">Try again</button>
          </div>
        )}
      </div>
      {!state.interviewComplete && state.phase !== "done" && (
        <div className="border-t border-slate-200 bg-white p-3">
          <div className="flex items-end gap-2">
            {/* MicButton slot — added in Task 13 */}
            <textarea
              className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none"
              rows={1} maxLength={2000} placeholder="Type your answer…"
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            />
            <button onClick={submit} disabled={busy || !input.trim()}
              className="rounded-xl bg-teal-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
