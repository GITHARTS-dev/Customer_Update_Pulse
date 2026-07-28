export type Vibe = "going_well" | "watch_it" | "stuck";

export interface Programme {
  id: string;
  name: string;
  shortName?: string;
  lead: string;
  jiraProjectKey: string;
  jiraBoardName?: string;
  personality?: "default";
  /**
   * Named components shown beneath this programme. The programme is still the
   * single check-in unit (one vibe + narrative); these are display-only labels
   * for the areas it covers, e.g. People and Culture → Job Architecture, etc.
   */
  subProgrammes?: string[];
}

export interface JiraSnapshot {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  completionPct: number;
  stalledNotes: string[];
}

export interface OpenTopic {
  title: string;
  owner?: string;
  detail?: string;
}

export type SignalKind = "win" | "watch" | "ask";

export interface Signal {
  kind: SignalKind;
  text: string;
}

/** A file the lead uploaded for this programme, shown to the CEO as a link. */
export interface Attachment {
  name: string;
  url: string;
}

export interface PulseSubmission {
  programmeId: string;
  submittedBy: string;
  /** Person accountable for the programme this week (may differ from the configured lead). */
  accountable?: string;
  weekNumber: number;
  submittedAt: string;

  vibe: Vibe;
  openTopics: OpenTopic[];
  leadFreeText?: string;

  jira: JiraSnapshot;

  aiNarrative: string;
  aiEssence: string;
  signals?: Signal[];
  nextStep?: string;

  /** Files the lead uploaded this week, for the CEO to open directly. */
  attachments?: Attachment[];

  /**
   * Set once a lead has hand-edited what Claude wrote and published it. Claude
   * writes at a no-names altitude and the reader-side redactor enforces that,
   * but an edited card is the lead's OWN words, published deliberately - so it
   * is shown exactly as typed, names included, and never redacted or captioned
   * as AI-written. Absence of this field means "still as Claude wrote it".
   */
  edited?: EditStamp;
}

/** Who last hand-edited a published card, and when. */
export interface EditStamp {
  at: string;
  by: string;
}

/**
 * Portfolio-level wording the lead has overridden on the main pulse page. Each
 * field falls back to the computed sentence when absent, so an override only
 * ever replaces the exact line it names.
 */
export interface PortfolioOverride {
  headline?: string;
  supporting?: string;
  edited?: EditStamp;
}

export const VIBE_LABEL: Record<Vibe, string> = {
  going_well: "Going well",
  watch_it: "Watch it",
  stuck: "Stuck"
};
