import { NextResponse } from "next/server";
import { PROGRAMMES_BY_ID } from "@/lib/programmes";
import { readAllSubmissions, readSubmission, writeSubmission } from "@/lib/store";
import { generateNarratives, type NarrativeInputWithId } from "@/lib/claude";
import { fetchJiraSnapshot, jiraConfigured } from "@/lib/jira";
import type {
  JiraSnapshot,
  PersonSignal,
  PulseSubmission,
  Vibe
} from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const all = await readAllSubmissions();
  return NextResponse.json(all);
}

interface SubmitEntry {
  programmeId: string;
  accountable?: string;
  vibe: Vibe;
  peopleNote: string;
  openTopics: string;
  leadFreeText: string;
}

interface SubmitBody {
  submittedBy: string;
  entries?: SubmitEntry[];
  // Back-compat: a single-programme submission may arrive as flat fields.
  programmeId?: string;
  accountable?: string;
  vibe?: Vibe;
  peopleNote?: string;
  openTopics?: string;
  leadFreeText?: string;
}

const LINES_MAX = 6;
const VALID_VIBES = ["going_well", "watch_it", "stuck", "quiet_week"];

function extractName(line: string): string {
  const beforeSep = line.split(/[:,\-–—]/)[0].trim();
  const source = beforeSep.length > 0 ? beforeSep : line;
  const words = source
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{M}'’\-]/gu, ""))
    .filter(Boolean)
    .slice(0, 3);
  const name = words.join(" ").trim();
  return name.length > 0 ? name.slice(0, 60) : "Someone";
}

function parsePeople(raw: string): PersonSignal[] {
  const lines = raw
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(0, LINES_MAX).map((line) => {
    const lower = line.toLowerCase();
    const signal: PersonSignal["signal"] =
      /(cool|quiet|watch|push|frustrat|miss|delay|wobbl|stall|block)/.test(lower)
        ? "watch"
        : /(warm|asked|leaning|happy|landed|signed|launch|won|hired|joined|offer)/.test(lower)
          ? "warm"
          : "neutral";
    const name = extractName(line);
    const hasNote = line.length > name.length + 2;
    return { name, signal, note: hasNote ? line : undefined };
  });
}

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

export async function POST(req: Request) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Normalise: accept either { entries: [...] } or a single flat entry.
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
    return NextResponse.json(
      { error: "No programmes to submit." },
      { status: 400 }
    );
  }

  // Validate every entry up front — reject the whole batch if any is invalid,
  // so the lead gets one clear message rather than a partial save.
  for (const entry of rawEntries) {
    const programme = PROGRAMMES_BY_ID[entry.programmeId];
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

  const submittedBy = body.submittedBy || "Srimathi Ravi";
  const now = new Date();
  const submittedAt = now.toISOString();
  const weekNumber = weekOf(now);

  // Gather Jira per programme (each has its own board), then ask Claude ONCE
  // for all narratives in a single call.
  const prepared = await Promise.all(
    rawEntries.map(async (entry) => {
      const programme = PROGRAMMES_BY_ID[entry.programmeId];
      const previous = await readSubmission(entry.programmeId);
      let jira = previous?.jira ?? EMPTY_JIRA;
      if (jiraConfigured()) {
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

  const narrativeInputs: NarrativeInputWithId[] = prepared.map(
    ({ entry, programme, jira }) => ({
      programmeId: entry.programmeId,
      programmeName: programme.name,
      lead: (entry.accountable ?? "").trim() || programme.lead,
      vibe: entry.vibe,
      peopleNote: entry.peopleNote,
      openTopics: entry.openTopics,
      leadFreeText: entry.leadFreeText,
      jira
    })
  );

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

    const submission: PulseSubmission = {
      programmeId: entry.programmeId,
      submittedBy,
      accountable:
        (entry.accountable ?? "").trim() ||
        previous?.accountable ||
        programme.lead,
      weekNumber,
      submittedAt,
      vibe: entry.vibe,
      people: parsePeople(entry.peopleNote),
      openTopics: parseOpenTopics(entry.openTopics),
      leadFreeText: entry.leadFreeText || undefined,
      jira,
      aiNarrative: narrative.narrative,
      aiEssence: narrative.essence,
      signals: narrative.signals,
      nextStep: narrative.nextStep
    };

    try {
      await writeSubmission(submission);
      saved.push(submission);
    } catch (err) {
      failed.push({
        programmeId: entry.programmeId,
        error: (err as Error).message
      });
    }
  }

  // Nothing saved at all → this is a hard failure.
  if (saved.length === 0) {
    return NextResponse.json(
      { error: `Could not save to SharePoint: ${failed.map((f) => f.error).join("; ")}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ saved, failed });
}
