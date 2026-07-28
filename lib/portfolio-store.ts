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
import type { PortfolioOverride } from "./types";

/**
 * The lead's hand-edited wording for the portfolio-level lines on the pulse
 * page (the hero headline and its supporting sentence). Those two are computed
 * from vibe counts rather than stored on any one submission, so they need a
 * home of their own.
 *
 * Stored exactly like the programme overrides - a single sentinel row
 * (`__portfolio__`) inside the customer's own submissions list (JSON in
 * AIGeneratedJSON), or a local JSON file in dev. Everything here degrades to
 * "no override" on any failure, so a hiccup just means the computed sentence
 * shows, never a broken page.
 */

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";
const MARKER = "__portfolio__";
const EMPTY: PortfolioOverride = {};
const MAX_LEN = 400;

function usesSharePoint(customer: Customer): boolean {
  return Boolean(SITE_ID && submissionsListIdFor(customer.id));
}

/** Keeps only well-formed, length-capped strings; anything else is dropped. */
function normalize(parsed: Partial<PortfolioOverride> | null | undefined): PortfolioOverride {
  const out: PortfolioOverride = {};
  const headline = typeof parsed?.headline === "string" ? parsed.headline.trim() : "";
  const supporting = typeof parsed?.supporting === "string" ? parsed.supporting.trim() : "";
  if (headline) out.headline = headline.slice(0, MAX_LEN);
  if (supporting) out.supporting = supporting.slice(0, MAX_LEN);
  const at = parsed?.edited?.at;
  const by = parsed?.edited?.by;
  if (typeof at === "string" && typeof by === "string") out.edited = { at, by };
  return out;
}

/* ---------- filesystem backend (local dev, no SharePoint) ---------- */

function fsPath(customer: Customer): string {
  return path.join(process.cwd(), "data", `portfolio-${customer.id}.json`);
}

async function readFS(customer: Customer): Promise<PortfolioOverride> {
  try {
    const raw = await fs.readFile(fsPath(customer), "utf-8");
    return normalize(JSON.parse(raw) as Partial<PortfolioOverride>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

async function writeFS(customer: Customer, ov: PortfolioOverride): Promise<void> {
  const p = fsPath(customer);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(ov, null, 2), "utf-8");
}

/* ---------- SharePoint backend (sentinel row) ---------- */

async function readSPWithMeta(
  customer: Customer
): Promise<{ ov: PortfolioOverride; itemId?: string }> {
  const listId = submissionsListIdFor(customer.id);
  const rows: SharePointListItem[] = await fetchSubmissionsListItems(listId);
  const item = rows.find((r) => String(r.fields.Title ?? "") === MARKER);
  if (!item) return { ov: { ...EMPTY } };
  let parsed: Partial<PortfolioOverride> | null = null;
  const raw = item.fields.AIGeneratedJSON;
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw) as Partial<PortfolioOverride>;
    } catch {
      // Corrupt blob - treat as no override.
    }
  }
  return { ov: normalize(parsed), itemId: item.id };
}

async function writeSP(
  customer: Customer,
  ov: PortfolioOverride,
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
    throw new Error(
      `Portfolio override write failed (${res.reason}${res.status ? " " + res.status : ""})`
    );
  }
}

/* ---------- public API ---------- */

/** The customer's portfolio override, cached per request. Empty on failure. */
export const readPortfolioOverride = cache(
  async (customer: Customer): Promise<PortfolioOverride> => {
    try {
      if (!usesSharePoint(customer)) return await readFS(customer);
      return (await readSPWithMeta(customer)).ov;
    } catch (err) {
      console.error("readPortfolioOverride failed:", (err as Error).message);
      return { ...EMPTY };
    }
  }
);

/**
 * Merges a patch into the stored override. A field set to an empty string is
 * a deliberate "clear this" - it drops the override so the computed sentence
 * comes back, rather than publishing a blank line. Throws on write failure so
 * the caller can report it.
 */
export async function writePortfolioOverride(
  customer: Customer,
  patch: { headline?: string; supporting?: string },
  by: string
): Promise<PortfolioOverride> {
  const { ov, itemId } = usesSharePoint(customer)
    ? await readSPWithMeta(customer)
    : { ov: await readFS(customer), itemId: undefined };

  const next: PortfolioOverride = { ...ov };
  for (const key of ["headline", "supporting"] as const) {
    if (patch[key] === undefined) continue;
    const value = patch[key]!.trim();
    if (value) next[key] = value.slice(0, MAX_LEN);
    else delete next[key];
  }
  next.edited = { at: new Date().toISOString(), by };

  if (usesSharePoint(customer)) await writeSP(customer, next, itemId);
  else await writeFS(customer, next);
  return next;
}
