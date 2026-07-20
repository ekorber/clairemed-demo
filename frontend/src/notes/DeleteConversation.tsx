import { useState } from "react";
import { api } from "../api/client";

type Phase = "idle" | "confirming" | "deleting" | "error";

export default function DeleteConversation({
  id,
  patientName,
  onDeleted,
}: {
  id: string;
  patientName: string;
  onDeleted: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  const remove = async () => {
    setPhase("deleting");
    try {
      await api.deleteConversation(id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete this conversation.");
      setPhase("error");
    }
  };

  if (phase === "idle")
    return (
      <button
        onClick={() => setPhase("confirming")}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700"
      >
        Delete
      </button>
    );

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
      <p className="font-medium text-red-800">
        Delete {patientName}'s conversation? This removes the note and the full transcript, and
        cannot be undone.
      </p>
      {phase === "error" && <p className="mt-1 text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => { setPhase("idle"); setError(""); }}
          disabled={phase === "deleting"}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={() => void remove()}
          disabled={phase === "deleting"}
          className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
        >
          {phase === "deleting" ? "Deleting…" : phase === "error" ? "Try again" : "Delete"}
        </button>
      </div>
    </div>
  );
}
