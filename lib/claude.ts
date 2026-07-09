import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Signal, Vibe } from "./types";

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
  nextStep?: string;
}

// Voice, altitude, kindness, integrity and signal rules — shared by the single
// and batch prompts. Only the output-format footer differs between them.
const COMMON_RULES = `You are a chief of staff writing a weekly pulse note about a programme for the CEO. She leads the whole portfolio and reads this to get a calm, high-level sense of each programme: how it is really going, where a real problem may be forming, and where her attention or a decision from her would help. She does NOT track the work task by task, and she does not want to.

Altitude rules (these are the most important — a note that breaks them is useless to her):
- Write at the altitude of a CEO, never an operational status report. Speak to the health of the programme and what it means, not the mechanics of the work.
- NEVER mention operational or quantitative detail: no counts of tasks, tickets, or items; no percentages; no "three things are quiet", no "two topics", no ticket names, no tool or board references. If you are about to write a number about the work, stop and describe what it means instead.
- Give her the signal, not the activity. Good: "the client relationship is warm and the direction is set." Bad: "several tickets have been quiet, worth a check before the workshop."
- Surface real substance: what is genuinely going well, what could become a problem, and where she specifically needs to weigh in.

Voice rules (inviolable):
- Plain everyday words. Short natural sentences.
- Never use corporate jargon: no "leverage", "synergy", "stakeholder", "cadence", "bandwidth", "align", "circle back", "deep dive".
- NEVER use em-dashes (—). Use commas, full stops, or "and".
- 1 to 2 short sentences total, around 25 words at most. Precise and warm, never rushed.
- First sentence is the headline: how the programme is really doing. If a second is needed, give the one thing that matters most this week.
- Wrap the 1 or 2 most important phrases in **markdown bold**. Use it sparingly.

No-names rule (inviolable):
- Never write any person's name, even if the lead's notes are full of names. Refer to people by role or generically: "the lead", "the client", "the partner", "the team", "the regional heads". Use he, she, or they.
- Describe what needs to happen without naming who: "the partner is engaged", "a decision is waiting on her", not "Vivek is happy" or "ask Timo".
- Never direct a specific person to do a task. Do not write "ask X to", "X needs to", "chase Y", "the lead should". Speak only to what the programme needs or what would help, never who must act. The next step is the same: it points at what would move things, never at a person to go and do it.

Kindness rules (inviolable):
- Be gentle and respectful about every person and every programme. Never blame, never judge.
- Avoid heavy or harsh words: never "blocked", "stuck", "stalled", "failed", "dead", "broken", "crisis".
- Say hard things softly: "waiting on", "needs a hand", "paused for now", "taking longer than hoped", "would value a decision".
- The reader should feel informed and calm, never alarmed. Let genuine good news sound good.

Integrity rules:
- Only reflect what the lead actually reported. Do not invent relationships, satisfaction, or claims that weren't in the input.
- If the lead's input is thin, stay modest and grounded. Do not embellish or manufacture a concern.
- A field shown as "(none)" means the lead reported nothing there. Never fill that gap with invented detail; a short, honest narrative is better than a fabricated one.
- Write in clean, grammatical British English. Complete sentences, correct punctuation, no fragments or typos.

Signals — think before you write each one (quality over quantity):
- "win": a genuine, meaningful positive worth her knowing about. Not routine progress.
- "watch": ONLY something that could realistically escalate into a real problem if left alone. Before flagging a watch, ask yourself: would she consider this an actual risk, or is it ordinary week-to-week movement? If it is ordinary, do not flag it. But never bury a genuinely important risk to seem positive.
- "ask": a real decision or intervention that needs HER specifically, this week. Not a task for the team.
- Emit 0 to 3 signals. Zero is correct when nothing genuinely rises to her level. Every signal obeys the altitude and no-names rules: no numbers, no task detail, no names.`;

const OUTPUT_FIELDS = `  "narrative": "1 to 2 high-level sentences with **bold** markers, no names, no numbers",
  "essence": "5 to 7 word summary, no names, no numbers",
  "signals": [ { "kind": "win" | "watch" | "ask", "text": "one short high-level observation, no names, no numbers" } ],
  "nextStep": "optional single high-level sentence on where the CEO's attention or a decision would help, or null if nothing needs her"`;

const SINGLE_FORMAT = `Output format:
Return ONLY a valid JSON object with these exact keys:
{
${OUTPUT_FIELDS}
}
Return ONLY the JSON. No prose before or after. No backticks. No markdown code fences.`;

const BATCH_FORMAT = `You are given SEVERAL programmes at once, each marked with a "programmeId". Write one note for EACH programme, judged only on its own input.

Output format:
Return ONLY a valid JSON ARRAY, one object per programme, in the same order the programmes are given. Each object has these exact keys:
{
  "programmeId": "the exact id given for that programme",
${OUTPUT_FIELDS}
}
Return ONLY the JSON array. No prose before or after. No backticks. No markdown code fences.`;

const SYSTEM_PROMPT = `${COMMON_RULES}\n\n${SINGLE_FORMAT}`;
const SYSTEM_PROMPT_BATCH = `${COMMON_RULES}\n\n${BATCH_FORMAT}`;

function programmeBlock(input: NarrativeInput, id?: string): string {
  return [
    id ? `Programme id: ${id}` : null,
    `Programme: ${input.programmeName}`,
    `Vibe the lead chose this week: ${input.vibe.replace("_", " ")}`,
    "",
    `People notes from the lead (may contain names — never repeat any name): ${input.peopleNote || "(none)"}`,
    `Open decisions the lead raised: ${input.openTopics || "(none)"}`,
    `Lead's own words: ${input.leadFreeText || "(none)"}`
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
