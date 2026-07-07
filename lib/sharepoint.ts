import "server-only";
import { auth } from "@/auth";

/**
 * Every call here returns a result object instead of throwing. SharePoint
 * access rides the same per-person Microsoft sign-in as the login gate, so
 * unlike Jira/Claude's permanent server-held tokens, this one can expire,
 * fail to refresh, or get revoked out from under a single viewer. Returning
 * a result lets the caller show "unavailable" in just its own section of the
 * page instead of the whole dashboard failing to render.
 */
export type SharePointResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: "signed-out" | "needs-reauth" | "graph-error" | "network-error";
      status?: number;
    };

type AccessToken =
  | { ok: true; token: string }
  | { ok: false; reason: "signed-out" | "needs-reauth" };

async function getAccessToken(): Promise<AccessToken> {
  const session = await auth();
  if (!session) return { ok: false, reason: "signed-out" };
  if (session.error || !session.accessToken) {
    return { ok: false, reason: "needs-reauth" };
  }
  return { ok: true, token: session.accessToken };
}

async function graphFetch<T>(
  path: string,
  init?: RequestInit
): Promise<SharePointResult<T>> {
  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) return tokenResult;

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });
    if (!res.ok) {
      return { ok: false, reason: "graph-error", status: res.status };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, reason: "network-error" };
  }
}

export interface SharePointListItem {
  id: string;
  fields: Record<string, unknown>;
}

export function fetchSharePointListItems(
  siteId: string,
  listId: string
): Promise<SharePointResult<{ value: SharePointListItem[] }>> {
  return graphFetch(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=500`
  );
}

export function writeSharePointListItem(
  siteId: string,
  listId: string,
  fields: Record<string, unknown>
): Promise<SharePointResult<SharePointListItem>> {
  return graphFetch(`/sites/${siteId}/lists/${listId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
}

/** Updates the field values of an existing list item (used for same-week overwrite). */
export function updateSharePointListItemFields(
  siteId: string,
  listId: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<SharePointResult<Record<string, unknown>>> {
  return graphFetch(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}
