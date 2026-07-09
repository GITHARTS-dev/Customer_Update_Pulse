import "server-only";
import { cache } from "react";
import type { OpenTopic, PersonSignal, PulseSubmission } from "./types";
import { PROGRAMMES_BY_ID } from "./programmes";
import { safeVibe } from "./helpers";
import { buildNameList, redactNames } from "./redact";
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
 * Reconstructs a submission from a row. The plain columns (Vibe, Accountable,
 * ProgrammeUpdates, PeopleSignals, OpenDecisions, ...) are always the source
 * of truth — editing one directly in SharePoint, or deleting the row, takes
 * effect on the very next read, since reads always hit SharePoint live.
 *
 * AIGeneratedJSON supplies only the handful of fields that have no column of
 * their own (essence, signals, next step, the full Jira breakdown) — and only
 * when it still matches this row's identity, so a stale blob left over from
 * before a manual edit can't override what's actually in the columns now.
 */
function rowToSubmission(fields: Record<string, unknown>): PulseSubmission | null {
  const programmeId = asString(fields[COL.programmeId]).trim();
  if (!programmeId || !PROGRAMMES_BY_ID[programmeId]) return null;

  const completionPct = asNumber(fields[COL.completionPct]);
  const weekNumber = asNumber(fields[COL.weekNumber]);
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

  const sub: PulseSubmission = {
    programmeId,
    submittedBy: asString(fields[COL.submittedBy]) || PROGRAMMES_BY_ID[programmeId].lead,
    accountable: asString(fields[COL.accountable]) || undefined,
    weekNumber,
    submittedAt: asString(fields[COL.submittedAt]) || new Date().toISOString(),
    vibe: safeVibe(fields[COL.vibe]),
    people,
    openTopics,
    leadFreeText: asString(fields[COL.leadVoice]) || undefined,
    jira: { total: 0, done: 0, inProgress: 0, todo: 0, completionPct, stalledNotes: [] },
    aiNarrative: asString(fields[COL.programmeUpdates]),
    aiEssence: "",
    signals: [],
    nextStep: undefined,
    attachments: []
  };

  const rawJson = asString(fields[COL.aiJson]).trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as PulseSubmission;
      if (parsed && parsed.programmeId === programmeId && parsed.weekNumber === weekNumber) {
        sub.aiEssence = parsed.aiEssence ?? sub.aiEssence;
        sub.signals = Array.isArray(parsed.signals) ? parsed.signals : sub.signals;
        sub.nextStep = parsed.nextStep ?? sub.nextStep;
        sub.attachments = Array.isArray(parsed.attachments) ? parsed.attachments : sub.attachments;
        if (parsed.jira) sub.jira = { ...parsed.jira, completionPct };
      }
    } catch {
      // Not valid JSON (e.g. a row created by hand) — the column-derived
      // submission above is already complete and correct on its own.
    }
  }

  // Final guarantee: strip any person's name from everything Claude wrote,
  // using the names the lead actually flagged. This covers narratives stored
  // before the "no names" rule, and any occasional slip by the model.
  const nameList = buildNameList([
    asString(fields[COL.peopleSignals]),
    asString(fields[COL.accountable])
  ]);
  if (nameList.length > 0) {
    sub.aiNarrative = redactNames(sub.aiNarrative, nameList);
    sub.aiEssence = redactNames(sub.aiEssence, nameList);
    if (sub.nextStep) sub.nextStep = redactNames(sub.nextStep, nameList);
    sub.signals = (sub.signals ?? []).map((s) => ({
      ...s,
      text: redactNames(s.text, nameList)
    }));
  }

  return sub;
}

/**
 * The one live network call this module makes. Wrapped in React's cache() so
 * that however many times readAllSubmissions() / readAllSubmissionRows() /
 * writeSubmission() are called within a single request (a page load fetches
 * both the current state AND the trend history; a multi-programme submit
 * looks up "previous" once per programme), SharePoint is only actually
 * fetched once. Without this, a single dashboard load was making 2 full-list
 * Graph API calls, and a 3-programme submit was making 6+.
 */
export const fetchSubmissionsListItems = cache(async (): Promise<SharePointListItem[]> => {
  const res = await fetchSharePointListItems(SITE_ID, LIST_ID);
  if (!res.ok) {
    throw new Error(`SharePoint read failed (${res.reason}${res.status ? " " + res.status : ""})`);
  }
  return res.data.value;
});

/** The submissions list id + site, so the CEO log can share this same list. */
export const SUBMISSIONS_SITE_ID = SITE_ID;
export const SUBMISSIONS_LIST_ID = LIST_ID;

// Internal alias kept for readability at call sites below.
const fetchRows = fetchSubmissionsListItems;

/** Every submission row mapped, across all weeks (used by the trend history). */
export const readAllSubmissionRows = cache(async (): Promise<PulseSubmission[]> => {
  if (!configured()) return [];
  const rows = await fetchRows();
  const out: PulseSubmission[] = [];
  for (const row of rows) {
    const sub = rowToSubmission(row.fields);
    if (sub) out.push(sub);
  }
  return out;
});

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
