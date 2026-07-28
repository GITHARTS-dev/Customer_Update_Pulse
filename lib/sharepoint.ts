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

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15000;

function backoff(attempt: number): Promise<void> {
  // 300ms, 600ms - short enough to stay within a page render, long enough to
  // ride out a blip or a Graph 429/5xx.
  return new Promise((resolve) => setTimeout(resolve, attempt * 300));
}

async function graphFetch<T>(
  path: string,
  init?: RequestInit
): Promise<SharePointResult<T>> {
  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) return tokenResult;

  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          ...(init?.headers ?? {})
        },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) return { ok: true, data: (await res.json()) as T };

      lastStatus = res.status;
      // Retry transient server errors and rate limits; a 4xx (auth, bad
      // request) won't fix itself, so return it straight away.
      if ((res.status >= 500 || res.status === 429) && attempt < MAX_ATTEMPTS) {
        await backoff(attempt);
        continue;
      }
      return { ok: false, reason: "graph-error", status: res.status };
    } catch {
      // Aborted (timeout) or a genuine network failure - worth another go.
      clearTimeout(timer);
      if (attempt < MAX_ATTEMPTS) {
        await backoff(attempt);
        continue;
      }
      return { ok: false, reason: "network-error" };
    }
  }
  return { ok: false, reason: "graph-error", status: lastStatus };
}

export interface SharePointListItem {
  id: string;
  fields: Record<string, unknown>;
}

/** Graph caps a single page well below this; the rest arrives via @odata.nextLink. */
const LIST_PAGE_SIZE = 200;
/**
 * A hard stop so a runaway list can never hang a page render. One row per
 * programme per week means even a large customer takes years to approach it;
 * reaching it is a signal to archive, not a normal state, so it is logged.
 */
const LIST_MAX_PAGES = 25;

interface GraphListPage {
  value: SharePointListItem[];
  "@odata.nextLink"?: string;
}

/**
 * Every item in a list, following Graph's paging.
 *
 * This used to be a single `$top=500` read with no paging, which silently
 * truncated: one row per programme per week means a customer crosses 500 rows
 * in little over a year, and Graph gives no ordering guarantee, so the rows
 * that fell off were arbitrary. The visible symptom would have been a
 * programme quietly showing an old week as its latest, or dropping off the
 * board entirely - so this now walks every page.
 */
export async function fetchSharePointListItems(
  siteId: string,
  listId: string
): Promise<SharePointResult<{ value: SharePointListItem[] }>> {
  const all: SharePointListItem[] = [];
  let path: string | undefined =
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=${LIST_PAGE_SIZE}`;

  for (let page = 0; page < LIST_MAX_PAGES && path; page++) {
    const res: SharePointResult<GraphListPage> = await graphFetch<GraphListPage>(path);
    if (!res.ok) {
      // A later page failing after earlier ones succeeded would mean showing a
      // partial list as if it were complete - which is the exact silent
      // truncation this function exists to avoid. Fail the whole read instead.
      return res;
    }
    all.push(...(res.data.value ?? []));

    const next: string | undefined = res.data["@odata.nextLink"];
    // nextLink comes back absolute; graphFetch prepends the Graph origin, so
    // strip it back to a path. Anything unexpected ends the walk.
    path = next?.startsWith("https://graph.microsoft.com/v1.0")
      ? next.slice("https://graph.microsoft.com/v1.0".length)
      : undefined;

    if (path && page === LIST_MAX_PAGES - 1) {
      console.warn(
        `SharePoint list ${listId} exceeded ${LIST_MAX_PAGES * LIST_PAGE_SIZE} items; older rows were not read.`
      );
    }
  }

  return { ok: true, data: { value: all } };
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

/** The Graph driveItem shape we read back after an upload. */
interface DriveItem {
  name: string;
  webUrl: string;
}

/** What we hand back to callers: a display name and a browser-openable URL. */
export interface UploadedFile {
  name: string;
  url: string;
}

const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024; // 4 MB - Graph's simple-PUT ceiling

/**
 * Uploads a file to the site's default document library and returns its
 * name + a browser-openable webUrl. Small files go via a single PUT; larger
 * ones use an upload session. The lead's session token is used, so the file
 * lands under the lead's identity and the CEO (who has site access) can open
 * the returned webUrl directly. Claude never touches these files.
 */
export async function uploadFileToSiteDrive(
  siteId: string,
  path: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<SharePointResult<UploadedFile>> {
  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) return tokenResult;

  const encodedPath = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const base = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:`;

  try {
    if (bytes.byteLength <= SIMPLE_UPLOAD_MAX) {
      const res = await fetch(`${base}/content`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          "Content-Type": contentType || "application/octet-stream"
        },
        body: bytes,
        cache: "no-store"
      });
      if (!res.ok) return { ok: false, reason: "graph-error", status: res.status };
      const item = (await res.json()) as DriveItem;
      return { ok: true, data: { name: item.name, url: item.webUrl } };
    }

    // Larger files: open an upload session, then send the whole buffer at once.
    const sessRes = await fetch(`${base}/createUploadSession`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
      cache: "no-store"
    });
    if (!sessRes.ok) return { ok: false, reason: "graph-error", status: sessRes.status };
    const { uploadUrl } = (await sessRes.json()) as { uploadUrl: string };

    const size = bytes.byteLength;
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(size),
        "Content-Range": `bytes 0-${size - 1}/${size}`
      },
      body: bytes,
      cache: "no-store"
    });
    if (!putRes.ok) return { ok: false, reason: "graph-error", status: putRes.status };
    const item = (await putRes.json()) as DriveItem;
    return { ok: true, data: { name: item.name, url: item.webUrl } };
  } catch {
    return { ok: false, reason: "network-error" };
  }
}
