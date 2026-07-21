import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MicButton from "./MicButton";
import StartForm from "./StartForm";
import StageIndicator from "./StageIndicator";
import { clampInputHeight, INPUT_MAX_H, INPUT_MIN_H } from "./inputSizing";
import { useChat } from "./useChat";
import { usePageTitle } from "../usePageTitle";

export default function ChatPage() {
  usePageTitle("Intake chat");
  const { state, start, send, retryLastSend, generate } = useChat();
  const [input, setInput] = useState("");
  const [micActive, setMicActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const busy = state.phase !== "idle" || state.interviewComplete;
  // Only while answering the very first question, so it teaches once and gets out of the way.
  const showVoiceHint = state.messages.length <= 1 && !input && !micActive;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages, state.streaming]);

  // Grow the textarea to fit its content, from the resting height up to the cap. Reruns
  // when the mic hands back a transcript and when the input reappears after recording.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight is the content box (padding, no border); the element is border-box, so add
    // the border back or the set height lands a couple px short and scrolls prematurely.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${clampInputHeight(el.scrollHeight + border)}px`;
  }, [input, micActive]);

  useEffect(() => {
    if (state.interviewComplete && state.phase === "idle") void generate();
  }, [state.interviewComplete, state.phase, generate]);

  if (state.phase === "form" || (state.phase === "starting" && state.messages.length === 0 && !state.streaming))
    return state.phase === "form"
      ? <StartForm onStart={(p) => void start(p)} />
      : <p className="mt-16 text-center text-slate-500">Connecting you with Alice…</p>;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send(text);
  };

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      {/* Header and footer bars span the full width; their inner content stays centered on
          the same column as the messages, so the white edges reach the viewport on desktop. */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-2 lg:max-w-3xl lg:px-6">
          <span className="text-sm font-semibold text-slate-600">Talking with Alice</span>
          <StageIndicator stage={state.stage} />
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4 lg:max-w-3xl lg:space-y-4 lg:px-6 lg:py-6">
        {state.messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] lg:px-5 lg:py-3 lg:text-base ${
            m.role === "assistant" ? "bg-white border border-slate-200" : "ml-auto bg-teal-600 text-white"}`}>
            {m.content}
          </div>
        ))}
        {state.streaming && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[15px] lg:px-5 lg:py-3 lg:text-base">
            {state.streaming}<span className="animate-pulse">▍</span>
          </div>
        )}
        {state.phase === "generating" && <p className="text-center text-sm text-slate-500">Drafting your pre-visit summary…</p>}
        {state.phase === "done" && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-center">
            <p className="font-medium text-teal-800">All done. Thank you!</p>
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
      </div>
      {!state.interviewComplete && state.phase !== "done" && (
        <div className="border-t border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-2xl px-4 py-3 lg:max-w-3xl lg:px-6">
          {showVoiceHint && (
            <p className="mb-2 text-center text-xs text-slate-500">
              Type your answer, or tap Speak to talk.
            </p>
          )}
          <div className="flex items-end gap-2">
            <MicButton
              disabled={busy}
              onActiveChange={setMicActive}
              onTranscript={(text) => setInput((v) => (v ? v + " " : "") + text)}
            />
            {!micActive && (
              <>
                <textarea
                  ref={taRef}
                  className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-[15px] focus:border-teal-500 focus:outline-none"
                  style={{ minHeight: INPUT_MIN_H, maxHeight: INPUT_MAX_H }}
                  maxLength={2000} placeholder="Type your answer…"
                  value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                />
                <button onClick={submit} disabled={busy || !input.trim()}
                  style={{ height: INPUT_MIN_H }}
                  className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 font-semibold text-white disabled:opacity-40">Send</button>
              </>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
