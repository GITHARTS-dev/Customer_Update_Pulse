import "server-only";
import { cache } from "react";
import type { Customer } from "./customers";
import type { PulseSubmission } from "./types";
import { readAllSubmissionRows } from "./store";
import { isoWeek, isoWeekYear, weekKey, weekRangeLabel } from "./helpers";

/**
 * Checkpoints - the dashboard as it stood in an earlier week.
 *
 * No new capture is involved: the submissions list already holds one row per
 * programme per week and never deletes, so every past week is sitting there in
 * full (narrative, signals, decisions). The live dashboard only ever reads the
 * LATEST row per programme, which is why none of it was reachable. These two
 * functions read the same rows a week at a time instead.
 */

/** One selectable week in the checkpoint picker. */
export interface WeekCheckpoint {
  /** `2026-W28` - what goes in the URL. */
  key: string;
  year: number;
  week: number;
  /** "6 - 12 Jul 2026" */
  range: string;
  /** How many programmes checked in that week. */
  programmeCount: number;
  /** The most recent submission in that week, for ordering. */
  latestAt: string;
}

/**
 * Which week a stored row belongs to. Prefers the row's own `WeekNumber` and
 * falls back to deriving it, matching how the trend chart keys its dots - the
 * dots are clickable checkpoints, so the two must agree or a dot would open a
 * week that reads as empty.
 */
export function weekOfSubmission(sub: PulseSubmission): { year: number; week: number } {
  const d = new Date(sub.submittedAt);
  const when = isNaN(d.getTime()) ? new Date() : d;
  return { year: isoWeekYear(when), week: sub.weekNumber || isoWeek(when) };
}

/**
 * Every week that has at least one check-in, newest first. Degrades to an empty
 * list on any read failure, so the picker simply doesn't offer anything rather
 * than taking the page down.
 */
export const readAvailableWeeks = cache(
  async (customer: Customer): Promise<WeekCheckpoint[]> => {
    let rows: PulseSubmission[];
    try {
      rows = await readAllSubmissionRows(customer);
    } catch (err) {
      console.error("readAvailableWeeks failed:", (err as Error).message);
      return [];
    }

    const byKey = new Map<string, WeekCheckpoint>();
    for (const sub of rows) {
      const { year, week } = weekOfSubmission(sub);
      const key = weekKey(year, week);
      const existing = byKey.get(key);
      if (existing) {
        existing.programmeCount += 1;
        if (sub.submittedAt > existing.latestAt) existing.latestAt = sub.submittedAt;
        continue;
      }
      byKey.set(key, {
        key,
        year,
        week,
        range: weekRangeLabel(year, week),
        programmeCount: 1,
        latestAt: sub.submittedAt
      });
    }

    return Array.from(byKey.values()).sort((a, b) =>
      a.year === b.year ? b.week - a.week : b.year - a.year
    );
  }
);

/**
 * Every programme's submission for one specific week, keyed by programme id.
 * Same shape `readAllSubmissions` returns, so a page can swap one for the other
 * and render unchanged. A week with no rows comes back empty rather than
 * falling back to the current week - silently showing today's data under a past
 * week's heading would be worse than showing nothing.
 */
export const readSubmissionsForWeek = cache(
  async (
    customer: Customer,
    year: number,
    week: number
  ): Promise<Record<string, PulseSubmission>> => {
    let rows: PulseSubmission[];
    try {
      rows = await readAllSubmissionRows(customer);
    } catch (err) {
      console.error("readSubmissionsForWeek failed:", (err as Error).message);
      return {};
    }

    const out: Record<string, PulseSubmission> = {};
    for (const sub of rows) {
      const w = weekOfSubmission(sub);
      if (w.year !== year || w.week !== week) continue;
      // Two rows in one week for one programme shouldn't happen (the write is an
      // upsert on exactly this key) but if it ever does, the later one is the
      // one that was live.
      const existing = out[sub.programmeId];
      if (!existing || sub.submittedAt > existing.submittedAt) out[sub.programmeId] = sub;
    }
    return out;
  }
);
