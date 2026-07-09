import "server-only";

/**
 * A deterministic safety net that guarantees no person's name reaches the CEO,
 * on top of the "no names" instruction Claude already gets. The prompt only
 * governs narratives written from now on; narratives written before that rule,
 * or the rare case where the model slips, would still carry a name. This strips
 * them at read time so the guarantee holds for every submission, old or new.
 *
 * Names to remove are taken from the lead's own people notes (and the
 * accountable person) — the exact names that end up in a narrative. We take
 * only the leading run of capitalised words on each people line (that is where
 * a person's name sits), so ordinary words are left alone.
 */

// Capitalised words that are role words, common nouns, weekdays, months, or
// sentence starters — never treated as a person's name even when they lead a
// people line.
const STOPWORDS = new Set(
  [
    // pronouns / determiners / sentence starters
    "The", "This", "That", "These", "Those", "They", "We", "She", "He", "It",
    "His", "Her", "Their", "Our", "Your", "You", "Its", "There", "Then", "Here",
    "All", "Some", "Any", "No", "Not", "Very", "Still", "Also", "Just", "Now",
    "Next", "Last", "First", "Great", "Good", "Nice", "Both", "Each", "Every",
    // role / business nouns
    "Team", "Teams", "Client", "Clients", "Customer", "Partner", "Partners",
    "Lead", "Leads", "Board", "Programme", "Program", "Project", "Projects",
    "Work", "Week", "Decision", "Decisions", "People", "Person", "Meeting",
    "Call", "Review", "Launch", "Delivery", "Progress", "Budget", "Plan",
    "Update", "Status", "Finance", "Sales", "Marketing", "Engineering",
    "Design", "Product", "Ops", "Operations", "Legal", "Group", "Region",
    "Regional", "Company", "Vendor", "Supplier", "Stakeholder", "Stakeholders",
    // days
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    // months
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December",
    // tools / names that are never a flagged person
    "Jira", "Claude", "Sreema"
  ].map((w) => w)
);

// A name-shaped token: starts uppercase, then letters (allows O'Brien, Anne-Marie).
const NAME_TOKEN = /^[A-Z][A-Za-z'’-]+$/;

const REPLACEMENT = "the team";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The leading run of capitalised, non-stopword words on a single line. */
function namesFromLine(line: string): string[] {
  const run: string[] = [];
  for (const raw of line.trim().split(/\s+/)) {
    const word = raw.replace(/^[^A-Za-z]+|[^A-Za-z'’-]+$/g, "");
    if (word && NAME_TOKEN.test(word) && !STOPWORDS.has(word)) {
      run.push(word);
    } else {
      break;
    }
  }
  return run;
}

/**
 * Builds the list of names/phrases to redact from the given raw text sources
 * (people notes, the accountable person). Multi-word full names come first so
 * "Timo Weber" is replaced whole before its individual tokens are handled.
 */
export function buildNameList(sources: Array<string | undefined>): string[] {
  const fulls = new Set<string>();
  const tokens = new Set<string>();

  for (const src of sources) {
    if (!src) continue;
    for (const line of src.split(/[\n;]/)) {
      const run = namesFromLine(line);
      if (run.length === 0) continue;
      if (run.length > 1) fulls.add(run.join(" "));
      for (const t of run) tokens.add(t);
    }
  }

  const multi = Array.from(fulls).sort((a, b) => b.length - a.length);
  const single = Array.from(tokens).sort((a, b) => b.length - a.length);
  return [...multi, ...single];
}

/** Replaces every occurrence of each name/phrase (case-insensitive) with a role word. */
export function redactNames(text: string, names: string[]): string {
  if (!text || names.length === 0) return text;
  let out = text;
  for (const name of names) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi");
    out = out.replace(re, REPLACEMENT);
  }
  // Collapse an accidental "the the team" if a name was preceded by "the".
  out = out.replace(/\bthe\s+the team\b/gi, REPLACEMENT);
  return out;
}
