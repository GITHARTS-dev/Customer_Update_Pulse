export type Vibe = "going_well" | "watch_it" | "stuck" | "quiet_week";

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

export interface PersonSignal {
  name: string;
  signal: "warm" | "neutral" | "watch";
  note?: string;
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

export interface PulseSubmission {
  programmeId: string;
  submittedBy: string;
  /** Person accountable for the programme this week (may differ from the configured lead). */
  accountable?: string;
  weekNumber: number;
  submittedAt: string;

  vibe: Vibe;
  people: PersonSignal[];
  openTopics: OpenTopic[];
  leadFreeText?: string;

  jira: JiraSnapshot;

  aiNarrative: string;
  aiEssence: string;
  signals?: Signal[];
  nextStep?: string;
}

export const VIBE_LABEL: Record<Vibe, string> = {
  going_well: "Going well",
  watch_it: "Watch it",
  stuck: "Stuck",
  quiet_week: "Quiet week"
};
