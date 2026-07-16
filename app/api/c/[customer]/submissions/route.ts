import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { resolveProgrammes, byIdOf } from "@/lib/programme-store";
import { readAllSubmissions, readSubmission, writeSubmission } from "@/lib/store";
import { generateNarratives, type NarrativeInputWithId } from "@/lib/claude";
import { fetchJiraSnapshot, jiraConfigured } from "@/lib/jira";
import { parsePeopleNote } from "@/lib/helpers";
import type { Attachment, JiraSnapshot, PulseSubmission, Vibe } from "@/lib/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ customer: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
  const all = await readAllSubmissions(customer);
  return NextResponse.json(all);
}

interface SubmitEntry {
  programmeId: string;
  accountable?: string;
  vibe: Vibe;
  peopleNote: string;
  openTopics: string;
  leadFreeText: string;
  attachments?: Attachment[];
}

interface SubmitBody {
  submittedBy: string;
  entries?: SubmitEntry[];
  programmeId?: string;
  accountable?: string;
  vibe?: Vibe;
  peopleNote?: string;
  openTopics?: string;
  leadFreeText?: string;
}

const LINES_MAX = 6;
const VALID_VIBES = ["going_well", "watch_it", "stuck"];

function parseOpenTopics(raw: string): Array<{ title: string }> {
  const seen = new Set<string>();
  const out: Array<{ title: string }> = [];
  for (const line of raw.split("\n")) {
    const title = line.trim();
    if (!title) continue;
    const key = title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title });
    if (out.length >= LINES_MAX) break;
  }
  return out;
}

function isMeaningfulProse(s: string): boolean {
  const trimmed = (s ?? "").trim();
  const distinct = new Set(trimmed.toLowerCase().match(/[a-z]/g) ?? []).size;
  return trimmed.length >= 20 && distinct >= 5;
}

function weekOf(date: Date): number {
  const firstJan = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - firstJan.getTime()) / 86400000);
  return Math.ceil((days + firstJan.getDay() + 1) / 7);
}

const EMPTY_JIRA: JiraSnapshot = {
  total: 0,
  done: 0,
  inProgress: 0,
  todo: 0,
  completionPct: 0,
  stalledNotes: []
};

export async function POST(req: Request, ctx: RouteContext) {
  const { customer: cid } = await ctx.params;
  const customer = getCustomer(cid);
  if (!customer) return NextResponse.json({ error: "Unknown customer" }, { status: 404 });
  const byId = byIdOf(await resolveProgrammes(customer));

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEntries: SubmitEntry[] =
    body.entries && body.entries.length > 0
      ? body.entries
      : body.programmeId && body.vibe
        ? [
            {
              programmeId: body.programmeId,
              accountable: body.accountable,
              vibe: body.vibe,
              peopleNote: body.peopleNote ?? "",
              openTopics: body.openTopics ?? "",
              leadFreeText: body.leadFreeText ?? ""
            }
          ]
        : [];

  if (rawEntries.length === 0) {
    return NextResponse.json({ error: "No programmes to submit." }, { status: 400 });
  }

  for (const entry of rawEntries) {
    const programme = byId[entry.programmeId];
    if (!programme) {
      return NextResponse.json(
        { error: `Unknown programme: ${entry.programmeId}` },
        { status: 400 }
      );
    }
    if (!VALID_VIBES.includes(entry.vibe)) {
      return NextResponse.json(
        { error: `Invalid vibe for ${programme.name}: ${entry.vibe}` },
        { status: 400 }
      );
    }
    if (!isMeaningfulProse(entry.leadFreeText)) {
      return NextResponse.json(
        {
          error: `${programme.name}: your own words need to be a real sentence (at least 20 characters with some variety).`
        },
        { status: 400 }
      );
    }
  }

  const submittedBy = body.submittedBy || customer.submitter || "the lead";
  const now = new Date();
  const submittedAt = now.toISOString();
  const weekNumber = weekOf(now);

  const prepared = await Promise.all(
    rawEntries.map(async (entry) => {
      const programme = byId[entry.programmeId];
      const previous = await readSubmission(customer, entry.programmeId);
      let jira = previous?.jira ?? EMPTY_JIRA;
      if (jiraConfigured() && programme.jiraProjectKey) {
        try {
          jira = await fetchJiraSnapshot(programme.jiraProjectKey);
        } catch (err) {
          console.warn(
            `Jira fetch failed for ${programme.jiraProjectKey}, using previous snapshot: ${(err as Error).message}`
          );
        }
      }
      return { entry, programme, jira, previous };
    })
  );

  const narrativeInputs: NarrativeInputWithId[] = prepared.map(({ entry, programme }) => ({
    programmeId: entry.programmeId,
    programmeName: programme.name,
    lead: (entry.accountable ?? "").trim() || programme.lead,
    vibe: entry.vibe,
    peopleNote: entry.peopleNote,
    openTopics: entry.openTopics,
    leadFreeText: entry.leadFreeText
  }));

  let narratives: Record<string, import("@/lib/claude").NarrativeOutput>;
  try {
    narratives = await generateNarratives(narrativeInputs);
  } catch (err) {
    return NextResponse.json(
      { error: `Claude call failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  const saved: PulseSubmission[] = [];
  const failed: Array<{ programmeId: string; error: string }> = [];

  for (const { entry, programme, jira, previous } of prepared) {
    const narrative = narratives[entry.programmeId];
    if (!narrative) {
      failed.push({
        programmeId: entry.programmeId,
        error: "Claude did not return a narrative for this programme."
      });
      continue;
    }

    let attachments: Attachment[];
    if (entry.attachments !== undefined) {
      const byUrl = new Map<string, Attachment>();
      for (const a of entry.attachments) {
        if (a && a.url) byUrl.set(a.url, { name: a.name, url: a.url });
      }
      attachments = Array.from(byUrl.values());
    } else {
      attachments =
        previous && previous.weekNumber === weekNumber ? previous.attachments ?? [] : [];
    }

    const submission: PulseSubmission = {
      programmeId: entry.programmeId,
      submittedBy,
      accountable:
        (entry.accountable ?? "").trim() || previous?.accountable || programme.lead,
      weekNumber,
      submittedAt,
      vibe: entry.vibe,
      people: parsePeopleNote(entry.peopleNote),
      openTopics: parseOpenTopics(entry.openTopics),
      leadFreeText: entry.leadFreeText || undefined,
      jira,
      aiNarrative: narrative.narrative,
      aiEssence: narrative.essence,
      signals: narrative.signals,
      attachments
    };

    try {
      await writeSubmission(customer, submission);
      saved.push(submission);
    } catch (err) {
      failed.push({ programmeId: entry.programmeId, error: (err as Error).message });
    }
  }

  if (saved.length === 0) {
    return NextResponse.json(
      { error: `Could not save to SharePoint: ${failed.map((f) => f.error).join("; ")}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ saved, failed });
}
