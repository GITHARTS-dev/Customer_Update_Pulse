import "server-only";
import type { PulseSubmission, Vibe } from "./types";
import { readAllSubmissionRows } from "./store";
import { isoWeek, safeVibe } from "./helpers";
import { PROGRAMMES } from "./programmes";

export interface WeekSnapshot {
  programmeId: string;
  year: number;
  weekNumber: number;
  submittedAt: string;
  vibe: Vibe;
  done: number;
  total: number;
  completionPct: number;
}

type HistoryStore = Record<string, WeekSnapshot[]>;

function snapshotFrom(sub: PulseSubmission): WeekSnapshot {
  const d = new Date(sub.submittedAt);
  return {
    programmeId: sub.programmeId,
    year: isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear(),
    weekNumber: sub.weekNumber || isoWeek(isNaN(d.getTime()) ? new Date() : d),
    submittedAt: sub.submittedAt,
    vibe: safeVibe(sub.vibe),
    done: sub.jira?.done ?? 0,
    total: sub.jira?.total ?? 0,
    completionPct: Math.max(
      0,
      Math.min(100, sub.jira?.completionPct ?? 0)
    )
  };
}

function byWeek(a: WeekSnapshot, b: WeekSnapshot): number {
  return a.year === b.year ? a.weekNumber - b.weekNumber : a.year - b.year;
}

/**
 * The trend history is derived directly from the SharePoint submission rows:
 * every programme keeps one row per week, so the full set of rows IS the
 * history. Rows are grouped by programme; if two rows land in the same week
 * (shouldn't happen — writes upsert per week), the later one wins.
 */
async function buildHistory(): Promise<HistoryStore> {
  let rows: PulseSubmission[];
  try {
    rows = await readAllSubmissionRows();
  } catch (err) {
    console.error("buildHistory failed:", (err as Error).message);
    return {};
  }

  const store: HistoryStore = {};
  for (const sub of rows) {
    const snap = snapshotFrom(sub);
    const bucket = (store[sub.programmeId] ??= []);
    const idx = bucket.findIndex(
      (s) => s.year === snap.year && s.weekNumber === snap.weekNumber
    );
    if (idx >= 0) {
      if (new Date(snap.submittedAt) >= new Date(bucket[idx].submittedAt)) {
        bucket[idx] = snap;
      }
    } else {
      bucket.push(snap);
    }
  }
  for (const key of Object.keys(store)) store[key].sort(byWeek);
  return store;
}

export async function readProgrammeHistory(
  programmeId: string
): Promise<WeekSnapshot[]> {
  const store = await buildHistory();
  return (store[programmeId] ?? []).slice().sort(byWeek);
}

export interface PortfolioWeek {
  year: number;
  weekNumber: number;
  totalProgrammes: number;
  reportedCount: number;
  notYetIn: number;
  onTrack: number;
  watching: number;
  stuck: number;
  quiet: number;
  avgCompletionPct: number;
}

/**
 * At each week that has any snapshot, evaluate every programme's *latest known
 * state as of that week*. A programme that submitted in W24 as "watch_it" and
 * hasn't updated since is still counted as "watch_it" in W26, W27, etc. A
 * programme with no snapshot on-or-before the week counts as "not yet in".
 * Denominator is always the current programme count, so the chart shows a true
 * portfolio-over-time trend.
 */
export async function readPortfolioTrend(): Promise<PortfolioWeek[]> {
  const store = await buildHistory();

  const allSnaps = Object.values(store).flat();
  if (allSnaps.length === 0) return [];

  const weekKeys = new Set<string>();
  for (const s of allSnaps) weekKeys.add(`${s.year}-${s.weekNumber}`);
  const weeks = Array.from(weekKeys)
    .map((k) => {
      const [y, w] = k.split("-").map(Number);
      return { year: y, weekNumber: w };
    })
    .sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.weekNumber - b.weekNumber
    );

  const programmeSnaps: Record<string, WeekSnapshot[]> = {};
  for (const [pid, snaps] of Object.entries(store)) {
    programmeSnaps[pid] = snaps
      .slice()
      .sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.weekNumber - b.weekNumber
      );
  }

  const totalProgrammes = PROGRAMMES.length;
  const out: PortfolioWeek[] = [];

  for (const w of weeks) {
    const bucket: PortfolioWeek = {
      year: w.year,
      weekNumber: w.weekNumber,
      totalProgrammes,
      reportedCount: 0,
      notYetIn: 0,
      onTrack: 0,
      watching: 0,
      stuck: 0,
      quiet: 0,
      avgCompletionPct: 0
    };
    let completionSum = 0;
    let completionCount = 0;

    for (const p of PROGRAMMES) {
      const snaps = programmeSnaps[p.id];
      let latest: WeekSnapshot | undefined;
      if (snaps) {
        for (const s of snaps) {
          if (
            s.year < w.year ||
            (s.year === w.year && s.weekNumber <= w.weekNumber)
          ) {
            latest = s;
          } else {
            break;
          }
        }
      }

      if (!latest) {
        bucket.notYetIn += 1;
        continue;
      }

      bucket.reportedCount += 1;
      if (latest.vibe === "going_well") bucket.onTrack += 1;
      else if (latest.vibe === "watch_it") bucket.watching += 1;
      else if (latest.vibe === "stuck") bucket.stuck += 1;
      else bucket.quiet += 1;

      if (latest.total > 0) {
        completionSum += latest.completionPct;
        completionCount += 1;
      }
    }

    bucket.avgCompletionPct =
      completionCount > 0 ? Math.round(completionSum / completionCount) : 0;
    out.push(bucket);
  }

  return out;
}
