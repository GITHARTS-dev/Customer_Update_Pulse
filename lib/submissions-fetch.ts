import "server-only";
import { cache } from "react";
import { fetchSharePointListItems, type SharePointListItem } from "./sharepoint";

const SITE_ID = process.env.SHAREPOINT_SITE_ID ?? "";

/**
 * The one live SharePoint read the app makes, keyed (and cached) by list id so
 * that however many times a customer's list is read within a single request
 * (submissions + trend history + CEO log + programme overrides), Graph is hit
 * only once per list. Lives in its own module so store.ts, ceo-store.ts, and
 * programme-store.ts can all share it without importing one another.
 */
export const fetchSubmissionsListItems = cache(
  async (listId: string): Promise<SharePointListItem[]> => {
    const res = await fetchSharePointListItems(SITE_ID, listId);
    if (!res.ok) {
      throw new Error(`SharePoint read failed (${res.reason}${res.status ? " " + res.status : ""})`);
    }
    return res.data.value;
  }
);
