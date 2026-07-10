import "server-only";
import type { PulseSubmission, Vibe } from "./types";
import type { Customer } from "./customers";
import { readAllSubmissionRows } from "./store";
import { isoWeek, safeVibe } from "./helpers";

/**
 * A single week's mood for one programme. We deliberately keep only the vibe
 * here, not ticket counts or completion percentages: those have no stable
 * baseline (a programme's ticket total can swing week to week), so a percentage
 * trend would be misleading. The vibe is the CEO-level signal that actually
 * carries meaning over time.
 */
export interface WeekSnapshot {
  programmeId: string;
  year: number;
  weekNumber: number;
  submittedAt: string;
  vibe: Vibe;
}

function snapshotFrom(sub: PulseSubmission): WeekSnapshot {
  const d = new Date(sub.submittedAt);
  const valid = !isNaN(d.getTime());
  return {
    programmeId: sub.programmeId,
    year: valid ? d.getFullYear() : new Date().getFullYear(),
    weekNumber: sub.weekNumber || isoWeek(valid ? d : new Date()),
    submittedAt: sub.submittedAt,
    vibe: safeVibe(sub.vibe)
  };
}

function byWeek(a: WeekSnapshot, b: WeekSnapshot): number {
  return a.year === b.year ? a.weekNumber - b.weekNumber : a.year - b.year;
}

/**
 * A programme's mood, week by week, oldest first. Derived straight from the
 * SharePoint submission rows (one row per programme per week, so the rows ARE
 * the history). If two rows land in the same week, the later one wins.
 */
export async function readProgrammeHistory(
  customer: Customer,
  programmeId: string
): Promise<WeekSnapshot[]> {
  let rows: PulseSubmission[];
  try {
    rows = await readAllSubmissionRows(customer);
  } catch (err) {
    console.error("readProgrammeHistory failed:", (err as Error).message);
    return [];
  }

  const byWeekKey = new Map<string, WeekSnapshot>();
  for (const sub of rows) {
    if (sub.programmeId !== programmeId) continue;
    const snap = snapshotFrom(sub);
    const key = `${snap.year}-${snap.weekNumber}`;
    const existing = byWeekKey.get(key);
    if (!existing || new Date(snap.submittedAt) >= new Date(existing.submittedAt)) {
      byWeekKey.set(key, snap);
    }
  }

  return Array.from(byWeekKey.values()).sort(byWeek);
}
