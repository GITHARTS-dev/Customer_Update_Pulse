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
  emotionalOneLiner,
  freshnessOf,
  greeting,
  isoWeek,
  isoWeekYear,
  parseWeekKey,
  safeVibe,
  weekKey,
  weekRangeLabel,
  type Freshness
} from "@/lib/helpers";
import { readAllSubmissions } from "@/lib/store";
import { readCeoLog } from "@/lib/ceo-store";
import { readPortfolioOverride } from "@/lib/portfolio-store";
import { readAvailableWeeks, readSubmissionsForWeek } from "@/lib/snapshot-store";
import { resolveProgrammes } from "@/lib/programme-store";
import { CheckpointPicker } from "@/components/CheckpointPicker";
import { PastWeekBanner } from "@/components/PastWeekBanner";
import { EditingBlockedWhileMounted } from "@/components/EditModeProvider";
import type { OpenTopic, PulseSubmission, Vibe } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ customer: string }>;
  /** `?week=2026-W28` renders that week's checkpoint instead of the live view. */
  searchParams: Promise<{ week?: string }>;
}

/** The week a page is showing: null while live, otherwise the checkpoint. */
interface ViewWeek {
  year: number;
  week: number;
  key: string;
  range: string;
}

interface AttentionItem {
  programmeId: string;
  topic: OpenTopic;
  /** From a check-in older than a week - still open, just not raised again. */
  stale: boolean;
}

/**
 * One derivation of everything a customer's dashboard shows, cached per request
 * (keyed by the customer AND the week being viewed) so the KPI tiles, hero+board
 * and attention rail - three independent Suspense children - share ONE
 * SharePoint read.
 *
 * `viewWeek` is null for the live dashboard and a checkpoint otherwise. In
 * checkpoint mode the submissions come from that one week and every row in it
 * counts as fresh: it WAS current then, so grading it against today's clock
 * would paint an entire past week as stale.
 */
const loadDashboard = cache(async (customer: Customer, viewWeek: ViewWeek | null) => {
  const [submissionsByProgramme, ceoLog, programmes, portfolio] = await Promise.all([
    viewWeek
      ? readSubmissionsForWeek(customer, viewWeek.year, viewWeek.week)
      : readAllSubmissions(customer),
    readCeoLog(customer),
    resolveProgrammes(customer),
    readPortfolioOverride(customer)
  ]);

  const historical = viewWeek !== null;
  /** In a checkpoint, "was there a row that week" replaces the 7-day clock. */
  const freshnessFor = (s: PulseSubmission | undefined): Freshness =>
    historical ? (s ? "fresh" : "missing") : freshnessOf(s?.submittedAt);

  const total = programmes.length;
  const vibeCounts: Record<Vibe, number> = {
    going_well: 0,
    watch_it: 0,
    stuck: 0
  };
  let stale = 0;
  let missing = 0;
  let freshCount = 0;

  for (const p of programmes) {
    const s = submissionsByProgramme[p.id];
    const f = freshnessFor(s);
    if (f === "fresh" && s) {
      freshCount += 1;
      vibeCounts[safeVibe(s.vibe)] += 1;
    } else if (f === "stale") {
      stale += 1;
    } else {
      missing += 1;
    }
  }

  const watching = vibeCounts.watch_it;
  const stuckCount = vibeCounts.stuck;

  // "On track" mirrors the board: only this week's fresh check-ins count, so
  // the tile's number always matches how many cards actually sit on each
  // emotion shelf. A stale or missing programme is "not in" here, same as
  // everywhere else on the page - never counted toward any vibe.
  const portfolioOnTrack = vibeCounts.going_well;
  const portfolioWatching = watching;
  const portfolioStuck = stuckCount;
  const notYetIn = stale + missing;

  // With nothing fresh in, there is no mood to report. Falling through to
  // "going_well" put the beaming elephant next to "the week is still settling
  // in", so an empty week reads as the neutral middle instead.
  const overall: Vibe =
    freshCount === 0
      ? "watch_it"
      : stuckCount > 0
        ? "stuck"
        : watching > 0
          ? "watch_it"
          : "going_well";

  // Both lines are computed from the week's vibe counts, then handed to the
  // lead's override if they've published one. The computed pair is kept
  // alongside so clearing an override falls back to it instead of a blank hero.
  const computedHeadline = emotionalOneLiner(vibeCounts, freshCount);
  const wording = historical ? "that week" : "this week";
  const computedSupporting =
    stale + missing === 0
      ? `All ${total} programmes checked in ${wording}.`
      : historical
        ? `${freshCount} of ${total} programmes checked in that week.`
        : `${freshCount} of ${total} programmes checked in this week. ${stale} stale, ${missing} not yet in.`;

  // An override only stands for the week it was written. It sits under "This
  // week's pulse" and `supporting` is a count sentence, so a stale override
  // would state a flatly false number next to a KPI tile contradicting it.
  // A checkpoint never takes it: only the current week's override was ever
  // written about the numbers now on screen.
  const now = new Date();
  const overrideAt = portfolio.edited?.at ? new Date(portfolio.edited.at) : null;
  const overrideWeek =
    overrideAt && !isNaN(overrideAt.getTime())
      ? weekKey(isoWeekYear(overrideAt), isoWeek(overrideAt))
      : null;
  const thisWeekKey = weekKey(isoWeekYear(now), isoWeek(now));
  const overrideLive = !historical && overrideWeek === thisWeekKey;
  const headline = (overrideLive ? portfolio.headline : undefined) ?? computedHeadline;
  const supporting = (overrideLive ? portfolio.supporting : undefined) ?? computedSupporting;

  /**
   * Open decisions from every check-in on record, fresh OR stale.
   *
   * This used to be fresh-only, which meant that on day 8 a programme's
   * unresolved decisions silently disappeared from the only screen that shows
   * them and from the KPI count - losing exactly the decisions that had been
   * waiting longest. A week passing doesn't close a decision, so stale ones are
   * carried over and marked rather than dropped.
   */
  const attentionItems: AttentionItem[] = programmes.flatMap((p) => {
    const s = submissionsByProgramme[p.id];
    if (!s) return [];
    const f = freshnessFor(s);
    if (f === "missing") return [];
    return s.openTopics.map((t) => ({
      programmeId: p.id,
      topic: t,
      stale: f !== "fresh"
    }));
  });

  const openAttentionCount = attentionItems.length;
  const carriedOverCount = attentionItems.filter((it) => it.stale).length;

  const stats = [
    {
      label: historical ? "Checked in" : "Updated this week",
      value: `${freshCount}/${total}`,
      hint: historical
        ? `${missing} did not`
        : stale + missing === 0
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
      hint:
        [
          portfolioWatching > 0 && `${portfolioWatching} watch`,
          portfolioStuck > 0 && `${portfolioStuck} stuck`,
          notYetIn > 0 && `${notYetIn} not in`
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
          ? "nothing waiting"
          : carriedOverCount > 0
            ? `${carriedOverCount} carried over`
            : "raised by the leads",
      tone: openAttentionCount === 0 ? ("warm" as const) : ("watch" as const)
    }
  ];

  const boardEntries: BoardEntry[] = programmes.map((p) => {
    const s = submissionsByProgramme[p.id];
    const viewedAt = ceoLog.views[p.id];
    const f = freshnessFor(s);
    return {
      programme: p,
      submission: s,
      freshness: f,
      // "New since you last looked" is a statement about now, so it is never
      // claimed inside a checkpoint.
      unseen: Boolean(
        !historical &&
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
    computedHeadline,
    computedSupporting,
    overall,
    boardEntries,
    attentionItems,
    // Any programme with a check-in on record. Safe now that `attentionItems`
    // carries stale points too: what the band shows for a programme is its full
    // stored set, so an edit starts from the right baseline and cannot wipe
    // points that were merely off-screen. Empty in a checkpoint, which is
    // read-only.
    editableProgrammeIds: historical
      ? []
      : programmes.filter((p) => submissionsByProgramme[p.id]).map((p) => p.id),
    ceoLog,
    programmes,
    freshCount,
    total
  };
});

export default async function PulsePage({ params, searchParams }: PageProps) {
  const { customer: cid } = await params;
  const customer = getCustomer(cid);
  if (!customer) notFound();

  if (customer.comingSoon) {
    return <ComingSoon customer={customer} />;
  }

  const { week: weekParam } = await searchParams;
  const now = new Date();
  const currentKey = weekKey(isoWeekYear(now), isoWeek(now));
  const parsed = parseWeekKey(weekParam);
  // Only treat it as a checkpoint if it parses AND isn't just the current week
  // spelled out - `?week=<this week>` should behave exactly like no param.
  const viewWeek: ViewWeek | null =
    parsed && weekKey(parsed.year, parsed.week) !== currentKey
      ? {
          ...parsed,
          key: weekKey(parsed.year, parsed.week),
          range: weekRangeLabel(parsed.year, parsed.week)
        }
      : null;

  const who = customer.shortName ?? customer.name;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Suspense fallback={<Sidebar activeCustomerId={customer.id} />}>
        <SidebarData customer={customer} />
      </Suspense>
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0">
        {/* A checkpoint is a record, never a draft - editing is switched off
            for as long as one is on screen. */}
        {viewWeek && <EditingBlockedWhileMounted />}

        {viewWeek && (
          <Suspense fallback={null}>
            <PastWeekSection customer={customer} viewWeek={viewWeek} />
          </Suspense>
        )}

        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-6">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl text-ink-900 leading-tight">
              {viewWeek ? `Week ${viewWeek.week}, looking back.` : `${greeting()}, Sreema.`}
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
              {viewWeek
                ? `How ${who}'s programmes felt that week, exactly as it was captured.`
                : `Here's how ${who}'s programmes are feeling this week.`}
            </p>
          </div>
          <div className="w-full lg:w-[480px] lg:shrink-0 flex flex-col items-end gap-2">
            {/* The way into earlier weeks. One quiet control until asked for,
                so the live dashboard stays about this week. The row keeps its
                height whether or not the control resolves, so the KPI tiles
                below never jump when it streams in. */}
            <div className="h-[30px] flex items-center">
              <Suspense fallback={null}>
                <CheckpointSection
                  customer={customer}
                  activeKey={viewWeek?.key ?? null}
                  currentKey={currentKey}
                />
              </Suspense>
            </div>
            <div className="w-full">
              <Suspense fallback={<KpiSkeleton />}>
                <KpiSection customer={customer} viewWeek={viewWeek} />
              </Suspense>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-3 flex flex-col gap-4">
            <Suspense fallback={<HeroBoardSkeleton />}>
              <HeroAndBoard customer={customer} viewWeek={viewWeek} />
            </Suspense>
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Suspense fallback={<AttentionSkeleton />}>
              <AttentionSection customer={customer} viewWeek={viewWeek} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}

/** The checkpoint control. Its own boundary so the header paints without it. */
async function CheckpointSection({
  customer,
  activeKey,
  currentKey
}: {
  customer: Customer;
  activeKey: string | null;
  currentKey: string;
}) {
  const weeks = await readAvailableWeeks(customer);
  // Nothing to look back on yet - don't offer a control that opens an empty list.
  if (weeks.filter((w) => w.key !== currentKey).length === 0 && !activeKey) return null;
  return <CheckpointPicker weeks={weeks} activeKey={activeKey} currentKey={currentKey} />;
}

/** The "you're viewing the past" banner, with that week's real counts. */
async function PastWeekSection({
  customer,
  viewWeek
}: {
  customer: Customer;
  viewWeek: ViewWeek;
}) {
  const { freshCount, total } = await loadDashboard(customer, viewWeek);
  return (
    <PastWeekBanner
      week={viewWeek.week}
      range={viewWeek.range}
      backHref={`/c/${customer.id}`}
      checkedIn={freshCount}
      total={total}
    />
  );
}

async function KpiSection({
  customer,
  viewWeek
}: {
  customer: Customer;
  viewWeek: ViewWeek | null;
}) {
  const { stats } = await loadDashboard(customer, viewWeek);
  return <KpiStats stats={stats} />;
}


async function HeroAndBoard({
  customer,
  viewWeek
}: {
  customer: Customer;
  viewWeek: ViewWeek | null;
}) {
  const {
    headline,
    supporting,
    computedHeadline,
    computedSupporting,
    overall,
    boardEntries,
    freshCount,
    total
  } = await loadDashboard(customer, viewWeek);
  return (
    <>
      <MoodHero
        headline={headline}
        supporting={supporting}
        computedHeadline={computedHeadline}
        computedSupporting={computedSupporting}
        vibe={overall}
        eyebrow={viewWeek ? `Week ${viewWeek.week} · ${viewWeek.range}` : undefined}
      />
      <section className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-y-1 mb-2.5">
          <h2 className="font-serif text-xl text-ink-900">
            {viewWeek ? `Programme Health · Week ${viewWeek.week}` : "Weekly Programme Health"}
          </h2>
          <span className="text-[10px] text-ink-400">
            {freshCount} checked in
            {total - freshCount > 0 &&
              ` · ${total - freshCount} ${viewWeek ? "did not" : "awaiting"}`}
          </span>
        </div>
        <VibeBoard
          entries={boardEntries}
          customerId={customer.id}
          weekParam={viewWeek?.key}
        />
      </section>
    </>
  );
}

async function AttentionSection({
  customer,
  viewWeek
}: {
  customer: Customer;
  viewWeek: ViewWeek | null;
}) {
  const { attentionItems, programmes, editableProgrammeIds } = await loadDashboard(
    customer,
    viewWeek
  );
  return (
    <AttentionBand
      items={attentionItems}
      programmes={programmes}
      customerId={customer.id}
      editableProgrammeIds={editableProgrammeIds}
      weekParam={viewWeek?.key}
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
