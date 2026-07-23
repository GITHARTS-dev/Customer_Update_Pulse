import "server-only";
import { fetchJiraSnapshot, jiraConfigured } from "@/lib/jira";
import { JiraCard } from "./JiraCard";
import type { JiraSnapshot } from "@/lib/types";

/**
 * Fetches this programme's Jira board live at render time, so the delivery card
 * always reflects the current state of the board - not whatever was frozen into
 * the last check-in (which may be weeks old, or empty if the check-in predated
 * Jira being configured). If the live read fails (Jira down, bad key, not
 * configured), it falls back to the snapshot stored with the submission, so the
 * card degrades gracefully instead of vanishing. Renders nothing when there are
 * no tickets to show, so an empty/unmapped board never leaves an empty shell.
 *
 * Async server component - meant to be wrapped in <Suspense> by the caller so
 * the rest of the programme page paints immediately and this streams in.
 */
export async function LiveJiraCard({
  projectKey,
  fallback
}: {
  projectKey?: string;
  fallback: JiraSnapshot;
}) {
  let snapshot = fallback;
  if (projectKey && jiraConfigured()) {
    try {
      snapshot = await fetchJiraSnapshot(projectKey);
    } catch (err) {
      console.error(`Live Jira fetch failed for ${projectKey}:`, (err as Error).message);
      // keep the frozen fallback
    }
  }
  if (snapshot.total <= 0) return null;
  return <JiraCard snapshot={snapshot} />;
}
