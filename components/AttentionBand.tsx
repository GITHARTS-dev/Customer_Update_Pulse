import Link from "next/link";
import type { OpenTopic, Programme } from "@/lib/types";

interface Item {
  programmeId: string;
  topic: OpenTopic;
}

interface AttentionBandProps {
  items: Item[];
  /** The active customer's programmes, for grouping + links. */
  programmes: Programme[];
  customerId: string;
}

/**
 * The open decisions leads have raised across the portfolio - read-only, and
 * the only place they appear now (the programme page no longer repeats them).
 * Grouped by programme, each linking through. Acting on things happens on the
 * asks in a programme's Signals card, not here.
 */
export function AttentionBand({ items, programmes, customerId }: AttentionBandProps) {
  const groups = programmes
    .map((p) => ({
      programme: p,
      topics: items.filter((it) => it.programmeId === p.id)
    }))
    .filter((g) => g.topics.length > 0);

  return (
    <section className="card px-6 py-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl text-ink-900">Key Discussion Points</h3>
        <span className="text-[11px] text-ink-400">{items.length} open</span>
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
                  open →
                </span>
              </Link>
              <ul className="mt-1.5 space-y-1.5">
                {g.topics.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1 h-1 mt-[7px] rounded-full shrink-0 bg-coral/60" />
                    <p className="flex-1 text-[13px] leading-snug text-ink-800">
                      {it.topic.title}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
