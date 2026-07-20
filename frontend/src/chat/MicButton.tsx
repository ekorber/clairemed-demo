import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

type MicState = "idle" | "recording" | "busy" | "error";

const MAX_RECORD_MS = 60_000;
const TICK_MS = 100;
const BARS = 4;

const clock = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export default function MicButton({
  disabled,
  onTranscript,
  onRecordingChange,
}: {
  disabled: boolean;
  onTranscript: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const [micState, setMicState] = useState<MicState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number>(undefined);
  const errorTimeoutRef = useRef<number>(undefined);
  const audioRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);

  const stopTicking = () => {
    window.clearInterval(tickRef.current);
    audioRef.current?.ctx.close().catch(() => {});
    audioRef.current = null;
  };

  useEffect(() => () => {
    stopTicking();
    window.clearTimeout(errorTimeoutRef.current);
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null; // drop the transcribe callback, the input is gone
      if (recorder.state !== "inactive") recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  useEffect(() => onRecordingChange?.(micState === "recording"),
    [micState, onRecordingChange]);

  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

  const failWith = () => {
    setMicState("error");
    errorTimeoutRef.current = window.setTimeout(() => setMicState("idle"), 3000);
  };

  /** Stop and transcribe. */
  const stop = () => {
    stopTicking();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  /** Stop and throw the audio away. */
  const cancel = () => {
    stopTicking();
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = null;
    if (recorder.state !== "inactive") recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setMicState("idle");
  };

  // Feature-detected: jsdom and older browsers have no AudioContext, and the level
  // meter is decorative, so its absence must never block recording.
  const attachLevelMeter = (stream: MediaStream) => {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioRef.current = { ctx, analyser };
    } catch {
      audioRef.current = null; // decorative only
    }
  };

  const sampleLevel = () => {
    const analyser = audioRef.current?.analyser;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    // Root-mean-square around the 128 midpoint, scaled to roughly 0-1.
    const rms = Math.sqrt(data.reduce((sum, v) => sum + (v - 128) ** 2, 0) / data.length) / 40;
    setLevel(Math.min(1, rms));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stopTicking();
        stream.getTracks().forEach((t) => t.stop());
        setMicState("busy");
        try {
          onTranscript(await api.transcribe(new Blob(chunks, { type: "audio/webm" })));
          setMicState("idle");
        } catch {
          failWith();
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      attachLevelMeter(stream);
      startedAtRef.current = Date.now();
      setElapsed(0);
      setLevel(0);
      setMicState("recording");
      tickRef.current = window.setInterval(() => {
        sampleLevel();
        // Measured against the wall clock, not accumulated ticks: browsers throttle
        // timers in background tabs (to roughly 1/sec), so counting ticks would
        // under-report the duration and let the cap overrun.
        const ms = Date.now() - startedAtRef.current;
        setElapsed(ms);
        if (ms >= MAX_RECORD_MS) stop();
      }, TICK_MS);
    } catch {
      failWith(); // permission denied or no device
    }
  };

  if (micState === "recording") {
    return (
      <div className="flex flex-1 items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-600" />
        <span className="shrink-0 font-mono text-sm tabular-nums text-red-900">
          {clock(elapsed)} / {clock(MAX_RECORD_MS)}
        </span>
        <span className="flex flex-1 items-center gap-1" aria-hidden="true">
          {Array.from({ length: BARS }, (_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-red-400 transition-[height] duration-100"
              style={{ height: `${4 + (level > i / BARS ? 12 : 0)}px` }}
            />
          ))}
        </span>
        <button type="button" onClick={cancel}
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-white">
          Cancel
        </button>
        <button type="button" onClick={stop}
          className="shrink-0 rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white">
          Stop
        </button>
      </div>
    );
  }

  if (micState === "busy")
    return (
      <span className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-500">
        Transcribing…
      </span>
    );

  if (micState === "error")
    return (
      <span className="flex shrink-0 items-center rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Mic unavailable, please type
      </span>
    );

  return (
    <button
      type="button" disabled={disabled} title="Speak your answer" aria-label="Speak your answer"
      onClick={() => void startRecording()}
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
    >
      <span aria-hidden="true" className="text-lg leading-none">🎤</span> Speak
    </button>
  );
}
