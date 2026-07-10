import "server-only";
import { cache } from "react";
import type { OpenTopic, PersonSignal, Programme, PulseSubmission } from "./types";
import type { Customer } from "./customers";
import { submissionsListIdFor } from "./customer-lists";
import { fetchSubmissionsListItems } from "./submissions-fetch";
import { resolveProgrammes, byIdOf } from "./programme-store";
import { isOperationalSignal, parsePeopleNote, personToLine, safeVibe } from "./helpers";
import { buildNameList, redactNames } from "./redact";
import {
  updateSharePointListItemFields,
  writeSharePointListItem
} from "./sharepoint";

/**
 * Submissions live in a per-customer SharePoint list — one row per programme
 * per week. This is the single source of truth. Reads take the latest row per
 * programme; writes upsert the row for that programme + week. Every function
 * takes the Customer so it reads/writes that customer's own list; the
 * SharePoint site is shared across customers.
 */

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";

/** Programme lookup used when mapping rows — the resolved list (config + custom). */
type ProgrammeMap = Record<string, Programme>;

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

function configured(customer: Customer): boolean {
  return Boolean(SITE_ID && submissionsListIdFor(customer.id));
}

function peopleToText(people: PersonSignal[]): string {
  return people.map(personToLine).join("\n");
}

function topicsToText(topics: OpenTopic[]): string {
  return topics.map((t) => t.title).join("\n");
}

/** Builds the SharePoint field set for a submission (all columns we own). */
function submissionToFields(sub: PulseSubmission, byId: ProgrammeMap): Record<string, unknown> {
  const programmeName = byId[sub.programmeId]?.name ?? sub.programmeId;
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
 * of truth. AIGeneratedJSON supplies only the fields that have no column of
 * their own (essence, signals, the full Jira breakdown) and only when it still
 * matches this row's identity. Rows whose ProgrammeId isn't one of this
 * customer's programmes are skipped.
 */
function rowToSubmission(
  fields: Record<string, unknown>,
  byId: ProgrammeMap
): PulseSubmission | null {
  const programmeId = asString(fields[COL.programmeId]).trim();
  if (!programmeId || !byId[programmeId]) return null;

  const completionPct = asNumber(fields[COL.completionPct]);
  const weekNumber = asNumber(fields[COL.weekNumber]);
  const people: PersonSignal[] = parsePeopleNote(asString(fields[COL.peopleSignals]));
  const openTopics: OpenTopic[] = asString(fields[COL.openDecisions])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((title) => ({ title }));

  const sub: PulseSubmission = {
    programmeId,
    submittedBy: asString(fields[COL.submittedBy]) || byId[programmeId].lead,
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
  // using the names the lead actually flagged.
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

  // Delivery/Jira-flavoured signals never belong at CEO altitude — strip them
  // here so even older stored submissions stop surfacing ticket counts.
  sub.signals = (sub.signals ?? []).filter((s) => !isOperationalSignal(s.text));

  return sub;
}

/** Every submission row for a customer, across all weeks (used by trends). */
export const readAllSubmissionRows = cache(
  async (customer: Customer): Promise<PulseSubmission[]> => {
    if (!configured(customer)) return [];
    const [rows, programmes] = await Promise.all([
      fetchSubmissionsListItems(submissionsListIdFor(customer.id)),
      resolveProgrammes(customer)
    ]);
    const byId = byIdOf(programmes);
    const out: PulseSubmission[] = [];
    for (const row of rows) {
      const sub = rowToSubmission(row.fields, byId);
      if (sub) out.push(sub);
    }
    return out;
  }
);

/** Latest submission per programme for a customer (its "current state"). */
export async function readAllSubmissions(customer: Customer): Promise<Store> {
  if (!configured(customer)) return {};
  let subs: PulseSubmission[];
  try {
    subs = await readAllSubmissionRows(customer);
  } catch (err) {
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
  customer: Customer,
  programmeId: string
): Promise<PulseSubmission | undefined> {
  const store = await readAllSubmissions(customer);
  return store[programmeId];
}

/**
 * Upserts a submission into the customer's list: updates the existing row for
 * this programme + week, otherwise creates one. Throws on failure.
 */
export async function writeSubmission(
  customer: Customer,
  submission: PulseSubmission
): Promise<void> {
  const listId = submissionsListIdFor(customer.id);
  if (!SITE_ID || !listId) {
    throw new Error(
      `SharePoint is not configured for ${customer.name} (SHAREPOINT_SITE_ID / submissions list).`
    );
  }
  const fields = submissionToFields(submission, byIdOf(await resolveProgrammes(customer)));

  const rows = await fetchSubmissionsListItems(listId);
  const existing = rows.find(
    (r) =>
      asString(r.fields[COL.programmeId]).trim() === submission.programmeId &&
      asNumber(r.fields[COL.weekNumber]) === submission.weekNumber
  );

  if (existing) {
    const res = await updateSharePointListItemFields(SITE_ID, listId, existing.id, fields);
    if (!res.ok) {
      throw new Error(
        `SharePoint update failed (${res.reason}${res.status ? " " + res.status : ""})`
      );
    }
    return;
  }

  const res = await writeSharePointListItem(SITE_ID, listId, fields);
  if (!res.ok) {
    throw new Error(
      `SharePoint write failed (${res.reason}${res.status ? " " + res.status : ""})`
    );
  }
}
