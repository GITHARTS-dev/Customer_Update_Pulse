import { notFound } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { BabyElephant } from "@/components/BabyElephant";
import { SunRays } from "@/components/SunRays";
import { ActionButtons } from "@/components/ActionButtons";
import { ProgrammeViewTracker } from "@/components/ProgrammeViewTracker";
import { PROGRAMMES, PROGRAMMES_BY_ID } from "@/lib/programmes";
import {
  actionKey,
  freshnessOf,
  parseBold,
  relativeTime,
  safeVibe,
  VIBE_COLOR,
  VIBE_TONE
} from "@/lib/helpers";
import { readAllSubmissions } from "@/lib/store";
import { readCeoLog } from "@/lib/ceo-store";
import { readProgrammeHistory } from "@/lib/history-store";
import { TrendCard, type TrendPoint } from "@/components/TrendCard";
import { VIBE_LABEL, type SignalKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return PROGRAMMES.map((p) => ({ id: p.id }));
}

interface PageProps {
  params: Promise<{ id: string }>;
}

const SIGNAL_STYLE: Record<SignalKind, { bg: string; dot: string; label: string }> = {
  win: { bg: "#E1F0E7", dot: "#3BA46A", label: "Won" },
  watch: { bg: "#F8E7CC", dot: "#E8A020", label: "Watching" },
  ask: { bg: "#F2D9D3", dot: "#D6473F", label: "Ask" }
};

export default async function ProgrammePage({ params }: PageProps) {
  const { id } = await params;
  const programme = PROGRAMMES_BY_ID[id];
  if (!programme) return notFound();
  const [submissionsByProgramme, ceoLog, programmeHistory] = await Promise.all([
    readAllSubmissions(),
    readCeoLog(),
    readProgrammeHistory(id)
  ]);

  const trendPoints: TrendPoint[] = programmeHistory
    .filter((s) => s.total > 0)
    .map((s) => ({
      label: `W${s.weekNumber}`,
      value: s.completionPct,
      color: VIBE_COLOR[safeVibe(s.vibe)],
      detail: `${s.done}/${s.total} tickets · ${VIBE_LABEL[safeVibe(s.vibe)]}`
    }));
  const submission = submissionsByProgramme[programme.id];
  const priorViewedAt = ceoLog.views[programme.id];

  if (!submission) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen">
        <ProgrammeViewTracker programmeId={programme.id} />
        <Sidebar
          activeProgrammeId={programme.id}
          activePath={`/programme/${programme.id}`}
          submissionsByProgramme={submissionsByProgramme}
        />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full lg:max-w-[760px] min-w-0">
          <Link
            href="/"
            className="text-xs text-ink-500 hover:text-coral inline-flex items-center gap-1 w-fit"
          >
            <span aria-hidden>←</span> Back to pulse
          </Link>
          <section className="card px-6 sm:px-10 py-8 sm:py-12 mt-3 text-center">
            <div className="flex justify-center mb-4 opacity-50">
              <BabyElephant vibe="quiet_week" size={120} background={false} />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl text-ink-900">{programme.name}</h1>
            <p className="mt-2 text-sm text-ink-500">
              No update on this one yet.
            </p>
            {programme.subProgrammes && programme.subProgrammes.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {programme.subProgrammes.map((s) => (
                  <span
                    key={s}
                    className="pill text-[10px] bg-sand-100 text-ink-500 border border-sand-200"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  const freshness = freshnessOf(submission.submittedAt);
  const vibe = safeVibe(submission.vibe);
  const tone = VIBE_TONE[vibe];
  const narrativeParts = parseBold(submission.aiNarrative);
  const signals = submission.signals ?? [];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <ProgrammeViewTracker programmeId={programme.id} />
      <Sidebar
        activeProgrammeId={programme.id}
        activePath={`/programme/${programme.id}`}
        submissionsByProgramme={submissionsByProgramme}
      />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="text-xs text-ink-500 hover:text-coral inline-flex items-center gap-1 w-fit"
          >
            <span aria-hidden>←</span> Back to pulse
          </Link>
        </div>

        <section
          className="rounded-card bg-gradient-to-br from-[#191627] via-[#241C46] to-[#3A2A6B] text-cream shadow-hero px-5 sm:px-7 py-5 sm:py-6 relative overflow-hidden"
        >
          <div
            className="absolute -right-12 -top-12 w-72 h-72 rounded-full blur-3xl pointer-events-none"
            style={{ backgroundColor: VIBE_COLOR[vibe], opacity: 0.2 }}
          />
          <SunRays className="w-[1400px] h-[1400px] -top-[700px] -right-[700px]" />
          <div className="relative flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-7 text-center sm:text-left">
            <div
              className="shrink-0"
              style={{ opacity: freshness === "fresh" ? 1 : 0.6 }}
            >
              <BabyElephant vibe={vibe} size={110} animated />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] tracking-[0.18em] uppercase text-cream/55 mb-1">
                Programme
              </p>
              <h1 className="font-serif text-2xl sm:text-3xl leading-tight">{programme.name}</h1>
              <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs text-cream/75">
                <span>Led by {submission.accountable ?? programme.lead}</span>
                <span className="text-cream/30">·</span>
                <span
                  className="pill text-[10px]"
                  style={{ backgroundColor: tone.bg, color: tone.text }}
                >
                  {VIBE_LABEL[vibe]}
                </span>
                {submission.jira.total > 0 && (
                  <>
                    <span className="text-cream/30">·</span>
                    <span>
                      {Math.max(
                        0,
                        Math.min(100, submission.jira.completionPct)
                      )}
                      % complete
                    </span>
                  </>
                )}
                <span className="text-cream/30">·</span>
                <span>
                  Updated {relativeTime(submission.submittedAt)}
                </span>
                {priorViewedAt && new Date(priorViewedAt) >= new Date(submission.submittedAt) && (
                  <>
                    <span className="text-cream/30">·</span>
                    <span className="text-cream/55">
                      You viewed {relativeTime(priorViewedAt)}
                    </span>
                  </>
                )}
                {freshness === "stale" && (
                  <span
                    className="pill text-[10px]"
                    style={{ backgroundColor: "#F8E7CC", color: "#7A4A0E" }}
                  >
                    stale
                  </span>
                )}
              </div>
              {programme.subProgrammes && programme.subProgrammes.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-cream/45 mr-0.5">
                    Includes
                  </span>
                  {programme.subProgrammes.map((s) => (
                    <span
                      key={s}
                      className="pill text-[10px] bg-cream/15 text-cream/85 border border-cream/20"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          {/* Left column: narrative + signals, stacked to their own height */}
          <div className="lg:col-span-3 flex flex-col gap-4">
          <section className="card px-5 sm:px-6 py-5 relative">
            <span className="absolute -top-2.5 left-5 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] bg-cream border border-sand-200 rounded-full text-ink-500">
              {freshness === "fresh" ? "This week's narrative" : "Last narrative"}
            </span>
            <blockquote className="font-serif text-lg sm:text-xl text-ink-900 leading-snug">
              “
              {narrativeParts.map((p, i) =>
                p.bold ? (
                  <strong key={i} className="text-coral font-normal">
                    {p.text}
                  </strong>
                ) : (
                  <span key={i}>{p.text}</span>
                )
              )}
              ”
            </blockquote>
            <p className="mt-3 text-[11px] text-ink-400">
              Written by Claude from {submission.submittedBy}'s check-in and live Jira.
            </p>
          </section>

          <section className="card px-5 sm:px-6 py-5">
            <h3 className="font-serif text-lg text-ink-900 mb-3">Signals this week</h3>
            {signals.length === 0 ? (
              <p className="text-sm text-ink-400">No signals flagged.</p>
            ) : (
              (() => {
                const asks = signals.filter((s) => s.kind === "ask");
                const rest = signals.filter((s) => s.kind !== "ask");
                return (
                  <>
                    {asks.length > 0 && (
                      <div className="mb-3 rounded-xl border border-[#D6473F33] bg-[#D6473F0A] px-3.5 py-3">
                        <p className="text-[9px] uppercase tracking-[0.16em] font-semibold text-[#B03A33] mb-2 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D6473F] animate-pulse" />
                          Waiting on you
                        </p>
                        <ul className="space-y-2">
                          {asks.map((sig, i) => {
                            const key = actionKey("signal", programme.id, sig.text);
                            const state = ceoLog.actions[key];
                            const status = state?.status ?? ("open" as const);
                            const handled = state !== undefined;
                            return (
                              <li key={i} className="flex items-start gap-3">
                                <span
                                  className={`flex-1 text-sm leading-snug ${
                                    handled
                                      ? "text-ink-400 line-through decoration-1"
                                      : "text-ink-900 font-medium"
                                  }`}
                                >
                                  {sig.text}
                                </span>
                                <ActionButtons actionKey={key} initialStatus={status} />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {rest.length > 0 && (
                      <ul className="space-y-2">
                        {rest.map((sig, i) => {
                          const style = SIGNAL_STYLE[sig.kind];
                          return (
                            <li key={i} className="flex items-start gap-3">
                              <span
                                className="mt-0.5 pill text-[9px] py-0.5 px-2 shrink-0"
                                style={{ backgroundColor: style.bg, color: style.dot }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: style.dot }}
                                />
                                {style.label}
                              </span>
                              <span className="flex-1 text-sm leading-snug text-ink-800">
                                {sig.text}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                );
              })()
            )}
            {submission.nextStep && (
              <div className="mt-4 pt-4 border-t border-sand-200">
                <p className="text-[9px] tracking-[0.14em] uppercase text-ink-400 mb-1">
                  Next step
                </p>
                <p className="text-sm text-ink-800">{submission.nextStep}</p>
              </div>
            )}
          </section>
          </div>

          {/* Right column: Jira + trend + people, stacked to their own height */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <section className="card px-5 py-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-serif text-lg text-ink-900">Jira</h3>
                <span className="text-[10px] text-ink-400">{programme.jiraProjectKey}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <JiraStat label="Done" value={submission.jira.done} dot="#3BA46A" />
                <JiraStat label="Doing" value={submission.jira.inProgress} dot="#6C47E8" />
                <JiraStat label="To do" value={submission.jira.todo} dot="#D0CBE2" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-ink-500">
                  <span>Progress</span>
                  <span
                    className="stat-num text-ink-800"
                    title={submission.jira.total === 0 ? "No Jira data yet" : undefined}
                  >
                    {submission.jira.total > 0
                      ? `${Math.max(0, Math.min(100, submission.jira.completionPct))}%`
                      : "—"}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-sand-200 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${
                        submission.jira.total > 0
                          ? Math.max(0, Math.min(100, submission.jira.completionPct))
                          : 0
                      }%`,
                      backgroundColor:
                        submission.jira.total > 0 ? VIBE_COLOR[vibe] : "#D0CBE2"
                    }}
                  />
                </div>
              </div>
              {submission.jira.stalledNotes.length > 0 && (
                <div className="mt-4 pt-3 border-t border-sand-200">
                  <p className="text-[9px] tracking-[0.14em] uppercase text-ink-400 mb-1.5">
                    Stalled
                  </p>
                  <ul className="space-y-0.5">
                    {submission.jira.stalledNotes.map((s, i) => (
                      <li key={i} className="text-[11px] text-ink-700">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <TrendCard
              title="Completion trend"
              points={trendPoints}
              suffix="%"
              emptyMessage="No Jira data recorded yet."
              helpText="Jira completion for this programme, week by week."
            />
            <section className="card px-5 py-5">
            <h3 className="font-serif text-lg text-ink-900 mb-3">Key people</h3>
            {submission.people.length === 0 ? (
              <p className="text-sm text-ink-400">No people flagged.</p>
            ) : (
              <ul className="space-y-2">
                {submission.people.map((p) => {
                  const sig = {
                    warm: { bg: "#E1F0E7", dot: "#3BA46A", label: "warm" },
                    neutral: { bg: "#ECEAF7", dot: "#948FAB", label: "steady" },
                    watch: { bg: "#F8E7CC", dot: "#E8A020", label: "watch" }
                  }[p.signal];
                  return (
                    <li
                      key={p.name}
                      className="px-3 py-2 rounded-lg bg-sand-50 border border-sand-200"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink-900 truncate">
                          {p.name}
                        </span>
                        <span
                          className="pill text-[9px] py-0.5 px-1.5 shrink-0"
                          style={{ backgroundColor: sig.bg, color: sig.dot }}
                        >
                          <span
                            className="w-1 h-1 rounded-full"
                            style={{ backgroundColor: sig.dot }}
                          />
                          {sig.label}
                        </span>
                      </div>
                      {p.note && (
                        <p className="text-[11px] text-ink-500 mt-0.5">{p.note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            </section>
          </div>
        </div>

        {submission.leadFreeText && (
          <section className="px-1">
            <p className="text-[9px] tracking-[0.14em] uppercase text-ink-400 mb-1">
              In {submission.submittedBy}'s words
            </p>
            <p className="font-serif text-base text-ink-700 italic">
              “{submission.leadFreeText}”
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

function JiraStat({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="px-2 py-2.5 rounded-lg bg-sand-50 border border-sand-200">
      <div className="flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />
        <span className="text-[10px] uppercase tracking-wider text-ink-400">{label}</span>
      </div>
      <div className="stat-num text-xl text-ink-900 mt-1">{value}</div>
    </div>
  );
}
