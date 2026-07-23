/**
 * The people Sreema can notify / @mention. Client-safe: names only, no emails
 * (the name → email mapping lives server-side in lib/email.ts, so addresses
 * never reach the browser bundle). Extend this list as more leads come on.
 */
export interface Person {
  /** Stable id, also the key used server-side to resolve the email. */
  id: string;
  /** Display name, as it should appear in the UI and @mention chip. */
  name: string;
  /** First name - used to match a programme's configured lead to this person. */
  first: string;
}

export const PEOPLE: Person[] = [
  { id: "srimathi", name: "Srimathi Ravi", first: "Srimathi" },
  { id: "savio", name: "Savio Abraham", first: "Savio" }
];

/** The person messages default to when nothing else resolves (the primary lead). */
export const DEFAULT_PERSON: Person = PEOPLE[0];

export function personById(id: string | undefined | null): Person | undefined {
  if (!id) return undefined;
  return PEOPLE.find((p) => p.id === id);
}

/** Resolve an @mention token (a name or first name) to a known person. */
export function personByMention(token: string): Person | undefined {
  const t = token.trim().toLowerCase().replace(/^@/, "");
  if (!t) return undefined;
  return PEOPLE.find(
    (p) => p.first.toLowerCase() === t || p.name.toLowerCase() === t || p.id === t
  );
}

/**
 * The default recipient for a programme: the configured lead if it matches a
 * known person (by first name), otherwise the primary lead (Srimathi). This is
 * why programmes led by someone without a mailbox (e.g. Renuka, Hari Ram) still
 * reach a real inbox rather than silently dropping.
 */
export function defaultPersonForLead(leadName: string | undefined): Person {
  const lead = (leadName ?? "").toLowerCase();
  const match = PEOPLE.find((p) => new RegExp(`\\b${p.first.toLowerCase()}\\b`).test(lead));
  return match ?? DEFAULT_PERSON;
}

/**
 * Extracts the first @mention in a note and returns the matched person plus the
 * text with that mention token stripped out. Only names in PEOPLE match; an
 * @something-else is left in the text untouched. Stripping the token matters
 * because callers also render "@Name" as a separate chip - leaving it in the
 * text would show the name twice.
 */
export function extractMention(text: string): { person?: Person; rest: string } {
  const m = text.match(/@([\p{L}]+)/u);
  if (m) {
    const person = personByMention(m[1]);
    if (person) {
      const start = m.index ?? 0;
      const rest = (text.slice(0, start) + text.slice(start + m[0].length))
        .replace(/\s+/g, " ")
        .trim();
      return { person, rest };
    }
  }
  return { rest: text };
}
