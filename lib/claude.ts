import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { JiraSnapshot, Signal, Vibe } from "./types";

const MODEL = "claude-sonnet-4-6";

export interface NarrativeInput {
  programmeName: string;
  lead: string;
  vibe: Vibe;
  peopleNote: string;
  openTopics: string;
  leadFreeText: string;
  jira: JiraSnapshot;
}

/** A narrative input tagged with the programme it belongs to, for batch calls. */
export interface NarrativeInputWithId extends NarrativeInput {
  programmeId: string;
}

export interface NarrativeOutput {
  narrative: string;
  essence: string;
  signals: Signal[];
  nextStep?: string;
}

// Voice, kindness, integrity and signal rules — shared by the single and batch
// prompts. Only the output-format footer differs between them.
const COMMON_RULES = `You are a chief of staff writing a one-paragraph weekly pulse note about a programme for the CEO. You read what the programme lead said and the live Jira data, and you reflect that in a warm, human voice. The CEO carries a lot; your note should inform her without adding weight.

Voice rules (these are inviolable):
- Plain everyday words. Short natural sentences.
- Never use corporate jargon: no "leverage", "synergy", "stakeholder", "cadence", "bandwidth", "align", "circle back", "deep dive".
- NEVER use em-dashes (—). Use commas, full stops, or "and".
- 1 to 2 short sentences total, around 25 words at most. Precise and warm, never rushed.
- First sentence is the emotional headline. If a second is needed, give the one human detail or the one thing waiting.
- Wrap the 1 or 2 most important phrases in **markdown bold**. Use it sparingly.

Kindness rules (equally inviolable):
- Be gentle and respectful about every person and every programme. Never blame, never judge.
- Avoid heavy or harsh words: never write "blocked", "stuck", "stalled", "failed", "dead", "killed", "ended", "broken", "crisis".
- Say difficult things softly instead: "waiting on", "needs a hand", "paused for now", "taking longer than hoped", "would love a decision".
- When something is hard, write it with care and quiet hope. The reader should feel informed and calm, never alarmed.
- Small wins deserve a moment of warmth. Let good news sound good.

Integrity rules:
- Only reflect sentiment the lead actually reported, or facts the Jira data actually shows.
- Do not invent relationships, satisfaction levels, or emotional claims that weren't in the input.
- If the lead's input is sparse, stay modest and grounded. Do not embellish.

Signal kinds:
- "win": something positive that landed (a hire, a launch, an offer accepted)
- "watch": something cooling or wobbling (a person, a date, a stalled ticket)
- "ask": something that needs a decision from the CEO this week

Produce 1 to 4 signals per programme, drawn directly from that lead's input and its Jira facts. No more. No invented signals.`;

const SINGLE_FORMAT = `Output format:
Return ONLY a valid JSON object with these exact keys:
{
  "narrative": "2-3 sentence narrative with **bold** markers",
  "essence": "5 to 7 word summary",
  "signals": [ { "kind": "win" | "watch" | "ask", "text": "one short observation" } ],
  "nextStep": "optional single sentence describing the next action, or null if nothing"
}
Return ONLY the JSON. No prose before or after. No backticks. No markdown code fences.`;

const BATCH_FORMAT = `You are given SEVERAL programmes at once, each marked with a "programmeId". Write one note for EACH programme, judged only on its own input and Jira facts.

Output format:
Return ONLY a valid JSON ARRAY, one object per programme, in the same order the programmes are given. Each object has these exact keys:
{
  "programmeId": "the exact id given for that programme",
  "narrative": "2-3 sentence narrative with **bold** markers",
  "essence": "5 to 7 word summary",
  "signals": [ { "kind": "win" | "watch" | "ask", "text": "one short observation" } ],
  "nextStep": "optional single sentence describing the next action, or null if nothing"
}
Return ONLY the JSON array. No prose before or after. No backticks. No markdown code fences.`;

const SYSTEM_PROMPT = `${COMMON_RULES}\n\n${SINGLE_FORMAT}`;
const SYSTEM_PROMPT_BATCH = `${COMMON_RULES}\n\n${BATCH_FORMAT}`;

function programmeBlock(input: NarrativeInput, id?: string): string {
  const stalled =
    input.jira.stalledNotes.length > 0
      ? input.jira.stalledNotes.join("; ")
      : "none";
  return [
    id ? `Programme id: ${id}` : null,
    `Programme: ${input.programmeName}`,
    `Lead: ${input.lead}`,
    `Lead's vibe: ${input.vibe.replace("_", " ")}`,
    "",
    `People signals from the lead: ${input.peopleNote || "(none)"}`,
    `Open decisions from the lead: ${input.openTopics || "(none)"}`,
    `Lead's own words: ${input.leadFreeText || "(none)"}`,
    "",
    `Jira: ${input.jira.done} done, ${input.jira.inProgress} in progress, ${input.jira.todo} to do, ${input.jira.completionPct}% complete`,
    `Stalled tickets: ${stalled}`
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function buildUserMessage(input: NarrativeInput): string {
  return programmeBlock(input);
}

function buildBatchUserMessage(inputs: NarrativeInputWithId[]): string {
  return inputs
    .map((input) => programmeBlock(input, input.programmeId))
    .join("\n\n----------\n\n");
}

/**
 * Extracts a JSON value from a model reply that may be wrapped in code fences
 * or padded with prose. Handles both objects ({...}) and arrays ([...]).
 */
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

export async function generateNarrative(
  input: NarrativeInput
): Promise<NarrativeOutput> {
  requireApiKey();

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const cleaned = stripFences(textBlock.text);
  let parsed: NarrativeOutput;
  try {
    parsed = JSON.parse(cleaned) as NarrativeOutput;
  } catch (err) {
    throw new Error(
      `Claude returned non-JSON output: ${cleaned.slice(0, 200)}... (${err})`
    );
  }

  if (!parsed.narrative || !parsed.essence) {
    throw new Error("Claude response missing required fields");
  }
  if (!Array.isArray(parsed.signals)) parsed.signals = [];
  return parsed;
}

/**
 * Generates narratives for MANY programmes in a SINGLE Claude call, keyed by
 * programmeId. One check-in session covering N programmes costs one API call,
 * not N. Any programme Claude omits from the reply is simply absent from the
 * returned map; the caller decides how to handle that.
 */
export async function generateNarratives(
  inputs: NarrativeInputWithId[]
): Promise<Record<string, NarrativeOutput>> {
  if (inputs.length === 0) return {};
  requireApiKey();

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: Math.min(4096, 600 + inputs.length * 400),
    system: SYSTEM_PROMPT_BATCH,
    messages: [{ role: "user", content: buildBatchUserMessage(inputs) }]
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
    throw new Error(
      `Claude returned non-JSON output: ${cleaned.slice(0, 200)}... (${err})`
    );
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
      signals: Array.isArray(item.signals) ? (item.signals as Signal[]) : [],
      nextStep: typeof item.nextStep === "string" ? item.nextStep : undefined
    };
  }
  return out;
}
