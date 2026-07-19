import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ConversationDetail, ConversationSummary } from "../api/types";
import NoteView from "./NoteView";

export default function NotesPage() {
  const { id } = useParams();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.fetchConversations().then(setConversations).catch(() => setError(true));
  }, []);

  useEffect(() => {
    setDetail(null);
    if (id) api.fetchConversation(id).then(setDetail).catch(() => setError(true));
  }, [id]);

  if (error) return <p className="p-8 text-red-600">Couldn't load notes — is the backend running?</p>;

  const sidebar = (
    <nav className="divide-y divide-slate-100">
      {conversations?.length === 0 && (
        <p className="p-4 text-sm text-slate-500">No conversations yet. <Link className="text-teal-700 underline" to="/chat">Start one</Link>.</p>
      )}
      {conversations?.map((c) => (
        <Link key={c.id} to={`/notes/${c.id}`}
          className={`block px-4 py-3 hover:bg-slate-50 ${c.id === id ? "bg-teal-50" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{c.patient_first_name}</span>
            {c.has_red_flags && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">⚠ red flag</span>}
          </div>
          <p className="truncate text-sm text-slate-600">{c.chief_complaint_summary || "Interview in progress…"}</p>
          <p className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString()}</p>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-6xl">
      <aside className={`w-full overflow-y-auto border-r border-slate-200 bg-white md:block md:w-80 ${id ? "hidden" : ""}`}>
        <h2 className="border-b border-slate-200 px-4 py-3 font-bold">Patient conversations</h2>
        {conversations === null ? <p className="p-4 text-sm text-slate-400">Loading…</p> : sidebar}
      </aside>
      <section className={`flex-1 overflow-y-auto ${id ? "" : "hidden md:block"}`}>
        {id ? (
          detail ? (
            <>
              <Link to="/notes" className="m-4 inline-block text-sm text-teal-700 md:hidden">← All conversations</Link>
              <NoteView detail={detail} />
            </>
          ) : <p className="p-8 text-slate-400">Loading…</p>
        ) : <p className="p-8 text-slate-400">Select a conversation to view its note.</p>}
      </section>
    </div>
  );
}
