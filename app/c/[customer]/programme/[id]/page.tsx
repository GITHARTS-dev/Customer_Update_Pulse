import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { SidebarData } from "@/components/SidebarData";
import { BabyElephant } from "@/components/BabyElephant";
import { SunRays } from "@/components/SunRays";
import { ActionButtons } from "@/components/ActionButtons";
import { FileViewedButton } from "@/components/FileViewedButton";
import { NoteToLead } from "@/components/NoteToLead";
import { VibeTrajectory } from "@/components/VibeTrajectory";
import { JiraCard } from "@/components/JiraCard";
import { ProgrammeViewTracker } from "@/components/ProgrammeViewTracker";
import { ProgrammeBodySkeleton } from "@/components/Skeletons";
import { getCustomer, type Customer } from "@/lib/customers";
import { resolveProgrammes, byIdOf } from "@/lib/programme-store";
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
import { VIBE_LABEL, type Programme, type SignalKind } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ customer: string; id: string }>;
}

const SIGNAL_STYLE: Record<SignalKind, { bg: string; dot: string; label: string }> = {
  win: { bg: "#E1F0E7", dot: "#3BA46A", label: "Won" },
  watch: { bg: "#F8E7CC", dot: "#E8A020", label: "Watching" },
  ask: { bg: "#F2D9D3", dot: "#D6473F", label: "Ask" }
};

export default async function ProgrammePage({ params }: PageProps) {
  const { customer: cid, id } = await params;
  const customer = getCustomer(cid);
  if (!customer) return notFound();
  const programme = byIdOf(await resolveProgrammes(customer))[id];
  if (!programme) return notFound();

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <ProgrammeViewTracker programmeId={programme.id} />
      <Suspense fallback={<Sidebar activeCustomerId={customer.id} activeProgrammeId={programme.id} />}>
        <SidebarData customer={customer} activeProgrammeId={programme.id} />
      </Suspense>
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/c/${customer.id}`}
            className="text-xs text-ink-500 hover:text-coral inline-flex items-center gap-1 w-fit"
          >
            <span aria-hidden>←</span> Back to pulse
          </Link>
        </div>

        <Suspense fallback={<ProgrammeBodySkeleton programme={programme} />}>
          <ProgrammeBody customer={customer} programme={programme} />
        </Suspense>
      </main>
    </div>
  );
}

async function ProgrammeBody({
  customer,
  programme
}: {
  customer: Customer;
  programme: Programme;
}) {
  const [submissionsByProgramme, ceoLog, history] = await Promise.all([
    readAllSubmissions(customer),
    readCeoLog(customer),
    readProgrammeHistory(customer, programme.id)
  ]);

  const submission = submissionsByProgramme[programme.id];
  const priorViewedAt = ceoLog.views[programme.id];
  const ceoNote = ceoLog.notes[programme.id];

  if (!submission) {
    return (
      <section className="card px-6 sm:px-10 py-8 sm:py-12 text-center">
        <div className="flex justify-center mb-4 opacity-50">
          <BabyElephant vibe="quiet_week" size={120} background={false} />
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl text-ink-900">{programme.name}</h1>
        <p className="mt-2 text-sm text-ink-500">No update on this one yet.</p>
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
    );
  }

  const freshness = freshnessOf(submission.submittedAt);
  const vibe = safeVibe(submission.vibe);
  const tone = VIBE_TONE[vibe];
  const narrativeParts = parseBold(submission.aiNarrative);
  const signals = submission.signals ?? [];
  const attachments = submission.attachments ?? [];

  return (
    <>
      <section className="rounded-card bg-gradient-to-br from-[#191627] via-[#241C46] to-[#3A2A6B] text-cream shadow-hero px-5 sm:px-7 py-5 sm:py-6 relative overflow-hidden">
        <div
          className="absolute -right-12 -top-12 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: VIBE_COLOR[vibe], opacity: 0.2 }}
        />
        <SunRays className="w-[1400px] h-[1400px] -top-[700px] -right-[700px]" />
        <div className="relative flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-7 text-center sm:text-left">
          <div className="shrink-0" style={{ opacity: freshness === "fresh" ? 1 : 0.6 }}>
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
              <span className="text-cream/30">·</span>
              <span>Updated {relativeTime(submission.submittedAt)}</span>
              {priorViewedAt &&
                new Date(priorViewedAt) >= new Date(submission.submittedAt) && (
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
        {/* Left column: narrative + signals */}
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
              Written by Claude from this week's check-in.
            </p>
          </section>

          <section className="card px-5 sm:px-6 py-5">
            <h3 className="font-serif text-lg text-ink-900 mb-3">Signals this week</h3>
            {signals.length === 0 && attachments.length === 0 ? (
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
            {attachments.length > 0 && (
              <div className={signals.length > 0 ? "mt-4 pt-4 border-t border-sand-200" : ""}>
                <p className="text-[9px] tracking-[0.14em] uppercase text-ink-400 mb-2">
                  Shared by the lead
                </p>
                <ul className="space-y-1.5">
                  {attachments.map((a) => {
                    const fileKey = actionKey("file", programme.id, a.url);
                    const viewed = ceoLog.actions[fileKey] !== undefined;
                    const downloadUrl = `${a.url}${a.url.includes("?") ? "&" : "?"}download=1`;
                    return (
                      <li
                        key={a.url}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sand-50 border border-sand-200"
                      >
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-2 text-sm text-ink-800 min-w-0 flex-1 hover:text-coral"
                          title="View this file"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className="w-3.5 h-3.5 shrink-0 text-ink-400 group-hover:text-coral"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9 1.5Z" />
                            <path d="M9 1.5V5.5H13" />
                          </svg>
                          <span className="truncate group-hover:underline">{a.name}</span>
                        </a>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-coral hover:underline"
                          title="View in SharePoint"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" />
                            <circle cx="8" cy="8" r="2" />
                          </svg>
                          View
                        </a>
                        <a
                          href={downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-coral"
                          title="Download this file"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M8 1.5v9" />
                            <path d="M4.5 7 8 10.5 11.5 7" />
                            <path d="M2.5 13.5h11" />
                          </svg>
                        </a>
                        <FileViewedButton actionKey={fileKey} initialViewed={viewed} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {submission.openTopics.length > 0 && (
            <section className="card px-5 sm:px-6 py-5">
              <h3 className="font-serif text-lg text-ink-900 mb-1">Discussion points</h3>
              <p className="text-[11px] text-ink-400 mb-3">
                Mark each as you handle it — the pulse board reflects the same.
              </p>
              <ul className="space-y-2.5">
                {submission.openTopics.map((topic, i) => {
                  const key = actionKey("topic", programme.id, topic.title);
                  const state = ceoLog.actions[key];
                  const status = state?.status ?? ("open" as const);
                  const handled = state !== undefined;
                  return (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <p
                        className={`flex-1 text-sm leading-snug ${
                          handled ? "text-ink-400 line-through decoration-1" : "text-ink-800"
                        }`}
                      >
                        {topic.title}
                      </p>
                      <ActionButtons actionKey={key} initialStatus={status} />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <NoteToLead programmeId={programme.id} initialText={ceoNote?.text ?? ""} />
        </div>

        {/* Right column: trend, then delivery, then people */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <VibeTrajectory history={history} currentVibe={vibe} />

          {submission.jira.total > 0 && <JiraCard snapshot={submission.jira} />}

          <section className="card px-5 py-5">
            <h3 className="font-serif text-lg text-ink-900 mb-3">Key people</h3>
            {submission.people.length === 0 ? (
              <p className="text-sm text-ink-400">No people flagged.</p>
            ) : (
              <ul className="space-y-2">
                {submission.people.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="px-3 py-2 rounded-lg bg-sand-50 border border-sand-200"
                  >
                    <span className="text-sm font-medium text-ink-900 block truncate">
                      {p.name}
                    </span>
                    {p.note && p.note !== p.name && (
                      <p className="text-[11px] text-ink-500 mt-0.5">{p.note}</p>
                    )}
                  </li>
                ))}
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
    </>
  );
}
