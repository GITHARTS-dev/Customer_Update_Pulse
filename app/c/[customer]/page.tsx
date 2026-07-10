import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Sidebar } from "@/components/Sidebar";
import { SidebarData } from "@/components/SidebarData";
import { MoodHero } from "@/components/MoodHero";
import { KpiStats } from "@/components/KpiStats";
import { VibeBoard, type BoardEntry } from "@/components/VibeBoard";
import { AttentionBand } from "@/components/AttentionBand";
import { KpiSkeleton, HeroBoardSkeleton, AttentionSkeleton } from "@/components/Skeletons";
import { getCustomer, type Customer } from "@/lib/customers";
import {
  actionKey,
  emotionalOneLiner,
  freshnessOf,
  greeting,
  safeVibe
} from "@/lib/helpers";
import { readAllSubmissions } from "@/lib/store";
import { readCeoLog } from "@/lib/ceo-store";
import { resolveProgrammes } from "@/lib/programme-store";
import type { OpenTopic, Vibe } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ customer: string }>;
}

interface AttentionItem {
  programmeId: string;
  topic: OpenTopic;
}

/**
 * One derivation of everything a customer's dashboard shows, cached per request
 * (keyed by the customer) so the KPI tiles, hero+board, and attention rail —
 * three independent Suspense children — share ONE SharePoint read.
 */
const loadDashboard = cache(async (customer: Customer) => {
  const [submissionsByProgramme, ceoLog, programmes] = await Promise.all([
    readAllSubmissions(customer),
    readCeoLog(customer),
    resolveProgrammes(customer)
  ]);

  const total = programmes.length;
  const vibeCounts: Record<Vibe, number> = {
    going_well: 0,
    watch_it: 0,
    stuck: 0,
    quiet_week: 0
  };
  let stale = 0;
  let missing = 0;
  let freshCount = 0;

  for (const p of programmes) {
    const s = submissionsByProgramme[p.id];
    const f = freshnessOf(s?.submittedAt);
    if (f === "fresh" && s) {
      freshCount += 1;
      vibeCounts[safeVibe(s.vibe)] += 1;
    } else if (f === "stale") {
      stale += 1;
    } else {
      missing += 1;
    }
  }

  const onTrack = vibeCounts.going_well;
  const watching = vibeCounts.watch_it;
  const stuckCount = vibeCounts.stuck;

  const latestVibeCounts: Record<Vibe, number> = {
    going_well: 0,
    watch_it: 0,
    stuck: 0,
    quiet_week: 0
  };
  let latestNotYetIn = 0;
  for (const p of programmes) {
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

  const attentionItems: AttentionItem[] = programmes.flatMap((p) => {
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
      hint: stale + missing === 0 ? "everyone in" : `${stale} stale · ${missing} missing`,
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
      hint:
        [
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

  const boardEntries: BoardEntry[] = programmes.map((p) => {
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

  return {
    stats,
    headline,
    supporting,
    overall,
    boardEntries,
    attentionItems,
    ceoLog,
    programmes,
    freshCount,
    total
  };
});

export default async function PulsePage({ params }: PageProps) {
  const { customer: cid } = await params;
  const customer = getCustomer(cid);
  if (!customer) notFound();

  if (customer.comingSoon) {
    return <ComingSoon customer={customer} />;
  }

  const who = customer.shortName ?? customer.name;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Suspense fallback={<Sidebar activeCustomerId={customer.id} />}>
        <SidebarData customer={customer} />
      </Suspense>
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-6">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl text-ink-900 leading-tight">
              {greeting()}, Sreema.
            </h1>
            <svg className="mt-1.5 h-2 w-36" viewBox="0 0 140 8" fill="none" aria-hidden="true">
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
              Here's how {who}'s programmes are feeling this week.
            </p>
          </div>
          <div className="w-full lg:w-[480px] lg:shrink-0">
            <Suspense fallback={<KpiSkeleton />}>
              <KpiSection customer={customer} />
            </Suspense>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-3 flex flex-col gap-4">
            <Suspense fallback={<HeroBoardSkeleton />}>
              <HeroAndBoard customer={customer} />
            </Suspense>
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Suspense fallback={<AttentionSkeleton />}>
              <AttentionSection customer={customer} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}

async function KpiSection({ customer }: { customer: Customer }) {
  const { stats } = await loadDashboard(customer);
  return <KpiStats stats={stats} />;
}

async function HeroAndBoard({ customer }: { customer: Customer }) {
  const { headline, supporting, overall, boardEntries, freshCount, total } =
    await loadDashboard(customer);
  return (
    <>
      <MoodHero headline={headline} supporting={supporting} vibe={overall} />
      <section className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-y-1 mb-2.5">
          <h2 className="font-serif text-xl text-ink-900">Weekly Programme Health</h2>
          <span className="text-[10px] text-ink-400">
            {freshCount} checked in
            {total - freshCount > 0 && ` · ${total - freshCount} awaiting`}
          </span>
        </div>
        <VibeBoard entries={boardEntries} customerId={customer.id} />
      </section>
    </>
  );
}

async function AttentionSection({ customer }: { customer: Customer }) {
  const { attentionItems, ceoLog, programmes } = await loadDashboard(customer);
  return (
    <AttentionBand
      items={attentionItems}
      ceoLog={ceoLog}
      programmes={programmes}
      customerId={customer.id}
    />
  );
}

function ComingSoon({ customer }: { customer: Customer }) {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar activeCustomerId={customer.id} />
      <main className="flex-1 flex items-center justify-center px-4 py-16 min-w-0">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <Image
              src={customer.logo}
              alt={customer.name}
              width={customer.logoWidth}
              height={customer.logoHeight}
              className="h-16 w-auto max-h-16 max-w-[240px] object-contain opacity-90"
            />
          </div>
          <span className="inline-block text-[10px] uppercase tracking-[0.2em] text-coral font-semibold mb-2">
            Coming soon
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl text-ink-900">{customer.name}</h1>
          <p className="mt-2 text-sm text-ink-500">
            This customer's programmes and check-ins aren't set up yet. Once they're
            live, {customer.shortName ?? customer.name}'s pulse will appear right here.
          </p>
        </div>
      </main>
    </div>
  );
}
