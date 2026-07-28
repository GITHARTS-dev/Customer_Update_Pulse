import type { Vibe } from "./types";

export const VIBE_COLOR: Record<Vibe, string> = {
  going_well: "#3BA46A",
  watch_it: "#E8A020",
  stuck: "#D6473F"
};

const VALID_VIBES: readonly Vibe[] = ["going_well", "watch_it", "stuck"] as const;

// Unknown/legacy values (including the retired "quiet_week") settle on the
// neutral middle - watch_it - rather than the extremes.
export function safeVibe(v: unknown): Vibe {
  return typeof v === "string" && (VALID_VIBES as readonly string[]).includes(v)
    ? (v as Vibe)
    : "watch_it";
}

export const VIBE_TONE: Record<Vibe, { bg: string; text: string }> = {
  going_well: { bg: "#E1F0E7", text: "#2F6A4A" },
  watch_it: { bg: "#F8E7CC", text: "#7A4A0E" },
  stuck: { bg: "#F2D2CC", text: "#7E1F14" }
};

export function parseBold(narrative: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(narrative))) {
    if (m.index > last) out.push({ text: narrative.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < narrative.length) out.push({ text: narrative.slice(last), bold: false });
  return out;
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = now.getTime() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * One warm, human sentence summarising how the whole portfolio feels.
 * Written to soothe, never to alarm - Sreema reads this first.
 */
export function emotionalOneLiner(
  counts: Record<Vibe, number>,
  freshCount: number
): string {
  if (freshCount === 0) {
    return "The week is still settling in. The elephants are waiting to hear from you.";
  }
  const { going_well: well, watch_it: watch, stuck } = counts;

  if (stuck > 0 && well > 0) {
    return stuck === 1
      ? "Most things are moving gently, and one programme is having a heavy week. It could use your warmth."
      : `Most things are moving gently, and ${stuck} programmes are having a heavy week. They could use your warmth.`;
  }
  if (stuck > 0) {
    return stuck === 1
      ? "One programme is carrying something heavy this week. A little of your time would mean a lot."
      : `A few programmes are carrying something heavy this week. A little of your time would mean a lot.`;
  }
  if (watch > 0) {
    // Say the number past two - "a couple" for five reads as carelessness.
    if (watch === 1) {
      return "Things are in good shape. Just one programme would love a watchful eye.";
    }
    if (watch === 2) {
      return "Things are in good shape. A couple of programmes would love a watchful eye.";
    }
    return `Things are in good shape. ${watch} programmes would love a watchful eye.`;
  }
  if (well === freshCount) {
    return "Everything is humming beautifully this week. Take a breath and enjoy it.";
  }
  return "A quiet, gentle week across the portfolio. All is well.";
}

export function actionKey(
  prefix: "topic" | "signal" | "file",
  programmeId: string,
  text: string
): string {
  const norm = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${prefix}::${programmeId}::${norm}`;
}

/**
 * ISO-8601 week number. THE single definition of "which week is this" for the
 * whole app - the sidebar footer, the stored WeekNumber, the row title, the
 * trend chart's W-labels and the same-week upsert all have to agree, or one
 * real week ends up split across two rows (and two dots on the trend).
 */
export function isoWeek(date: Date = new Date()): number {
  const d = thursdayOf(date);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * The ISO week-YEAR that goes with `isoWeek` - not always the calendar year
 * (1 Jan can fall in the last week of the previous one). Needed because a week
 * number alone repeats annually: without pairing the two, next year's week 31
 * would be treated as the same week as this year's.
 */
export function isoWeekYear(date: Date = new Date()): number {
  return thursdayOf(date).getUTCFullYear();
}

/**
 * The Thursday of the given date's ISO week. ISO defines a week's year by the
 * year its Thursday falls in, so both helpers above pivot on it.
 */
function thursdayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  return d;
}

// ── Week identity ────────────────────────────────────────────
// A checkpoint is addressed by its ISO week, e.g. "2026-W28". These turn that
// pair into something a person can read ("6 - 12 Jul 2026") and back again.

/** The Monday (UTC) that opens the given ISO week. */
export function isoWeekStart(year: number, week: number): Date {
  // 4 Jan is always in ISO week 1, so week 1's Monday is found from it.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const isoDay = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - (isoDay - 1));
  const start = new Date(firstMonday);
  start.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
  return start;
}

/** `2026-W28` - the canonical, sortable, URL-safe form of a week. */
export function weekKey(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Parses `2026-W28`. Returns null for anything malformed or out of range. */
export function parseWeekKey(raw: string | undefined | null): { year: number; week: number } | null {
  if (!raw) return null;
  const m = /^(\d{4})-W(\d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (year < 2000 || year > 2999 || week < 1 || week > 53) return null;
  return { year, week };
}

/**
 * "6 - 12 Jul 2026", collapsing the parts the two ends share: same month shows
 * the month once, a month boundary shows both, a year boundary shows both years.
 */
export function weekRangeLabel(year: number, week: number): string {
  const start = isoWeekStart(year, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  const day = (d: Date) => d.getUTCDate();
  const mon = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const yr = (d: Date) => d.getUTCFullYear();

  if (yr(start) !== yr(end)) {
    return `${day(start)} ${mon(start)} ${yr(start)} - ${day(end)} ${mon(end)} ${yr(end)}`;
  }
  if (mon(start) !== mon(end)) {
    return `${day(start)} ${mon(start)} - ${day(end)} ${mon(end)} ${yr(end)}`;
  }
  return `${day(start)} - ${day(end)} ${mon(end)} ${yr(end)}`;
}

export function shortDate(date: Date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export type Freshness = "fresh" | "stale" | "missing";

export function freshnessOf(
  submittedAt: string | undefined,
  now: Date = new Date(),
  staleDays = 7
): Freshness {
  if (!submittedAt) return "missing";
  const then = new Date(submittedAt).getTime();
  const ageDays = (now.getTime() - then) / 86400000;
  return ageDays > staleDays ? "stale" : "fresh";
}
