import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

type MicState = "idle" | "recording" | "busy" | "error";
const MAX_RECORD_MS = 60_000;

export default function MicButton({ disabled, onTranscript }: { disabled: boolean; onTranscript: (text: string) => void }) {
  const [micState, setMicState] = useState<MicState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timeoutRef = useRef<number>(undefined);

  useEffect(() => () => {
    window.clearTimeout(timeoutRef.current);
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null; // drop the transcribe callback — the input is gone
      if (recorder.state !== "inactive") recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

  const stop = () => {
    window.clearTimeout(timeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setMicState("busy");
        try {
          onTranscript(await api.transcribe(new Blob(chunks, { type: "audio/webm" })));
          setMicState("idle");
        } catch {
          setMicState("error");
          window.setTimeout(() => setMicState("idle"), 3000);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setMicState("recording");
      timeoutRef.current = window.setTimeout(stop, MAX_RECORD_MS);
    } catch {
      setMicState("error"); // permission denied
      window.setTimeout(() => setMicState("idle"), 3000);
    }
  };

  const labels: Record<MicState, string> = {
    idle: "Speak your answer", recording: "Stop recording", busy: "Transcribing…", error: "Mic unavailable, please type",
  };
  return (
    <button
      type="button" disabled={micState === "busy" || (disabled && micState !== "recording")} title={labels[micState]} aria-label={labels[micState]}
      onClick={micState === "recording" ? stop : micState === "idle" ? () => void startRecording() : undefined}
      className={`rounded-xl border px-3 py-2 text-lg leading-none ${
        micState === "recording" ? "animate-pulse border-red-300 bg-red-100"
        : micState === "error" ? "border-amber-300 bg-amber-50"
        : "border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"}`}
    >
      {micState === "busy" ? "…" : micState === "recording" ? "■" : "🎤"}
    </button>
  );
}
