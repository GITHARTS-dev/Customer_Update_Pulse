import Link from "next/link";
import { BabyElephant } from "./BabyElephant";
import { VIBE_COLOR, weekKey, weekRangeLabel } from "@/lib/helpers";
import { VIBE_LABEL, type Vibe } from "@/lib/types";
import type { WeekSnapshot } from "@/lib/history-store";

const MAX_WEEKS = 8;

// A gentle brightness rank, only used to describe the week-over-week direction.
const VIBE_RANK: Record<Vibe, number> = {
  going_well: 2,
  watch_it: 1,
  stuck: 0
};

function directionLine(history: WeekSnapshot[]): string {
  if (history.length < 2) return "First week on record.";
  const latest = history[history.length - 1].vibe;
  const prior = history[history.length - 2].vibe;
  const d = VIBE_RANK[latest] - VIBE_RANK[prior];
  if (d > 0) return "Brighter than last week.";
  if (d < 0) return "A little softer than last week.";
  return "Holding steady from last week.";
}

interface VibeTrajectoryProps {
  history: WeekSnapshot[];
  currentVibe: Vibe;
  /** False when the latest check-in is over a week old. */
  isFresh?: boolean;
  /**
   * Set to make each dot a link into that week's checkpoint. The dots already
   * ARE the week timeline, so this is the most direct way back into one.
   */
  checkpointBase?: string;
  /** The week being viewed, so its dot can be marked as the active one. */
  activeWeekKey?: string;
}

/**
 * A programme's mood over the last few weeks - the CEO-level way to see progress
 * without a shifting percentage. Each week is a dot coloured by its vibe, oldest
 * on the left. No numbers, no baseline to distort.
 */
export function VibeTrajectory({
  history,
  currentVibe,
  isFresh = true,
  checkpointBase,
  activeWeekKey
}: VibeTrajectoryProps) {
  const weeks = history.slice(-MAX_WEEKS);

  return (
    <section className="card px-5 py-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-lg text-ink-900">How it's trended</h3>
        <span className="text-[10px] text-ink-400">
          {weeks.length <= 1 ? "this week" : `last ${weeks.length} weeks`}
        </span>
      </div>

      {weeks.length === 0 ? (
        <p className="text-sm text-ink-400">No weeks on record yet.</p>
      ) : (
        <>
          <div className="flex items-end gap-2 overflow-x-auto pb-1">
            {weeks.map((w, i) => {
              const isLatest = i === weeks.length - 1;
              const key = weekKey(w.year, w.weekNumber);
              const isActive = activeWeekKey === key;
              // The newest dot is emphasised; whichever week is being viewed
              // gets the ring, so the two can differ inside a checkpoint.
              const big = isLatest || isActive;
              const label = `Week ${w.weekNumber} · ${weekRangeLabel(w.year, w.weekNumber)} · ${VIBE_LABEL[w.vibe]}`;

              const dot = (
                <>
                  <span
                    className="rounded-full transition-transform"
                    style={{
                      width: big ? 16 : 11,
                      height: big ? 16 : 11,
                      backgroundColor: VIBE_COLOR[w.vibe],
                      opacity: big ? 1 : 0.55,
                      boxShadow: isActive
                        ? `0 0 0 3px ${VIBE_COLOR[w.vibe]}55`
                        : isLatest
                          ? `0 0 0 3px ${VIBE_COLOR[w.vibe]}22`
                          : undefined
                    }}
                  />
                  <span
                    className={`text-[9px] tabular-nums ${
                      isActive ? "text-ink-900 font-semibold" : "text-ink-400"
                    }`}
                  >
                    W{w.weekNumber}
                  </span>
                </>
              );

              // Without a base the dots stay decorative, exactly as before.
              return checkpointBase ? (
                <Link
                  key={key}
                  href={isLatest ? checkpointBase : `${checkpointBase}?week=${key}`}
                  title={`${label} - open this week`}
                  className="flex flex-col items-center gap-1.5 shrink-0 rounded-md px-1 py-0.5 -mx-1 hover:bg-sand-50 focus:outline-none focus:ring-2 focus:ring-coral/40 transition"
                >
                  {dot}
                </Link>
              ) : (
                <div
                  key={key}
                  className="flex flex-col items-center gap-1.5 shrink-0"
                  title={label}
                >
                  {dot}
                </div>
              );
            })}
          </div>
          {checkpointBase && weeks.length > 1 && (
            <p className="mt-1.5 text-[9.5px] text-ink-300">Tap a week to open it</p>
          )}

          <div className="mt-3 flex items-center gap-2.5 pt-3 border-t border-sand-200">
            <BabyElephant vibe={currentVibe} size={40} background={false} />
            <div className="min-w-0">
              {/* "this week" only when the latest check-in actually is. */}
              <p className="text-sm text-ink-900 leading-tight">
                {isFresh ? "Feeling " : "Felt "}
                <span style={{ color: VIBE_COLOR[currentVibe] }}>
                  {VIBE_LABEL[currentVibe].toLowerCase()}
                </span>
                {isFresh ? " this week." : " at the last check-in."}
              </p>
              <p className="text-[11px] text-ink-400 mt-0.5">{directionLine(weeks)}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
