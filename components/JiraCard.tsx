import type { JiraSnapshot } from "@/lib/types";

/**
 * A compact Jira snapshot for one programme's board, captured at the moment of
 * the last check-in (Jira is read server-side on submit, not live on render).
 * The parent only renders this when there are tickets to show — a programme
 * whose board is empty or unconfigured has `total === 0` and gets no card at
 * all, so the CEO never sees an empty shell.
 *
 * On a programme's own page the CEO can go one level deeper than the portfolio
 * view: the completion figure and proportional bar are joined by the per-status
 * counts (done / in progress / to do) and the total, for a fuller delivery read.
 */
export function JiraCard({ snapshot }: { snapshot: JiraSnapshot }) {
  const { total, done, inProgress, todo, completionPct } = snapshot;

  const segments = [
    { key: "done", value: done, color: "#3BA46A", label: "Done" },
    { key: "inProgress", value: inProgress, color: "#E8A020", label: "In progress" },
    { key: "todo", value: todo, color: "#C9C3DC", label: "To do" }
  ].filter((s) => s.value > 0);

  return (
    <section className="card px-5 py-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-lg text-ink-900">Delivery in Jira</h3>
        <span className="text-[10px] text-ink-400">{total} tickets</span>
      </div>

      <div className="flex items-end gap-2 mb-2.5">
        <span className="text-3xl font-serif text-ink-900 tabular-nums">
          {completionPct}
          <span className="text-lg text-ink-400">%</span>
        </span>
        <span className="text-[11px] text-ink-500 mb-1">complete</span>
      </div>

      {/* Proportional bar of done / in-progress / to-do */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-sand-100">
        {segments.map((s) => (
          <span
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={s.label}
          />
        ))}
      </div>

      {/* Legend — label + count for each status */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {[
          { label: "Done", color: "#3BA46A", value: done },
          { label: "In progress", color: "#E8A020", value: inProgress },
          { label: "To do", color: "#948FAB", value: todo }
        ].map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[11px] text-ink-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
            <span className="tabular-nums font-medium text-ink-800">{s.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
