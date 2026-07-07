import Link from "next/link";
import type { OpenTopic } from "@/lib/types";
import type { CeoLog } from "@/lib/ceo-store";
import { PROGRAMMES } from "@/lib/programmes";
import { actionKey } from "@/lib/helpers";

interface Item {
  programmeId: string;
  topic: OpenTopic;
}

interface AttentionBandProps {
  items: Item[];
  ceoLog: CeoLog;
}

export function AttentionBand({ items, ceoLog }: AttentionBandProps) {
  const openItems = items.filter((it) => {
    const key = actionKey("topic", it.programmeId, it.topic.title);
    return !ceoLog.actions[key];
  });
  const handledCount = items.length - openItems.length;

  // Group open items by programme, preserving portfolio order
  const groups = PROGRAMMES.map((p) => ({
    programme: p,
    topics: openItems.filter((it) => it.programmeId === p.id)
  })).filter((g) => g.topics.length > 0);

  return (
    <section className="card px-6 py-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl text-ink-900">Needs you</h3>
        <span className="text-[11px] text-ink-400">
          {openItems.length} open
          {handledCount > 0 && ` · ${handledCount} handled`}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          {handledCount > 0
            ? "All caught up. Nice work."
            : "Nothing flagged for you this week. Enjoy the quiet."}
        </p>
      ) : (
        <div className="mt-3 flex-1 overflow-y-auto -mr-2 pr-2 space-y-3">
          {groups.map((g) => (
            <div key={g.programme.id}>
              <Link
                href={`/programme/${g.programme.id}`}
                className="group flex items-center gap-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-coral">
                  {g.programme.shortName ?? g.programme.name}
                </span>
                <span className="h-px flex-1 bg-sand-200" />
                <span className="text-[10px] text-ink-300 group-hover:text-coral transition">
                  {g.topics.length} open →
                </span>
              </Link>
              <ul className="mt-1.5 space-y-1.5">
                {g.topics.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1 h-1 mt-[7px] rounded-full shrink-0 bg-coral/60" />
                    <p className="text-[13px] leading-snug text-ink-800">
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
