import type { ReactNode } from "react";
import {
  fetchSharePointListItems,
  type SharePointListItem
} from "@/lib/sharepoint";

interface SharePointSectionProps {
  siteId: string;
  listId: string;
  title: string;
  renderItem: (item: SharePointListItem) => ReactNode;
}

/**
 * Renders as its own async Server Component so a SharePoint token hiccup
 * (expired, revoked, or a failed refresh for this one viewer) only replaces
 * this card with a short message — it never throws, so it can't take down
 * the rest of the dashboard sitting next to it on the same page.
 */
export async function SharePointSection({
  siteId,
  listId,
  title,
  renderItem
}: SharePointSectionProps) {
  const result = await fetchSharePointListItems(siteId, listId);

  if (!result.ok) {
    const message =
      result.reason === "signed-out"
        ? "Sign in to see this."
        : result.reason === "needs-reauth"
          ? "Your Microsoft sign-in needs a refresh. Reloading the page usually fixes this; if not, sign out and back in."
          : "SharePoint data isn't available right now. The rest of the dashboard is unaffected.";

    return (
      <section className="rounded-card border border-sand-200 bg-sand-50 p-4">
        <h3 className="font-serif text-sm text-ink-700 mb-1">{title}</h3>
        <p className="text-xs text-ink-500">{message}</p>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-sand-200 bg-cream p-4 shadow-card">
      <h3 className="font-serif text-sm text-ink-700 mb-2">{title}</h3>
      {result.data.value.length === 0 ? (
        <p className="text-xs text-ink-400">Nothing here yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {result.data.value.map((item) => (
            <li key={item.id}>{renderItem(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
