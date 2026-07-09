import "server-only";
import { cache } from "react";
import fs from "fs/promises";
import path from "path";
import {
  fetchSharePointListItems,
  updateSharePointListItemFields,
  writeSharePointListItem,
  type SharePointListItem
} from "./sharepoint";
import {
  fetchSubmissionsListItems,
  SUBMISSIONS_LIST_ID,
  SUBMISSIONS_SITE_ID
} from "./store";

export type ActionStatus = "noted" | "done" | "dismissed";

export interface ActionState {
  status: ActionStatus;
  at: string;
}

/** A short note from the CEO back to the programme's lead, shown on their check-in. */
export interface CeoNote {
  text: string;
  at: string;
}

export interface CeoLog {
  actions: Record<string, ActionState>;
  views: Record<string, string>;
  /** Keyed by programmeId — Sreema's latest note to that programme's lead. */
  notes: Record<string, CeoNote>;
}

/**
 * The CEO's per-viewer state (decision touches, "viewed" marks, notes to leads).
 * The whole log lives as ONE JSON blob so it round-trips atomically.
 *
 * Three backends, chosen by environment — all keep the app deployable to Azure
 * Static Web Apps (whose filesystem is read-only), by never writing to disk in
 * production:
 *
 *  1. "shared" (default when SharePoint is configured): the log lives in the
 *     SAME "Pulse Submissions" list as check-ins, in a single sentinel row
 *     (Title `__ceo_log__`, JSON in the AIGeneratedJSON column). That row has
 *     no ProgrammeId, so submission reads skip it entirely — no extra list to
 *     create. This is the answer to "can it share one list?": yes.
 *  2. "dedicated" (when SP_LIST_CEOLOG is set): its own list, JSON in a plain
 *     multiline-text column named `Data`. Use this if you'd rather keep the
 *     submissions list clean.
 *  3. "fs" (local dev, no SharePoint): the old data/ceo-log.json.
 *
 * The public API (readCeoLog / setAction / setView / setNote) is identical
 * whichever backend is active.
 */

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";
const DEDICATED_LIST_ID = process.env.SP_LIST_CEOLOG ?? "";

/** Title of the single row/item that holds the entire log. */
const MARKER = "__ceo_log__";

type Backend =
  | { kind: "dedicated"; siteId: string; listId: string; dataCol: "Data" }
  | { kind: "shared"; siteId: string; listId: string; dataCol: "AIGeneratedJSON" }
  | { kind: "fs" };

function resolveBackend(): Backend {
  if (SITE_ID && DEDICATED_LIST_ID) {
    return { kind: "dedicated", siteId: SITE_ID, listId: DEDICATED_LIST_ID, dataCol: "Data" };
  }
  if (SUBMISSIONS_SITE_ID && SUBMISSIONS_LIST_ID) {
    return {
      kind: "shared",
      siteId: SUBMISSIONS_SITE_ID,
      listId: SUBMISSIONS_LIST_ID,
      dataCol: "AIGeneratedJSON"
    };
  }
  return { kind: "fs" };
}

const backend = resolveBackend();

const STORE_PATH = path.join(process.cwd(), "data", "ceo-log.json");

const EMPTY_LOG: CeoLog = { actions: {}, views: {}, notes: {} };

/** Backfill any keys missing from an older/partial blob so callers can rely on
 *  every field being present. */
function normalize(parsed: Partial<CeoLog> | null | undefined): CeoLog {
  return {
    actions: parsed?.actions ?? {},
    views: parsed?.views ?? {},
    notes: parsed?.notes ?? {}
  };
}

/* ---------- filesystem backend (local dev) ---------- */

async function readFS(): Promise<CeoLog> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return normalize(JSON.parse(raw) as Partial<CeoLog>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_LOG };
    throw err;
  }
}

async function writeFS(log: CeoLog): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(log, null, 2), "utf-8");
}

/* ---------- SharePoint backends (shared list / dedicated list) ---------- */

async function readRows(
  b: Extract<Backend, { kind: "shared" | "dedicated" }>
): Promise<SharePointListItem[]> {
  // The shared backend reuses store.ts's cached fetch, so a page that reads
  // both submissions and the CEO log hits Graph only once per render.
  if (b.kind === "shared") return fetchSubmissionsListItems();
  const res = await fetchSharePointListItems(b.siteId, b.listId);
  if (!res.ok) {
    throw new Error(`CEO log read failed (${res.reason}${res.status ? " " + res.status : ""})`);
  }
  return res.data.value;
}

async function readSPWithMeta(
  b: Extract<Backend, { kind: "shared" | "dedicated" }>
): Promise<{ log: CeoLog; itemId?: string }> {
  const rows = await readRows(b);
  const item = rows.find((r) => String(r.fields.Title ?? "") === MARKER);
  if (!item) return { log: { ...EMPTY_LOG } };

  let parsed: Partial<CeoLog> | null = null;
  const raw = item.fields[b.dataCol];
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw) as Partial<CeoLog>;
    } catch {
      // Corrupt or hand-edited blob — start clean rather than crash.
    }
  }
  return { log: normalize(parsed), itemId: item.id };
}

async function writeSP(
  b: Extract<Backend, { kind: "shared" | "dedicated" }>,
  log: CeoLog,
  itemId?: string
): Promise<void> {
  const fields: Record<string, unknown> = {
    Title: MARKER,
    [b.dataCol]: JSON.stringify(log)
  };
  const res = itemId
    ? await updateSharePointListItemFields(b.siteId, b.listId, itemId, fields)
    : await writeSharePointListItem(b.siteId, b.listId, fields);
  if (!res.ok) {
    throw new Error(`CEO log write failed (${res.reason}${res.status ? " " + res.status : ""})`);
  }
}

/* ---------- public API (backend-agnostic) ---------- */

/**
 * Wrapped in React's cache() so the several reads within one render (home page,
 * programme page, the input drawer) hit the backend once. Degrades to an empty
 * log on failure so a hiccup dims one card instead of crashing the dashboard.
 */
export const readCeoLog = cache(async (): Promise<CeoLog> => {
  try {
    if (backend.kind === "fs") return await readFS();
    return (await readSPWithMeta(backend)).log;
  } catch (err) {
    console.error("readCeoLog failed:", (err as Error).message);
    return { ...EMPTY_LOG };
  }
});

/** Read-modify-write against whichever backend is active. */
async function mutate(apply: (log: CeoLog) => void): Promise<void> {
  if (backend.kind === "fs") {
    const log = await readFS();
    apply(log);
    await writeFS(log);
    return;
  }
  const { log, itemId } = await readSPWithMeta(backend);
  apply(log);
  await writeSP(backend, log, itemId);
}

export async function setAction(
  key: string,
  status: ActionStatus | "open"
): Promise<void> {
  await mutate((log) => {
    if (status === "open") {
      delete log.actions[key];
    } else {
      log.actions[key] = { status, at: new Date().toISOString() };
    }
  });
}

export async function setView(programmeId: string): Promise<void> {
  await mutate((log) => {
    log.views[programmeId] = new Date().toISOString();
  });
}

export async function setNote(programmeId: string, text: string): Promise<void> {
  await mutate((log) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      delete log.notes[programmeId];
    } else {
      log.notes[programmeId] = {
        text: trimmed.slice(0, 1000),
        at: new Date().toISOString()
      };
    }
  });
}
