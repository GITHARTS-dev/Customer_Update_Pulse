import Link from "next/link";
import { BabyElephant } from "./BabyElephant";
import { VIBE_COLOR } from "@/lib/helpers";
import { VIBE_LABEL, type Programme, type PulseSubmission, type Vibe } from "@/lib/types";

export interface BoardEntry {
  programme: Programme;
  submission?: PulseSubmission;
  freshness: "fresh" | "stale" | "missing";
  unseen: boolean;
}

export const VIBE_ORDER: Vibe[] = ["going_well", "watch_it", "stuck"];

/**
 * Splits board entries into the fresh mood shelves (one per vibe) and the
 * "awaiting check-in" list. Shared by the plain VibeBoard and the home
 * masonry, which lays the same shelves out as independent cards.
 */
export function computeBoard(entries: BoardEntry[]): {
  groups: { vibe: Vibe; entries: BoardEntry[] }[];
  awaiting: BoardEntry[];
} {
  const fresh = entries.filter((e) => e.submission && e.freshness === "fresh");
  const awaiting = entries.filter((e) => e.freshness !== "fresh");
  const groups = VIBE_ORDER.map((vibe) => ({
    vibe,
    entries: fresh.filter((e) => e.submission!.vibe === vibe)
  }));
  return { groups, awaiting };
}

const VIBE_TINT: Record<Vibe, { bg: string; border: string }> = {
  going_well: { bg: "#3BA46A0D", border: "#3BA46A24" },
  watch_it: { bg: "#E8A02010", border: "#E8A0202C" },
  stuck: { bg: "#D6473F0C", border: "#D6473F22" }
};

const VIBE_WHISPER: Record<Vibe, string> = {
  going_well: "humming along",
  watch_it: "worth a glance",
  stuck: "needs your warmth"
};

const VIBE_EMPTY: Record<Vibe, string> = {
  going_well: "no one yet, the week is young",
  watch_it: "nothing to keep an eye on",
  stuck: "nobody carrying anything heavy"
};

/** Calm relief colour for the one empty state that should read as good news. */
const RELIEF_TINT = { bg: "#3BA46A0D", border: "#3BA46A24" };

export function VibeBoard({
  entries,
  customerId
}: {
  entries: BoardEntry[];
  customerId: string;
}) {
  const { groups, awaiting } = computeBoard(entries);

  return (
    <div className="flex flex-col gap-3.5">
      {groups.map(({ vibe, entries: group }) => (
        <MoodShelf key={vibe} vibe={vibe} entries={group} customerId={customerId} />
      ))}
      {awaiting.length > 0 && <AwaitingRow entries={awaiting} customerId={customerId} />}
    </div>
  );
}

/** The dashed "awaiting check-in" row - its own card so the masonry can flow it. */
export function AwaitingRow({
  entries,
  customerId
}: {
  entries: BoardEntry[];
  customerId: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-card border border-dashed border-sand-300 bg-cream/60 px-4 py-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400 mr-1">
        Awaiting check-in
      </span>
      {entries.map(({ programme, freshness }) => (
        <Link
          key={programme.id}
          href={`/c/${customerId}/programme/${programme.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-sand-100 hover:bg-sand-200 border border-sand-200 px-2.5 py-1 text-[11px] text-ink-500 transition"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              freshness === "stale" ? "bg-amber" : "bg-sand-300"
            }`}
          />
          {programme.shortName ?? programme.name}
          <span className="text-[9px] text-ink-300">
            {freshness === "stale" ? "stale" : "not yet in"}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function MoodShelf({
  vibe,
  entries,
  customerId
}: {
  vibe: Vibe;
  entries: BoardEntry[];
  customerId: string;
}) {
  const isRelief = vibe === "stuck" && entries.length === 0;
  const tint = isRelief ? RELIEF_TINT : VIBE_TINT[vibe];
  const whisper = entries.length === 0 && !isRelief ? VIBE_EMPTY[vibe] : VIBE_WHISPER[vibe];
  const reliefCopy = "nobody carrying anything heavy, what a relief";

  return (
    <section
      className="rounded-card border px-4 sm:px-5 py-4 flex flex-col sm:flex-row gap-4 sm:gap-5 sm:items-center transition-colors"
      style={{ backgroundColor: tint.bg, borderColor: tint.border }}
    >
      <div className="flex items-center gap-3.5 shrink-0 sm:w-[196px]">
        <div className="shrink-0 -my-2">
          <BabyElephant vibe={vibe} size={88} animated />
        </div>
        <div className="min-w-0 flex-1">
          {/* Label fills the column, the count is pinned to its right edge, so
              the numbers line up in a straight vertical column across every
              shelf no matter how long or short the label is. */}
          <div className="flex items-baseline gap-2">
            <h3 className="font-serif text-lg text-ink-900 leading-tight flex-1 min-w-0">
              {VIBE_LABEL[vibe]}
            </h3>
            <span
              className="stat-num text-2xl leading-none shrink-0 tabular-nums text-right"
              style={{ color: isRelief ? VIBE_COLOR.going_well : VIBE_COLOR[vibe] }}
            >
              {entries.length}
            </span>
          </div>
          <p className="text-[11px] text-ink-400 mt-0.5 leading-snug">
            {isRelief ? reliefCopy : whisper}
          </p>
        </div>
      </div>

      <span
        className="hidden sm:block self-stretch w-px shrink-0"
        style={{ backgroundColor: tint.border }}
      />

      {entries.length === 0 ? (
        <p className="flex-1 text-[12px] text-ink-300 italic py-1">
          {isRelief ? "Take a breath. All quiet here." : "Nothing to show this week."}
        </p>
      ) : (
        <ul className="flex-1 min-w-0 flex flex-wrap gap-2.5">
          {entries.map(({ programme, unseen }) => {
            return (
              <li key={programme.id} className="w-[172px] shrink-0">
                <Link
                  href={`/c/${customerId}/programme/${programme.id}`}
                  className="block rounded-xl bg-cream border border-sand-200 px-3.5 py-3 shadow-card hover:shadow-hero hover:-translate-y-0.5 transition-all relative"
                  style={{ borderLeft: `3px solid ${VIBE_COLOR[vibe]}` }}
                >
                  {unseen && (
                    <span
                      className="absolute -top-1.5 -left-1.5 w-[18px] h-[18px] rounded-full bg-coral text-cream text-[9.5px] font-bold leading-none flex items-center justify-center ring-2 ring-cream"
                      title="New since your last visit"
                    >
                      !
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-ink-900 truncate block">
                    {programme.shortName ?? programme.name}
                  </span>
                  {programme.subProgrammes && programme.subProgrammes.length > 0 && (
                    <p className="text-[9.5px] text-ink-300 truncate mt-0.5">
                      incl. {programme.subProgrammes.join(", ")}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
