import "server-only";
import type {
  OpenTopic,
  PersonSignal,
  PulseSubmission,
  Signal,
  Vibe
} from "./types";
import { PROGRAMMES_BY_ID } from "./programmes";
import { safeVibe } from "./helpers";
import {
  fetchSharePointListItems,
  updateSharePointListItemFields,
  writeSharePointListItem,
  type SharePointListItem
} from "./sharepoint";

/**
 * Submissions live in the SharePoint "Pulse Submissions" list — one row per
 * programme per week. This is the single source of truth (the old on-disk
 * data/submissions.json is no longer used). Reads take the latest row per
 * programme; writes upsert the row for that programme + week.
 *
 * Column internal names (from the list) are referenced via COL below.
 */

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";
const LIST_ID = process.env.SP_LIST_SUBMISSIONS ?? "";

const COL = {
  title: "Title",
  submittedBy: "SubmittedBy",
  programmesUpdated: "ProgrammesUpdated",
  programmeUpdates: "ProgrammeUpdates",
  peopleSignals: "PeopleSignals",
  openDecisions: "OpenDecisions",
  leadVoice: "LeadVoice",
  aiJson: "AIGeneratedJSON",
  weekNumber: "WeekNumber",
  submittedAt: "SubmittedAt",
  programmeId: "ProgrammeId",
  vibe: "Vibe",
  completionPct: "CompletionPct",
  accountable: "Accountable"
} as const;

type Store = Record<string, PulseSubmission>;

function configured(): boolean {
  return Boolean(SITE_ID && LIST_ID);
}

function peopleToText(people: PersonSignal[]): string {
  return people.map((p) => (p.note ? p.note : p.name)).join("\n");
}

function topicsToText(topics: OpenTopic[]): string {
  return topics.map((t) => t.title).join("\n");
}

/** Builds the SharePoint field set for a submission (all columns we own). */
function submissionToFields(sub: PulseSubmission): Record<string, unknown> {
  const programmeName = PROGRAMMES_BY_ID[sub.programmeId]?.name ?? sub.programmeId;
  return {
    [COL.title]: `${programmeName} — week ${sub.weekNumber}`,
    [COL.submittedBy]: sub.submittedBy,
    [COL.accountable]: sub.accountable ?? "",
    [COL.programmesUpdated]: programmeName,
    [COL.programmeUpdates]: sub.aiNarrative,
    [COL.peopleSignals]: peopleToText(sub.people),
    [COL.openDecisions]: topicsToText(sub.openTopics),
    [COL.leadVoice]: sub.leadFreeText ?? "",
    // Authoritative machine copy — the whole submission, for exact round-trip.
    [COL.aiJson]: JSON.stringify(sub),
    [COL.weekNumber]: sub.weekNumber,
    [COL.submittedAt]: sub.submittedAt,
    [COL.programmeId]: sub.programmeId,
    [COL.vibe]: sub.vibe,
    [COL.completionPct]: sub.jira.completionPct
  };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reconstructs a submission from a row. Prefers the exact JSON we stored in
 * AIGeneratedJSON; falls back to the individual columns for rows created
 * outside this app (e.g. manual or other tools).
 */
function rowToSubmission(fields: Record<string, unknown>): PulseSubmission | null {
  const programmeId = asString(fields[COL.programmeId]).trim();
  if (!programmeId || !PROGRAMMES_BY_ID[programmeId]) return null;

  const rawJson = asString(fields[COL.aiJson]).trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as PulseSubmission;
      if (parsed && parsed.programmeId === programmeId && parsed.aiNarrative) {
        parsed.vibe = safeVibe(parsed.vibe);
        return parsed;
      }
    } catch {
      // Not our JSON format (e.g. a fenced-markdown row) — fall through.
    }
  }

  // Fallback: build a best-effort submission from the plain columns.
  const completionPct = asNumber(fields[COL.completionPct]);
  const people: PersonSignal[] = asString(fields[COL.peopleSignals])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => ({ name: line.slice(0, 60), signal: "neutral" as const, note: line }));
  const openTopics: OpenTopic[] = asString(fields[COL.openDecisions])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((title) => ({ title }));

  return {
    programmeId,
    submittedBy: asString(fields[COL.submittedBy]) || PROGRAMMES_BY_ID[programmeId].lead,
    accountable: asString(fields[COL.accountable]) || undefined,
    weekNumber: asNumber(fields[COL.weekNumber]),
    submittedAt: asString(fields[COL.submittedAt]) || new Date().toISOString(),
    vibe: safeVibe(fields[COL.vibe]),
    people,
    openTopics,
    leadFreeText: asString(fields[COL.leadVoice]) || undefined,
    jira: { total: 0, done: 0, inProgress: 0, todo: 0, completionPct, stalledNotes: [] },
    aiNarrative: asString(fields[COL.programmeUpdates]),
    aiEssence: "",
    signals: [] as Signal[],
    nextStep: undefined
  };
}

async function fetchRows(): Promise<SharePointListItem[]> {
  const res = await fetchSharePointListItems(SITE_ID, LIST_ID);
  if (!res.ok) {
    throw new Error(`SharePoint read failed (${res.reason}${res.status ? " " + res.status : ""})`);
  }
  return res.data.value;
}

/** Every submission row mapped, across all weeks (used by the trend history). */
export async function readAllSubmissionRows(): Promise<PulseSubmission[]> {
  if (!configured()) return [];
  const rows = await fetchRows();
  const out: PulseSubmission[] = [];
  for (const row of rows) {
    const sub = rowToSubmission(row.fields);
    if (sub) out.push(sub);
  }
  return out;
}

/** Latest submission per programme (the dashboard's "current state"). */
export async function readAllSubmissions(): Promise<Store> {
  if (!configured()) return {};
  let subs: PulseSubmission[];
  try {
    subs = await readAllSubmissionRows();
  } catch (err) {
    // Degrade gracefully: an empty dashboard beats a crashed one. The failure
    // is logged so it surfaces in the server logs.
    console.error("readAllSubmissions failed:", (err as Error).message);
    return {};
  }
  const store: Store = {};
  for (const sub of subs) {
    const existing = store[sub.programmeId];
    if (!existing || new Date(sub.submittedAt) > new Date(existing.submittedAt)) {
      store[sub.programmeId] = sub;
    }
  }
  return store;
}

export async function readSubmission(
  programmeId: string
): Promise<PulseSubmission | undefined> {
  const store = await readAllSubmissions();
  return store[programmeId];
}

/**
 * Upserts a submission: if a row already exists for this programme + week it is
 * updated (this week's overwrite), otherwise a new row is created. Throws on
 * failure so the submit endpoint can tell the lead their check-in didn't save.
 */
export async function writeSubmission(submission: PulseSubmission): Promise<void> {
  if (!configured()) {
    throw new Error(
      "SharePoint is not configured (SHAREPOINT_SITE_ID / SP_LIST_SUBMISSIONS)."
    );
  }
  const fields = submissionToFields(submission);

  const rows = await fetchRows();
  const existing = rows.find(
    (r) =>
      asString(r.fields[COL.programmeId]).trim() === submission.programmeId &&
      asNumber(r.fields[COL.weekNumber]) === submission.weekNumber
  );

  if (existing) {
    const res = await updateSharePointListItemFields(SITE_ID, LIST_ID, existing.id, fields);
    if (!res.ok) {
      throw new Error(
        `SharePoint update failed (${res.reason}${res.status ? " " + res.status : ""})`
      );
    }
    return;
  }

  const res = await writeSharePointListItem(SITE_ID, LIST_ID, fields);
  if (!res.ok) {
    throw new Error(
      `SharePoint write failed (${res.reason}${res.status ? " " + res.status : ""})`
    );
  }
}
