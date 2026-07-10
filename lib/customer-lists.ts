import "server-only";

/**
 * Server-only mapping of customer → its SharePoint submissions list id. Kept
 * out of lib/customers.ts (which is client-safe) so list ids never ship to the
 * browser and stay sourced from environment config.
 *
 * Evora reuses the original SP_LIST_SUBMISSIONS var, so existing Azure config
 * keeps working untouched. Each new customer gets its own list + env var.
 */
const SUBMISSIONS_LIST_IDS: Record<string, string> = {
  evora: process.env.SP_LIST_SUBMISSIONS ?? "",
  gmr: process.env.SP_LIST_SUBMISSIONS_GMR ?? ""
};

export function submissionsListIdFor(customerId: string): string {
  return SUBMISSIONS_LIST_IDS[customerId] ?? "";
}
