const STAGES = [
  { key: "complaint", label: "Your concern" },
  { key: "history", label: "History" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "wrap_up", label: "Wrap-up" },
];

export default function StageIndicator({ stage }: { stage: string | null }) {
  const index = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  return (
    <div className="flex items-center gap-1.5" aria-label={`Interview stage: ${STAGES[index].label}`}>
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${i <= index ? "bg-teal-500" : "bg-slate-300"}`} />
          <span className={`hidden text-xs sm:inline ${i === index ? "font-semibold text-teal-700" : "text-slate-400"}`}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
