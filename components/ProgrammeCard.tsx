import Link from "next/link";
import { BabyElephant } from "./BabyElephant";
import {
  freshnessOf,
  relativeTime,
  safeVibe,
  VIBE_COLOR,
  VIBE_TONE
} from "@/lib/helpers";
import { VIBE_LABEL, type Programme, type PulseSubmission } from "@/lib/types";

interface ProgrammeCardProps {
  programme: Programme;
  submission?: PulseSubmission;
  animated?: boolean;
  unseen?: boolean;
}

export function ProgrammeCard({ programme, submission, animated = false, unseen = false }: ProgrammeCardProps) {
  const freshness = freshnessOf(submission?.submittedAt);
  const vibe = safeVibe(submission?.vibe);
  const tone = VIBE_TONE[vibe];
  const jiraTotal = submission?.jira.total ?? 0;
  const hasJira = jiraTotal > 0;
  const completion = Math.max(
    0,
    Math.min(100, submission?.jira.completionPct ?? 0)
  );

  const elephantOpacity =
    freshness === "fresh" ? 1 : freshness === "stale" ? 0.55 : 0.35;
  const showBackground = freshness === "fresh";

  return (
    <Link
      href={`/programme/${programme.id}`}
      className="card px-4 py-4 hover:shadow-hero transition-shadow flex flex-col items-center text-center relative"
    >
      {unseen && (
        <span
          className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-coral text-cream text-[11px] font-bold leading-none flex items-center justify-center shadow-[0_0_0_3px_rgba(255,244,238,1)] ring-1 ring-coral/30"
          title="New since your last visit"
        >
          !
        </span>
      )}
      {freshness !== "fresh" && (
        <span
          className="absolute top-2 right-2 text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold"
          style={
            freshness === "stale"
              ? { backgroundColor: "#F8E7CC", color: "#7A4A0E" }
              : { backgroundColor: "#EDE8E1", color: "#6B6258" }
          }
        >
          {freshness === "stale" ? "stale" : "no update"}
        </span>
      )}

      <div style={{ opacity: elephantOpacity }}>
        <BabyElephant vibe={vibe} size={64} background={showBackground} animated={animated && freshness === "fresh"} />
      </div>

      <h3 className="mt-2 text-sm font-medium text-ink-900 truncate w-full">
        {programme.shortName ?? programme.name}
      </h3>
      <p className="text-[11px] text-ink-400 truncate w-full">{programme.lead}</p>

      <p
        className={`mt-1 text-[10px] truncate w-full ${
          freshness === "fresh"
            ? "text-ink-500"
            : freshness === "stale"
              ? "text-amber"
              : "text-ink-300 italic"
        }`}
      >
        {submission
          ? `updated ${relativeTime(submission.submittedAt)}`
          : "awaiting first check-in"}
      </p>

      <div className="mt-2 w-full">
        <div className="flex items-center justify-between text-[11px]">
          {submission ? (
            <span
              className="pill text-[9px] py-0.5 px-2"
              style={{ backgroundColor: tone.bg, color: tone.text }}
            >
              {VIBE_LABEL[vibe]}
            </span>
          ) : (
            <span className="text-[9px] text-ink-300">no data</span>
          )}
          <span
            className="stat-num text-ink-800 text-sm"
            title={submission && !hasJira ? "No Jira data yet" : undefined}
          >
            {submission && hasJira ? `${completion}%` : "—"}
          </span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-sand-200 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${hasJira ? completion : 0}%`,
              backgroundColor:
                submission && hasJira ? VIBE_COLOR[vibe] : "#DCD3C7"
            }}
          />
        </div>
      </div>
    </Link>
  );
}
