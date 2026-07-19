import type { ConversationDetail } from "../api/types";

export default function Transcript({
  messages,
  patientName,
}: {
  messages: ConversationDetail["messages"];
  patientName: string;
}) {
  if (messages.length === 0) return null;

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">
        Full conversation ({messages.length} message{messages.length === 1 ? "" : "s"})
      </summary>
      <div className="mt-3 space-y-3">
        {messages.map((m, i) => {
          const isAssistant = m.role === "assistant";
          return (
            <div key={i} className={isAssistant ? "" : "flex flex-col items-end"}>
              <p className="mb-0.5 text-xs text-slate-500">
                {isAssistant ? "Alice" : patientName} · {new Date(m.created_at).toLocaleTimeString()}
              </p>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] ${
                  isAssistant ? "border border-slate-200 bg-white" : "bg-teal-600 text-white"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
