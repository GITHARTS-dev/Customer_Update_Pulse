import { Sidebar } from "@/components/Sidebar";
import { MoodHero } from "@/components/MoodHero";
import { KpiStats } from "@/components/KpiStats";
import { VibeBoard, type BoardEntry } from "@/components/VibeBoard";
import { AttentionBand } from "@/components/AttentionBand";
import { TrendCard, type TrendPoint } from "@/components/TrendCard";
import { PROGRAMMES } from "@/lib/programmes";
import {
  actionKey,
  emotionalOneLiner,
  freshnessOf,
  greeting,
  safeVibe,
  VIBE_COLOR
} from "@/lib/helpers";
import { readAllSubmissions } from "@/lib/store";
import { readCeoLog } from "@/lib/ceo-store";
import { readPortfolioTrend } from "@/lib/history-store";
import type { PulseSubmission, Vibe } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PulsePage() {
  const [submissionsByProgramme, ceoLog, portfolioTrend] = await Promise.all([
    readAllSubmissions(),
    readCeoLog(),
    readPortfolioTrend()
  ]);

  const portfolioPoints: TrendPoint[] = portfolioTrend.map((w) => {
    const pct = Math.round((w.onTrack / w.totalProgrammes) * 100);
    const color =
      pct >= 60
        ? VIBE_COLOR.going_well
        : pct >= 30
          ? VIBE_COLOR.watch_it
          : VIBE_COLOR.stuck;
    const parts = [
      `${w.onTrack} on track of ${w.totalProgrammes}`,
      w.watching > 0 && `${w.watching} watch`,
      w.stuck > 0 && `${w.stuck} stuck`,
      w.notYetIn > 0 && `${w.notYetIn} not yet in`
    ].filter(Boolean);
    return {
      label: `W${w.weekNumber}`,
      value: pct,
      color,
      detail: parts.join(" · ")
    };
  });

  const fresh: PulseSubmission[] = [];
  let stale = 0;
  let missing = 0;
  const vibeCounts: Record<Vibe, number> = {
    going_well: 0,
    watch_it: 0,
    stuck: 0,
    quiet_week: 0
  };

  for (const p of PROGRAMMES) {
    const s = submissionsByProgramme[p.id];
    const f = freshnessOf(s?.submittedAt);
    if (f === "fresh" && s) {
      fresh.push(s);
      vibeCounts[safeVibe(s.vibe)] += 1;
    } else if (f === "stale") {
      stale += 1;
    } else {
      missing += 1;
    }
  }

  const total = PROGRAMMES.length;
  const freshCount = fresh.length;
  const onTrack = vibeCounts.going_well;
  const watching = vibeCounts.watch_it;
  const stuckCount = vibeCounts.stuck;

  // Latest-known state across all 10 programmes (matches trend semantics).
  const latestVibeCounts: Record<Vibe, number> = {
    going_well: 0,
    watch_it: 0,
    stuck: 0,
    quiet_week: 0
  };
  let latestNotYetIn = 0;
  for (const p of PROGRAMMES) {
    const s = submissionsByProgramme[p.id];
    if (s) latestVibeCounts[safeVibe(s.vibe)] += 1;
    else latestNotYetIn += 1;
  }
  const portfolioOnTrack = latestVibeCounts.going_well;
  const portfolioWatching = latestVibeCounts.watch_it;
  const portfolioStuck = latestVibeCounts.stuck;

  const overall: Vibe =
    stuckCount > 0
      ? "stuck"
      : watching > 0
        ? "watch_it"
        : onTrack >= Math.max(1, Math.ceil(freshCount / 2))
          ? "going_well"
          : "quiet_week";

  const headline = emotionalOneLiner(vibeCounts, freshCount);

  const supporting =
    stale + missing === 0
      ? `All ${total} leads checked in this week.`
      : `${freshCount} of ${total} leads checked in this week. ${stale} stale, ${missing} not yet in.`;

  const attentionItems = PROGRAMMES.flatMap((p) => {
    const s = submissionsByProgramme[p.id];
    if (!s || freshnessOf(s.submittedAt) !== "fresh") return [];
    return s.openTopics.map((t) => ({ programmeId: p.id, topic: t }));
  });

  const openAttentionCount = attentionItems.filter((it) => {
    const key = actionKey("topic", it.programmeId, it.topic.title);
    return !ceoLog.actions[key];
  }).length;
  const handledCount = attentionItems.length - openAttentionCount;

  const stats = [
    {
      label: "Updated this week",
      value: `${freshCount}/${total}`,
      hint:
        stale + missing === 0
          ? "everyone in"
          : `${stale} stale · ${missing} missing`,
      tone:
        freshCount === total
          ? ("warm" as const)
          : freshCount >= total - 1
            ? ("neutral" as const)
            : ("watch" as const)
    },
    {
      label: "On track",
      value: `${portfolioOnTrack}/${total}`,
      hint: [
        portfolioWatching > 0 && `${portfolioWatching} watch`,
        portfolioStuck > 0 && `${portfolioStuck} stuck`,
        latestNotYetIn > 0 && `${latestNotYetIn} not in`
      ]
        .filter(Boolean)
        .join(" · ") || "all good",
      tone:
        portfolioOnTrack === total
          ? ("warm" as const)
          : portfolioStuck > 0
            ? ("watch" as const)
            : ("neutral" as const)
    },
    {
      label: "Open decisions",
      value: String(openAttentionCount),
      hint:
        openAttentionCount === 0
          ? handledCount > 0
            ? `${handledCount} handled`
            : "nothing waiting"
          : handledCount > 0
            ? `${handledCount} handled`
            : "see needs you",
      tone: openAttentionCount === 0 ? ("warm" as const) : ("watch" as const)
    }
  ];

  const boardEntries: BoardEntry[] = PROGRAMMES.map((p) => {
    const s = submissionsByProgramme[p.id];
    const viewedAt = ceoLog.views[p.id];
    const f = freshnessOf(s?.submittedAt);
    return {
      programme: p,
      submission: s,
      freshness: f,
      unseen: Boolean(
        s &&
          f === "fresh" &&
          (!viewedAt || new Date(viewedAt) < new Date(s.submittedAt))
      )
    };
  });

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar activePath="/" submissionsByProgramme={submissionsByProgramme} />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-6">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl text-ink-900 leading-tight">
              {greeting()}, Sreema.
            </h1>
            <svg
              className="mt-1.5 h-2 w-36"
              viewBox="0 0 140 8"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 5 Q 20 1 38 4 T 74 4 T 110 4 T 138 3"
                stroke="url(#greeting-flourish)"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.55"
              />
              <defs>
                <linearGradient
                  id="greeting-flourish"
                  x1="0"
                  y1="0"
                  x2="140"
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#D6473F" />
                  <stop offset="0.3" stopColor="#E8A020" />
                  <stop offset="0.55" stopColor="#3BA46A" />
                  <stop offset="0.78" stopColor="#3E8FCF" />
                  <stop offset="1" stopColor="#6C47E8" />
                </linearGradient>
              </defs>
            </svg>
            <p className="mt-1 text-sm text-ink-500">
              Here's how the {total} programmes are feeling this week.
            </p>
          </div>
          <div className="w-full lg:w-[480px] lg:shrink-0">
            <KpiStats stats={stats} />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          {/* Left: hero + the mood board */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <MoodHero headline={headline} supporting={supporting} vibe={overall} />

            <section className="flex flex-col">
              <div className="flex flex-wrap items-baseline justify-between gap-y-1 mb-2.5">
                <h2 className="font-serif text-xl text-ink-900">
                  Programmes, by feeling
                </h2>
                <span className="text-[10px] text-ink-400">
                  {freshCount} checked in
                  {total - freshCount > 0 && ` · ${total - freshCount} awaiting`}
                </span>
              </div>
              <VibeBoard entries={boardEntries} />
            </section>
          </div>

          {/* Right rail: the trend, then what needs her */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <TrendCard
              title="On-track trend"
              points={portfolioPoints}
              suffix="%"
              emptyMessage="No check-ins recorded yet."
              helpText="Share of submitted programmes rated 'going well' each week."
            />
            <AttentionBand items={attentionItems} ceoLog={ceoLog} />
          </div>
        </div>
      </main>
    </div>
  );
}
