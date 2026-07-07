interface Stat {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warm" | "watch";
}

export function KpiStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {stats.map((s, i) => (
        <div key={i} className="card px-3 sm:px-4 py-2.5 sm:py-3 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 truncate">
            {s.label}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span
              className={`stat-num text-xl sm:text-2xl ${
                s.tone === "warm"
                  ? "text-leaf"
                  : s.tone === "watch"
                    ? "text-amber"
                    : "text-ink-900"
              }`}
            >
              {s.value}
            </span>
            {s.hint && (
              <span className="text-[10px] text-ink-400 truncate min-w-0">{s.hint}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
