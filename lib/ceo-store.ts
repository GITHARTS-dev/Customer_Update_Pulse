import "server-only";
import { cache } from "react";
import fs from "fs/promises";
import path from "path";
import {
  updateSharePointListItemFields,
  writeSharePointListItem,
  type SharePointListItem
} from "./sharepoint";
import { fetchSubmissionsListItems } from "./store";
import { submissionsListIdFor } from "./customer-lists";
import type { Customer } from "./customers";

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
 * The CEO's per-viewer state (decision touches, "viewed" marks, notes to leads),
 * one log per customer. Two backends chosen by environment:
 *
 *  1. SharePoint (when the customer's submissions list is configured): the log
 *     lives in that SAME list, in a single sentinel row (Title `__ceo_log__`,
 *     JSON in the AIGeneratedJSON column). That row has no ProgrammeId, so
 *     submission reads skip it — no extra list needed. Keeps Azure (read-only
 *     filesystem) working.
 *  2. Filesystem (local dev, no SharePoint): data/ceo-log-<customerId>.json.
 */

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";

/** Title of the single row/item that holds the entire log. */
const MARKER = "__ceo_log__";

const EMPTY_LOG: CeoLog = { actions: {}, views: {}, notes: {} };

function usesSharePoint(customer: Customer): boolean {
  return Boolean(SITE_ID && submissionsListIdFor(customer.id));
}

/** Backfill any keys missing from an older/partial blob. */
function normalize(parsed: Partial<CeoLog> | null | undefined): CeoLog {
  return {
    actions: parsed?.actions ?? {},
    views: parsed?.views ?? {},
    notes: parsed?.notes ?? {}
  };
}

/* ---------- filesystem backend (local dev) ---------- */

function fsPath(customer: Customer): string {
  return path.join(process.cwd(), "data", `ceo-log-${customer.id}.json`);
}

async function readFS(customer: Customer): Promise<CeoLog> {
  try {
    const raw = await fs.readFile(fsPath(customer), "utf-8");
    return normalize(JSON.parse(raw) as Partial<CeoLog>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_LOG };
    throw err;
  }
}

async function writeFS(customer: Customer, log: CeoLog): Promise<void> {
  const p = fsPath(customer);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(log, null, 2), "utf-8");
}

/* ---------- SharePoint backend (sentinel row in the customer's list) ---------- */

async function readSPWithMeta(
  customer: Customer
): Promise<{ log: CeoLog; itemId?: string }> {
  const listId = submissionsListIdFor(customer.id);
  const rows: SharePointListItem[] = await fetchSubmissionsListItems(listId);
  const item = rows.find((r) => String(r.fields.Title ?? "") === MARKER);
  if (!item) return { log: { ...EMPTY_LOG } };

  let parsed: Partial<CeoLog> | null = null;
  const raw = item.fields.AIGeneratedJSON;
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw) as Partial<CeoLog>;
    } catch {
      // Corrupt or hand-edited blob — start clean rather than crash.
    }
  }
  return { log: normalize(parsed), itemId: item.id };
}

async function writeSP(customer: Customer, log: CeoLog, itemId?: string): Promise<void> {
  const listId = submissionsListIdFor(customer.id);
  const fields: Record<string, unknown> = {
    Title: MARKER,
    AIGeneratedJSON: JSON.stringify(log)
  };
  const res = itemId
    ? await updateSharePointListItemFields(SITE_ID, listId, itemId, fields)
    : await writeSharePointListItem(SITE_ID, listId, fields);
  if (!res.ok) {
    throw new Error(`CEO log write failed (${res.reason}${res.status ? " " + res.status : ""})`);
  }
}

/* ---------- public API (backend-agnostic, per customer) ---------- */

/**
 * Wrapped in React's cache() so the several reads within one render (pulse page,
 * programme page) hit the backend once. Degrades to an empty log on failure so
 * a hiccup dims one card instead of crashing the dashboard.
 */
export const readCeoLog = cache(async (customer: Customer): Promise<CeoLog> => {
  try {
    if (!usesSharePoint(customer)) return await readFS(customer);
    return (await readSPWithMeta(customer)).log;
  } catch (err) {
    console.error("readCeoLog failed:", (err as Error).message);
    return { ...EMPTY_LOG };
  }
});

/** Read-modify-write against whichever backend is active for this customer. */
async function mutate(customer: Customer, apply: (log: CeoLog) => void): Promise<void> {
  if (!usesSharePoint(customer)) {
    const log = await readFS(customer);
    apply(log);
    await writeFS(customer, log);
    return;
  }
  const { log, itemId } = await readSPWithMeta(customer);
  apply(log);
  await writeSP(customer, log, itemId);
}

export async function setAction(
  customer: Customer,
  key: string,
  status: ActionStatus | "open"
): Promise<void> {
  await mutate(customer, (log) => {
    if (status === "open") {
      delete log.actions[key];
    } else {
      log.actions[key] = { status, at: new Date().toISOString() };
    }
  });
}

export async function setView(customer: Customer, programmeId: string): Promise<void> {
  await mutate(customer, (log) => {
    log.views[programmeId] = new Date().toISOString();
  });
}

export async function setNote(
  customer: Customer,
  programmeId: string,
  text: string
): Promise<void> {
  await mutate(customer, (log) => {
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
