import type { Vibe } from "./types";

export const VIBE_COLOR: Record<Vibe, string> = {
  going_well: "#3BA46A",
  watch_it: "#E8A020",
  stuck: "#D6473F",
  quiet_week: "#3E8FCF"
};

const VALID_VIBES: readonly Vibe[] = [
  "going_well",
  "watch_it",
  "stuck",
  "quiet_week"
] as const;

export function safeVibe(v: unknown): Vibe {
  return typeof v === "string" && (VALID_VIBES as readonly string[]).includes(v)
    ? (v as Vibe)
    : "quiet_week";
}

export const VIBE_TONE: Record<Vibe, { bg: string; text: string }> = {
  going_well: { bg: "#E1F0E7", text: "#2F6A4A" },
  watch_it: { bg: "#F8E7CC", text: "#7A4A0E" },
  stuck: { bg: "#F2D2CC", text: "#7E1F14" },
  quiet_week: { bg: "#DEE7F3", text: "#2F4767" }
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
 * Written to soothe, never to alarm — Sreema reads this first.
 */
export function emotionalOneLiner(
  counts: Record<Vibe, number>,
  freshCount: number
): string {
  if (freshCount === 0) {
    return "The week is still settling in. The elephants are waiting to hear from everyone.";
  }
  const { going_well: well, watch_it: watch, stuck, quiet_week: quiet } = counts;

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
    return watch === 1
      ? "Things are in good shape. Just one programme would love a watchful eye."
      : `Things are in good shape. A couple of programmes would love a watchful eye.`;
  }
  if (well > 0 && quiet > 0) {
    return "Everything is calm and moving nicely. Nothing is asking for worry today.";
  }
  if (well === freshCount) {
    return "Everything is humming beautifully this week. Take a breath and enjoy it.";
  }
  return "A quiet, gentle week across the portfolio. All is well.";
}

export function actionKey(
  prefix: "topic" | "signal",
  programmeId: string,
  text: string
): string {
  const norm = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${prefix}::${programmeId}::${norm}`;
}

export function isoWeek(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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
