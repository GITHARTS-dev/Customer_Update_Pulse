import "server-only";
import { cache } from "react";
import fs from "fs/promises";
import path from "path";
import {
  updateSharePointListItemFields,
  writeSharePointListItem,
  type SharePointListItem
} from "./sharepoint";
import { fetchSubmissionsListItems } from "./submissions-fetch";
import { submissionsListIdFor } from "./customer-lists";
import type { Customer } from "./customers";
import type { Programme } from "./types";

/**
 * Runtime add/remove of a customer's programmes, persisted as deltas over the
 * config baseline so the code config stays the source of the defaults:
 *   - `added`   : brand-new programmes the lead created.
 *   - `removed` : ids (config or added) the lead removed.
 *
 * Stored like the CEO log — a single sentinel row (`__programmes__`) inside the
 * customer's own submissions list (JSON in AIGeneratedJSON), or a local JSON
 * file in dev. EVERYTHING here degrades to "no overrides" on any failure, so a
 * hiccup or an unconfigured customer simply falls back to the config
 * programmes — the app never ends up with an empty programme list.
 */
export interface ProgrammeOverrides {
  added: Programme[];
  removed: string[];
}

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";
const MARKER = "__programmes__";
const EMPTY: ProgrammeOverrides = { added: [], removed: [] };

function usesSharePoint(customer: Customer): boolean {
  return Boolean(SITE_ID && submissionsListIdFor(customer.id));
}

function normalize(parsed: Partial<ProgrammeOverrides> | null | undefined): ProgrammeOverrides {
  const added = Array.isArray(parsed?.added) ? (parsed!.added as Programme[]) : [];
  const removed = Array.isArray(parsed?.removed) ? (parsed!.removed as string[]) : [];
  // Keep only well-formed programme entries.
  const cleanAdded = added.filter(
    (p) => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.lead === "string"
  );
  return { added: cleanAdded, removed: removed.filter((r) => typeof r === "string") };
}

/* ---------- filesystem backend (local dev, no SharePoint) ---------- */

function fsPath(customer: Customer): string {
  return path.join(process.cwd(), "data", `programmes-${customer.id}.json`);
}

async function readFS(customer: Customer): Promise<ProgrammeOverrides> {
  try {
    const raw = await fs.readFile(fsPath(customer), "utf-8");
    return normalize(JSON.parse(raw) as Partial<ProgrammeOverrides>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

async function writeFS(customer: Customer, ov: ProgrammeOverrides): Promise<void> {
  const p = fsPath(customer);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(ov, null, 2), "utf-8");
}

/* ---------- SharePoint backend (sentinel row) ---------- */

async function readSPWithMeta(
  customer: Customer
): Promise<{ ov: ProgrammeOverrides; itemId?: string }> {
  const listId = submissionsListIdFor(customer.id);
  const rows: SharePointListItem[] = await fetchSubmissionsListItems(listId);
  const item = rows.find((r) => String(r.fields.Title ?? "") === MARKER);
  if (!item) return { ov: { ...EMPTY } };
  let parsed: Partial<ProgrammeOverrides> | null = null;
  const raw = item.fields.AIGeneratedJSON;
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw) as Partial<ProgrammeOverrides>;
    } catch {
      // Corrupt blob — treat as no overrides.
    }
  }
  return { ov: normalize(parsed), itemId: item.id };
}

async function writeSP(
  customer: Customer,
  ov: ProgrammeOverrides,
  itemId?: string
): Promise<void> {
  const listId = submissionsListIdFor(customer.id);
  const fields: Record<string, unknown> = {
    Title: MARKER,
    AIGeneratedJSON: JSON.stringify(ov)
  };
  const res = itemId
    ? await updateSharePointListItemFields(SITE_ID, listId, itemId, fields)
    : await writeSharePointListItem(SITE_ID, listId, fields);
  if (!res.ok) {
    throw new Error(`Programme overrides write failed (${res.reason}${res.status ? " " + res.status : ""})`);
  }
}

/* ---------- public API ---------- */

/** Overrides for a customer, cached per request. Degrades to empty on failure. */
export const readProgrammeOverrides = cache(
  async (customer: Customer): Promise<ProgrammeOverrides> => {
    try {
      if (!usesSharePoint(customer)) return await readFS(customer);
      return (await readSPWithMeta(customer)).ov;
    } catch (err) {
      console.error("readProgrammeOverrides failed:", (err as Error).message);
      return { ...EMPTY };
    }
  }
);

/**
 * The effective programme list for a customer: config baseline minus removed,
 * plus added. Never throws — on any trouble it returns the config programmes,
 * so the dashboard always has a programme list to show.
 */
export const resolveProgrammes = cache(async (customer: Customer): Promise<Programme[]> => {
  const ov = await readProgrammeOverrides(customer);
  if (ov.added.length === 0 && ov.removed.length === 0) return customer.programmes;
  const removed = new Set(ov.removed);
  const base = customer.programmes.filter((p) => !removed.has(p.id));
  const added = ov.added.filter((p) => !removed.has(p.id));
  return [...base, ...added];
});

/** Map of the resolved programmes by id, for validation/lookup. */
export function byIdOf(programmes: Programme[]): Record<string, Programme> {
  return Object.fromEntries(programmes.map((p) => [p.id, p]));
}

/** A URL/id-safe slug, unique within the given set of existing ids. */
function uniqueSlug(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "programme";
  let slug = base;
  let n = 2;
  while (existing.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export interface NewProgrammeInput {
  name: string;
  lead: string;
  jiraProjectKey?: string;
}

/** Adds a programme and persists it. Returns the created programme. */
export async function addProgramme(
  customer: Customer,
  input: NewProgrammeInput
): Promise<Programme> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("A programme name is required.");
  const { ov, itemId } = usesSharePoint(customer)
    ? await readSPWithMeta(customer)
    : { ov: await readFS(customer), itemId: undefined };

  const existingIds = new Set<string>([
    ...customer.programmes.map((p) => p.id),
    ...ov.added.map((p) => p.id)
  ]);
  const programme: Programme = {
    id: uniqueSlug(name, existingIds),
    name,
    lead: input.lead.trim().slice(0, 80) || "the lead",
    jiraProjectKey: (input.jiraProjectKey ?? "").trim().toUpperCase()
  };
  const next: ProgrammeOverrides = {
    added: [...ov.added, programme],
    // If this id was previously removed, un-remove it.
    removed: ov.removed.filter((r) => r !== programme.id)
  };
  if (usesSharePoint(customer)) await writeSP(customer, next, itemId);
  else await writeFS(customer, next);
  return programme;
}

/** Removes a programme by id (config or added) and persists it. */
export async function removeProgramme(customer: Customer, programmeId: string): Promise<void> {
  const { ov, itemId } = usesSharePoint(customer)
    ? await readSPWithMeta(customer)
    : { ov: await readFS(customer), itemId: undefined };

  const wasAdded = ov.added.some((p) => p.id === programmeId);
  const next: ProgrammeOverrides = {
    // Drop it from added if it was a custom one; otherwise flag the config one removed.
    added: ov.added.filter((p) => p.id !== programmeId),
    removed: wasAdded
      ? ov.removed
      : ov.removed.includes(programmeId)
        ? ov.removed
        : [...ov.removed, programmeId]
  };
  if (usesSharePoint(customer)) await writeSP(customer, next, itemId);
  else await writeFS(customer, next);
}
