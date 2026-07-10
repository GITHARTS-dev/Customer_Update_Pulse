import Link from "next/link";
import type { OpenTopic, Programme } from "@/lib/types";
import type { ActionStatus, CeoLog } from "@/lib/ceo-store";
import { actionKey } from "@/lib/helpers";

interface Item {
  programmeId: string;
  topic: OpenTopic;
}

interface AttentionBandProps {
  items: Item[];
  ceoLog: CeoLog;
  /** The active customer's programmes, for grouping + links. */
  programmes: Programme[];
  customerId: string;
}

/** Display-only status badge (the acting happens on the programme page). */
const STATUS_META: Record<ActionStatus, { label: string; bg: string; fg: string; icon: string }> = {
  done: { label: "Done", bg: "#E1F0E7", fg: "#2F6A4A", icon: "✓" },
  noted: { label: "Noted", bg: "#ECEAF7", fg: "#6C6689", icon: "•" },
  dismissed: { label: "Not now", bg: "#F8E7CC", fg: "#7A4A0E", icon: "⏸" }
};

/**
 * The discussion points waiting across the portfolio — read-only here. Each
 * point shows whether it's been handled (a Noted / Done / Not now badge that
 * mirrors what was set inside the programme). Open points sit on top; handled
 * ones drop below, dimmed. To act on one, open its programme — the status is
 * the same underlying record, so it stays in sync both ways.
 */
export function AttentionBand({ items, ceoLog, programmes, customerId }: AttentionBandProps) {
  const statusOf = (it: Item) =>
    ceoLog.actions[actionKey("topic", it.programmeId, it.topic.title)]?.status;
  const openCount = items.filter((it) => !statusOf(it)).length;
  const handledCount = items.length - openCount;

  const groups = programmes
    .map((p) => {
      const topics = items.filter((it) => it.programmeId === p.id);
      const open = topics.filter((it) => !statusOf(it));
      const handled = topics.filter((it) => statusOf(it));
      return { programme: p, topics: [...open, ...handled], openN: open.length };
    })
    .filter((g) => g.topics.length > 0);

  return (
    <section className="card px-6 py-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl text-ink-900">Key Discussion Points</h3>
        <span className="text-[11px] text-ink-400">
          {openCount} open
          {handledCount > 0 && ` · ${handledCount} handled`}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Nothing needs a decision this week.</p>
      ) : (
        <div className="mt-3 flex-1 overflow-y-auto -mr-2 pr-2 space-y-3.5">
          {groups.map((g) => (
            <div key={g.programme.id}>
              <Link
                href={`/c/${customerId}/programme/${g.programme.id}`}
                className="group flex items-center gap-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-coral">
                  {g.programme.shortName ?? g.programme.name}
                </span>
                <span className="h-px flex-1 bg-sand-200" />
                <span className="text-[10px] text-ink-300 group-hover:text-coral transition">
                  {g.openN > 0 ? `${g.openN} open →` : "all handled →"}
                </span>
              </Link>
              <ul className="mt-1.5 space-y-1.5">
                {g.topics.map((it, i) => {
                  const status = statusOf(it);
                  const meta = status ? STATUS_META[status] : null;
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-1 h-1 mt-[7px] rounded-full shrink-0 bg-coral/60" />
                      <p
                        className={`flex-1 text-[13px] leading-snug ${
                          meta ? "text-ink-400 line-through decoration-1" : "text-ink-800"
                        }`}
                      >
                        {it.topic.title}
                      </p>
                      {meta && (
                        <span
                          className="mt-0.5 shrink-0 inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: meta.bg, color: meta.fg }}
                          title={`Marked ${meta.label} on this programme`}
                        >
                          <span aria-hidden>{meta.icon}</span>
                          {meta.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
