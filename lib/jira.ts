import "server-only";
import type { JiraSnapshot } from "./types";

/**
 * Live Jira board snapshot, fetched at check-in time.
 * Configure via .env.local:
 *   JIRA_BASE_URL  e.g. https://yoursite.atlassian.net
 *   JIRA_EMAIL     the Atlassian account the token belongs to
 *   JIRA_API_TOKEN an API token from id.atlassian.com
 */

const STALLED_AFTER_DAYS = 7;
const MAX_STALLED_NOTES = 3;
const PAGE_SIZE = 100;
const MAX_ISSUES = 500;

interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    updated?: string;
    status?: { statusCategory?: { key?: string } };
  };
}

export function jiraConfigured(): boolean {
  return Boolean(
    process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_API_TOKEN
  );
}

function authHeader(): string {
  const raw = `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function searchPage(
  jql: string,
  nextPageToken?: string
): Promise<{ issues: JiraIssue[]; nextPageToken?: string }> {
  const base = (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
  const params = new URLSearchParams({
    jql,
    maxResults: String(PAGE_SIZE),
    fields: "summary,updated,status"
  });
  if (nextPageToken) params.set("nextPageToken", nextPageToken);

  const res = await fetch(`${base}/rest/api/3/search/jql?${params}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`Jira responded ${res.status} for project search`);
  }
  const data = (await res.json()) as {
    issues?: JiraIssue[];
    nextPageToken?: string;
  };
  return { issues: data.issues ?? [], nextPageToken: data.nextPageToken };
}

export async function fetchJiraSnapshot(
  projectKey: string
): Promise<JiraSnapshot> {
  if (!jiraConfigured()) {
    throw new Error("Jira is not configured (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN)");
  }

  const jql = `project = "${projectKey}" ORDER BY updated DESC`;
  const issues: JiraIssue[] = [];
  let token: string | undefined;
  do {
    const page = await searchPage(jql, token);
    issues.push(...page.issues);
    token = page.nextPageToken;
  } while (token && issues.length < MAX_ISSUES);

  let done = 0;
  let inProgress = 0;
  let todo = 0;
  const stalledNotes: string[] = [];
  const now = Date.now();

  for (const issue of issues) {
    const category = issue.fields.status?.statusCategory?.key ?? "new";
    if (category === "done") {
      done += 1;
    } else if (category === "indeterminate") {
      inProgress += 1;
      const updated = issue.fields.updated
        ? new Date(issue.fields.updated).getTime()
        : now;
      const quietDays = Math.floor((now - updated) / 86400000);
      if (quietDays >= STALLED_AFTER_DAYS && stalledNotes.length < MAX_STALLED_NOTES) {
        const summary = (issue.fields.summary ?? issue.key).slice(0, 60);
        stalledNotes.push(`${summary} (${issue.key}) quiet for ${quietDays} days`);
      }
    } else {
      todo += 1;
    }
  }

  const total = issues.length;
  return {
    total,
    done,
    inProgress,
    todo,
    completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
    stalledNotes
  };
}
