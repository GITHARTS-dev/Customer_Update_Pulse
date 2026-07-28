import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { SidebarData } from "@/components/SidebarData";
import { BabyElephant } from "@/components/BabyElephant";
import { SunRays } from "@/components/SunRays";
import { FileViewedButton } from "@/components/FileViewedButton";
import { EditableNarrative } from "@/components/EditableNarrative";
import { EditableSignals, type AskState } from "@/components/EditableSignals";
import { VibeTrajectory } from "@/components/VibeTrajectory";
import { LiveJiraCard } from "@/components/LiveJiraCard";
import { ProgrammeViewTracker } from "@/components/ProgrammeViewTracker";
import { ProgrammeBodySkeleton, JiraCardSkeleton } from "@/components/Skeletons";
import { CUSTOMERS, getCustomer, type Customer } from "@/lib/customers";
import { resolveProgrammes, byIdOf } from "@/lib/programme-store";
import {
  actionKey,
  freshnessOf,
  relativeTime,
  safeVibe,
  VIBE_COLOR,
  VIBE_TONE
} from "@/lib/helpers";
import { readAllSubmissions } from "@/lib/store";
import { readCeoLog } from "@/lib/ceo-store";
import { readProgrammeHistory } from "@/lib/history-store";
import { VIBE_LABEL, type JiraSnapshot, type Programme } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Fallback when there's no stored snapshot; the live board fills it in. */
const EMPTY_JIRA: JiraSnapshot = {
  total: 0,
  done: 0,
  inProgress: 0,
  todo: 0,
  completionPct: 0,
  stalledNotes: []
};

// Enumerate customer + programme paths so Azure SWA registers and serves this
// nested dynamic route (config programmes). Pages stay force-dynamic (live
// data); this just registers the routes so SWA doesn't 404 them. Programmes a
// lead adds at runtime render on demand (dynamicParams stays on by default).
export function generateStaticParams() {
  return CUSTOMERS.flatMap((c) =>
    c.programmes.map((p) => ({ customer: c.id, id: p.id }))
  );
}

interface PageProps {
  params: Promise<{ customer: string; id: string }>;
}

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

  if (!submission) {
    return (
      <>
        <section className="card px-6 sm:px-10 py-8 sm:py-12 text-center">
          <div className="flex justify-center mb-4 opacity-50">
            <BabyElephant vibe="going_well" size={120} background={false} />
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

        {/* Delivery reflects the programme's Jira board, which exists whether or
            not the lead has checked in - so it still shows here. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Suspense fallback={<JiraCardSkeleton />}>
            <LiveJiraCard projectKey={programme.jiraProjectKey} fallback={EMPTY_JIRA} />
          </Suspense>
          {history.length > 0 && (
            <VibeTrajectory history={history} currentVibe="going_well" />
          )}
        </div>
      </>
    );
  }

  const freshness = freshnessOf(submission.submittedAt);
  const vibe = safeVibe(submission.vibe);
  const tone = VIBE_TONE[vibe];
  const signals = submission.signals ?? [];
  const attachments = submission.attachments ?? [];

  // Sreema's response to each ask, flattened here so the (client) signals card
  // gets plain props instead of the whole server-only CEO log.
  const askState: Record<string, AskState> = {};
  for (const sig of signals) {
    if (sig.kind !== "ask") continue;
    const key = actionKey("signal", programme.id, sig.text);
    const st = ceoLog.actions[key];
    const note = ceoLog.notes[key];
    if (!st && !note) continue;
    askState[key] = { status: st?.status, noteText: note?.text, noteTo: note?.to };
  }

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
          <EditableNarrative
            programmeId={programme.id}
            narrative={submission.aiNarrative}
            label={freshness === "fresh" ? "This week's narrative" : "Last narrative"}
            isEdited={Boolean(submission.edited)}
            isFresh={freshness === "fresh"}
          />

          <EditableSignals
            programmeId={programme.id}
            signals={signals}
            askState={askState}
            hasAttachments={attachments.length > 0}
            isFresh={freshness === "fresh"}
          >
            {attachments.length > 0 && (
              <>
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
              </>
            )}
          </EditableSignals>
        </div>

        {/* Right column: trend, then delivery */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <VibeTrajectory
            history={history}
            currentVibe={vibe}
            isFresh={freshness === "fresh"}
          />

          <Suspense fallback={<JiraCardSkeleton />}>
            <LiveJiraCard projectKey={programme.jiraProjectKey} fallback={submission.jira} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
