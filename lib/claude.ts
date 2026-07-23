import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Signal, SignalKind, Vibe } from "./types";

const MODEL = "claude-sonnet-4-6";

export interface NarrativeInput {
  programmeName: string;
  lead: string;
  vibe: Vibe;
  peopleNote: string;
  openTopics: string;
  leadFreeText: string;
}

/** A narrative input tagged with the programme it belongs to, for batch calls. */
export interface NarrativeInputWithId extends NarrativeInput {
  programmeId: string;
}

export interface NarrativeOutput {
  narrative: string;
  essence: string;
  signals: Signal[];
}

// ── Signal candidates ────────────────────────────────────────
// Signals are the lead's OWN sentences, shown verbatim - Claude only tags each
// with a kind (win/watch/ask), never rewrites it. So we split the lead's words
// deterministically here, number them, and ask Claude to classify by number.
// That guarantees the card shows exactly what the lead wrote.
function splitSentences(text: string): string[] {
  return (text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function signalCandidates(input: NarrativeInput): string[] {
  const fromFree = splitSentences(input.leadFreeText);
  const fromTopics = (input.openTopics || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...fromFree, ...fromTopics]) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= 12) break;
  }
  return out;
}

/** Maps Claude's {i, kind} classifications back to verbatim candidate text. */
function mapSignals(raw: unknown, candidates: string[]): Signal[] {
  if (!Array.isArray(raw)) return [];
  const out: Signal[] = [];
  const seen = new Set<number>();
  for (const item of raw as Array<Record<string, unknown>>) {
    const i = typeof item.i === "number" ? item.i : Number(item.i);
    const kind = item.kind;
    if (!Number.isInteger(i) || i < 0 || i >= candidates.length || seen.has(i)) continue;
    if (kind !== "win" && kind !== "watch" && kind !== "ask") continue;
    seen.add(i);
    out.push({ kind: kind as SignalKind, text: candidates[i] });
  }
  return out;
}

// Voice, altitude, kindness, integrity rules for the NARRATIVE Claude writes,
// plus the classification rules for the signal candidates (which it does NOT
// write). Shared by the single and batch prompts; only the output-format footer
// differs.
const COMMON_RULES = `You have two jobs for each programme: (1) write a short, warm weekly pulse NARRATIVE, and (2) CLASSIFY the lead's own sentences into signals. These are different. Read both carefully.

The NARRATIVE is a calm, high-level note shared with a colleague who holds the whole picture across many programmes. A note between equals, never a report up a chain, and never a task-by-task status.

Altitude rules for the NARRATIVE (most important):
- Portfolio altitude, never an operational status report. Speak to the health of the programme and what it means.
- NEVER mention operational or quantitative detail in the narrative: no counts of tasks/tickets/items, no percentages, no ticket names, no tool or board references. Translate delivery into qualitative health only ("early days", "moving steadily", "nearly there", "taking longer than hoped").
- Surface real substance: what is genuinely going well, what could become a problem, where a decision would help.

Voice rules for the NARRATIVE (inviolable):
- Plain everyday words. Short natural sentences.
- Never use corporate jargon: no "leverage", "synergy", "stakeholder", "cadence", "bandwidth", "align", "circle back", "deep dive".
- NEVER use em-dashes. Use commas, full stops, or "and".
- 1 to 2 short sentences total, around 25 words at most. Precise and warm.
- First sentence is the headline. Wrap the 1 or 2 most important phrases in **markdown bold**, sparingly.

No-names rule for the NARRATIVE and ESSENCE (inviolable):
- Never write any person's name in the narrative or essence. Refer to people by role: "the lead", "the client", "the team". Use he, she, or they.
- Never direct a specific person to act.

Respect and equality (inviolable, narrative + essence):
- Everyone involved and reading is an equal. Never imply rank, reporting up, escalation, or approval from above. Decisions are shared and support is mutual.

Kindness rules for the NARRATIVE (inviolable):
- Be gentle about every person and programme. Never blame or judge.
- Avoid harsh words: never "blocked", "stuck", "stalled", "failed", "crisis". Say hard things softly: "waiting on", "needs a hand", "paused for now", "taking longer than hoped".
- The reader should feel informed and calm, never alarmed.

Integrity rules:
- Only reflect what the lead actually reported. If the input is thin, stay modest. A field shown as "(none)" means nothing was reported there. Never invent detail.
- Write the narrative and essence in clean, grammatical British English.

SIGNAL CLASSIFICATION (you do NOT write signal text):
- Each programme includes a numbered "Signal candidates" list, the lead's own sentences, exactly as written.
- For each candidate that is a genuine signal, return its number with a kind:
  - "win": a real positive worth the reader knowing.
  - "watch": something that could realistically become a problem if left alone.
  - "ask": a real decision or request that would benefit from being taken together.
- Do NOT rewrite, summarise, translate, or clean the candidate text. You only return its NUMBER and a kind. The lead's exact sentence is shown to the reader.
- Skip (do not return) any candidate that is routine filler, a greeting, or not a real signal.
- The no-names / no-numbers / altitude rules above apply ONLY to the narrative and essence you write, NOT to the candidates, which stay in the lead's exact words even if they contain names or numbers.
- Return between zero and all candidates. Zero is correct when none is a real signal.`;

const OUTPUT_FIELDS = `  "narrative": "1 to 2 high-level sentences with **bold** markers, no names, no numbers",
  "essence": "5 to 7 word summary, no names, no numbers",
  "signals": [ { "i": <candidate number>, "kind": "win" | "watch" | "ask" } ]`;

const SINGLE_FORMAT = `Output format:
Return ONLY a valid JSON object with these exact keys:
{
${OUTPUT_FIELDS}
}
Return ONLY the JSON. No prose before or after. No backticks. No markdown code fences.`;

const BATCH_FORMAT = `You are given SEVERAL programmes at once, each marked with a "programmeId". Handle EACH programme on its own input only.

Output format:
Return ONLY a valid JSON ARRAY, one object per programme, in the same order the programmes are given. Each object has these exact keys:
{
  "programmeId": "the exact id given for that programme",
${OUTPUT_FIELDS}
}
Return ONLY the JSON array. No prose before or after. No backticks. No markdown code fences.`;

const SYSTEM_PROMPT = `${COMMON_RULES}\n\n${SINGLE_FORMAT}`;
const SYSTEM_PROMPT_BATCH = `${COMMON_RULES}\n\n${BATCH_FORMAT}`;

function programmeBlock(input: NarrativeInput, candidates: string[], id?: string): string {
  const candidateLines = candidates.length
    ? candidates.map((c, i) => `${i}. ${c}`).join("\n")
    : "(none)";
  return [
    id ? `Programme id: ${id}` : null,
    `Programme: ${input.programmeName}`,
    `Vibe the lead chose this week: ${input.vibe.replace("_", " ")}`,
    "",
    `People notes from the lead (may contain names, never repeat any name in the narrative): ${input.peopleNote || "(none)"}`,
    `Open decisions the lead raised: ${input.openTopics || "(none)"}`,
    `Lead's own words: ${input.leadFreeText || "(none)"}`,
    "",
    `Signal candidates (classify by number, do NOT rewrite):`,
    candidateLines
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function stripFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  let start = -1;
  if (firstArr >= 0 && (firstObj < 0 || firstArr < firstObj)) start = firstArr;
  else start = firstObj;
  if (start < 0) return text;
  const close = text[start] === "[" ? "]" : "}";
  const end = text.lastIndexOf(close);
  if (end > start) text = text.slice(start, end + 1);
  return text.trim();
}

function requireApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server."
    );
  }
}

export async function generateNarrative(input: NarrativeInput): Promise<NarrativeOutput> {
  requireApiKey();
  const candidates = signalCandidates(input);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: programmeBlock(input, candidates) }]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const cleaned = stripFences(textBlock.text);
  let parsed: { narrative?: string; essence?: string; signals?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude returned non-JSON output: ${cleaned.slice(0, 200)}... (${err})`);
  }

  if (!parsed.narrative || !parsed.essence) {
    throw new Error("Claude response missing required fields");
  }
  return {
    narrative: parsed.narrative,
    essence: parsed.essence,
    signals: mapSignals(parsed.signals, candidates)
  };
}

/**
 * Generates narratives for MANY programmes in a SINGLE Claude call, keyed by
 * programmeId. Signals are mapped back to each programme's own verbatim
 * candidate list, so a wrong index from one programme can never leak another's
 * text.
 */
export async function generateNarratives(
  inputs: NarrativeInputWithId[]
): Promise<Record<string, NarrativeOutput>> {
  if (inputs.length === 0) return {};
  requireApiKey();

  const candidatesById: Record<string, string[]> = {};
  for (const input of inputs) candidatesById[input.programmeId] = signalCandidates(input);

  const userMessage = inputs
    .map((input) => programmeBlock(input, candidatesById[input.programmeId], input.programmeId))
    .join("\n\n----------\n\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: Math.min(4096, 600 + inputs.length * 400),
    system: SYSTEM_PROMPT_BATCH,
    messages: [{ role: "user", content: userMessage }]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const cleaned = stripFences(textBlock.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude returned non-JSON output: ${cleaned.slice(0, 200)}... (${err})`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Claude batch response was not a JSON array");
  }

  const out: Record<string, NarrativeOutput> = {};
  for (const item of parsed as Array<Record<string, unknown>>) {
    const programmeId = typeof item.programmeId === "string" ? item.programmeId : null;
    const narrative = typeof item.narrative === "string" ? item.narrative : null;
    const essence = typeof item.essence === "string" ? item.essence : "";
    if (!programmeId || !narrative) continue;
    out[programmeId] = {
      narrative,
      essence,
      signals: mapSignals(item.signals, candidatesById[programmeId] ?? [])
    };
  }
  return out;
}

// ── Note copyediting ─────────────────────────────────────────
// The short reply Sreema types back to a lead (e.g. "ok" or a quick line) is
// both shown on the lead's check-in and emailed to them. Claude only lightly
// copyedits it here - fixing spelling/grammar/casing and softening a blunt
// tone - it never rewrites it into new content or a full narrative.
const NOTE_SYSTEM_PROMPT = `You lightly copyedit a short note before it is shown to its recipient and emailed to them. This is copyediting, NOT rewriting or summarising.

Rules (inviolable):
- Keep the author's own words, phrasing, and meaning. Change as little as possible.
- Fix spelling mistakes and grammatical errors only.
- Capitalise correctly: start sentences with a capital letter, and capitalise names properly (e.g. "srimathi" becomes "Srimathi", "savio" becomes "Savio").
- If the note reads as blunt or terse, soften it into something polite and respectful, without adding new information, opinions, or padding that wasn't implied. A one-word reply like "ok" may become "Sounds good." - never invent detail the author did not say.
- Do not add a greeting or sign-off - those are added separately elsewhere. Return only the corrected note itself.
- Never use em-dashes.
- Output ONLY the corrected note text, nothing else. No quotes, no preamble, no explanation.`;

/**
 * Lightly copyedits a short note before it's persisted and emailed: fixes
 * spelling, grammar and capitalisation, and softens a blunt tone into
 * something polite, all while keeping the author's own words. Falls back to
 * the original text untouched if Claude is unavailable or errors, since this
 * is a best-effort polish, never a hard requirement.
 */
export async function refineNote(note: string): Promise<string> {
  const trimmed = note.trim();
  if (!trimmed || !process.env.ANTHROPIC_API_KEY) return trimmed;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: NOTE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: trimmed }]
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return trimmed;
    const cleaned = textBlock.text.trim().replace(/^"+|"+$/g, "");
    return cleaned || trimmed;
  } catch (err) {
    console.error("[claude] refineNote failed:", (err as Error).message);
    return trimmed;
  }
}
