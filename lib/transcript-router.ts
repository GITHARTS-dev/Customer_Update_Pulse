import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey, splitSentences, stripFences } from "./claude";
import type { Vibe } from "./types";

// ── Transcript routing ───────────────────────────────────────
// The lead now speaks their whole week in one go, so something has to cut that
// single transcript into per-programme check-ins. That job is deliberately
// CLASSIFICATION, not writing: the transcript is split into sentences here, and
// Claude only says which programme each NUMBERED sentence belongs to. It never
// returns text. So a wrong answer can misfile one of the lead's own sentences,
// but can never invent a sentence the lead did not say - the same guarantee the
// signal classifier in claude.ts is built on, and the reason the CEO's verbatim
// cards stay trustworthy.
//
// Routing is the one step where a mistake reaches the reader, and it runs once
// a week, so it uses the strongest model rather than the cheapest.
const ROUTER_MODEL = "claude-opus-5";

/** One programme, described richly enough for Claude to recognise it by ear. */
export interface RosterEntry {
  id: string;
  name: string;
  shortName?: string;
  lead: string;
  subProgrammes?: string[];
  jiraProjectKey?: string;
}

/** What one programme picked up from the transcript. All text is verbatim. */
export interface RoutedProgramme {
  programmeId: string;
  /** The lead's own sentences about this programme, in spoken order. */
  words: string[];
  /** Sentences that sounded like a decision or request waiting on someone. */
  decisions: string[];
  /** Claude's read of the mood. Always confirmed by the lead before it counts. */
  vibe: Vibe;
}

export interface RoutedTranscript {
  programmes: RoutedProgramme[];
  /** Sentences Claude could not confidently place. The lead files these. */
  unassigned: string[];
}

const ROUTER_SYSTEM = `You sort a spoken weekly update into the programmes it talks about.

You are given a numbered list of SENTENCES, exactly as the lead said them, and a ROSTER of programmes. Your only job is to say which programme each sentence belongs to. You never write, rewrite, translate, summarise or clean any sentence. You return NUMBERS only.

How to assign:
- A sentence belongs to a programme if it is about that programme's work, its people, or its client. Use the roster's names, short names, sub-programme names, lead names and project keys to recognise it, and allow for speech: names may be misheard, shortened or mispronounced. "ESP", "the service partner thing" and "the one Srimathi runs" can all point at the same programme.
- Speech runs on. A sentence with no programme named usually continues the programme of the sentence before it. Carry that context forward until the lead clearly moves on.
- Assign each sentence to AT MOST ONE programme. If a sentence genuinely covers two, give it to the one it is most about.
- If you cannot place a sentence with real confidence, return programmeId null. That is a correct and useful answer, and far better than a guess. Greetings, asides and thinking aloud belong in null too.
- NEVER return a programmeId for a programme the lead did not actually talk about. A programme with nothing said about it must simply not appear. Silence is not an update.

Slots:
- "decision" if the sentence describes a decision, approval or answer that is waiting on someone, or a request for help.
- "words" for everything else.

Vibe, one per programme that appears:
- "going_well": moving, energy is up, nothing waiting.
- "watch_it": something has cooled, or a date, person or decision is wobbling.
- "stuck": waiting on something important, needs a hand this week.
Judge only from what the lead said about that programme. When they said little, "going_well" is the modest default.

Output format:
Return ONLY a valid JSON object with these exact keys:
{
  "assignments": [ { "i": <sentence number>, "programmeId": "<roster id>" or null, "slot": "words" | "decision" } ],
  "vibes": [ { "programmeId": "<roster id>", "vibe": "going_well" | "watch_it" | "stuck" } ]
}
Every sentence number appears exactly once in "assignments". Return ONLY the JSON. No prose before or after. No backticks. No markdown code fences.`;

function rosterBlock(roster: RosterEntry[]): string {
  return roster
    .map((p) => {
      const bits = [`id: ${p.id}`, `name: ${p.name}`];
      if (p.shortName) bits.push(`also called: ${p.shortName}`);
      bits.push(`lead: ${p.lead}`);
      if (p.subProgrammes?.length) bits.push(`covers: ${p.subProgrammes.join(", ")}`);
      if (p.jiraProjectKey) bits.push(`project key: ${p.jiraProjectKey}`);
      return `- ${bits.join(" | ")}`;
    })
    .join("\n");
}

/**
 * Cuts one spoken update into per-programme check-ins, keeping every sentence
 * in the lead's exact words. Programmes the lead did not mention are absent
 * from the result rather than given an empty update, so the input page can
 * leave them out of the week instead of inventing one for them.
 */
export async function routeTranscript(
  transcript: string,
  roster: RosterEntry[]
): Promise<RoutedTranscript> {
  const sentences = splitSentences(transcript);
  if (sentences.length === 0 || roster.length === 0) {
    return { programmes: [], unassigned: [] };
  }
  requireApiKey();

  const userMessage = [
    "ROSTER:",
    rosterBlock(roster),
    "",
    "SENTENCES (assign by number, do NOT rewrite):",
    sentences.map((s, i) => `${i}. ${s}`).join("\n")
  ].join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: ROUTER_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: ROUTER_SYSTEM,
    messages: [{ role: "user", content: userMessage }]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const cleaned = stripFences(textBlock.text);
  let parsed: { assignments?: unknown; vibes?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude returned non-JSON output: ${cleaned.slice(0, 200)}... (${err})`);
  }

  return buildRouted(parsed, sentences, roster);
}

/**
 * Turns Claude's index answers back into verbatim text. Anything wrong
 * structurally - an unknown id, an out of range or repeated number, a sentence
 * never mentioned - degrades to "unassigned", so the sentence still reaches the
 * lead to place by hand rather than dropping silently out of their week.
 */
function buildRouted(
  parsed: { assignments?: unknown; vibes?: unknown },
  sentences: string[],
  roster: RosterEntry[]
): RoutedTranscript {
  const validIds = new Set(roster.map((p) => p.id));

  const vibeById: Record<string, Vibe> = {};
  if (Array.isArray(parsed.vibes)) {
    for (const item of parsed.vibes as Array<Record<string, unknown>>) {
      const id = typeof item.programmeId === "string" ? item.programmeId : null;
      const vibe = item.vibe;
      if (!id || !validIds.has(id)) continue;
      if (vibe !== "going_well" && vibe !== "watch_it" && vibe !== "stuck") continue;
      vibeById[id] = vibe;
    }
  }

  const byId = new Map<string, RoutedProgramme>();
  const unassigned: string[] = [];
  const placed = new Set<number>();

  if (Array.isArray(parsed.assignments)) {
    for (const item of parsed.assignments as Array<Record<string, unknown>>) {
      const i = typeof item.i === "number" ? item.i : Number(item.i);
      if (!Number.isInteger(i) || i < 0 || i >= sentences.length || placed.has(i)) continue;
      placed.add(i);

      const id = typeof item.programmeId === "string" ? item.programmeId : null;
      if (!id || !validIds.has(id)) {
        unassigned.push(sentences[i]);
        continue;
      }
      let entry = byId.get(id);
      if (!entry) {
        entry = { programmeId: id, words: [], decisions: [], vibe: vibeById[id] ?? "going_well" };
        byId.set(id, entry);
      }
      if (item.slot === "decision") entry.decisions.push(sentences[i]);
      else entry.words.push(sentences[i]);
    }
  }

  // A sentence Claude never mentioned is the lead's words going missing, which
  // is worse than a misfile. Send it back for the lead to place.
  for (let i = 0; i < sentences.length; i++) {
    if (!placed.has(i)) unassigned.push(sentences[i]);
  }

  // Keep roster order so the review screen reads the way the page is laid out,
  // not the order Claude happened to answer in.
  const programmes = roster
    .map((p) => byId.get(p.id))
    .filter((e): e is RoutedProgramme => e !== undefined);

  return { programmes, unassigned };
}
