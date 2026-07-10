import { Sidebar } from "./Sidebar";
import { readAllSubmissions } from "@/lib/store";
import { resolveProgrammes } from "@/lib/programme-store";
import type { Customer } from "@/lib/customers";

interface SidebarDataProps {
  customer: Customer;
  activeProgrammeId?: string;
}

/**
 * Async wrapper that feeds the sidebar the active customer's resolved programme
 * list (config + any added/removed) plus its per-programme submission data (the
 * coloured status dots). Rendered inside a <Suspense> whose fallback is a plain
 * <Sidebar> with no data, so the sidebar frame paints instantly and the
 * programmes + dots fill in when SharePoint responds.
 */
export async function SidebarData({ customer, activeProgrammeId }: SidebarDataProps) {
  const [submissionsByProgramme, programmes] = await Promise.all([
    readAllSubmissions(customer),
    resolveProgrammes(customer)
  ]);
  return (
    <Sidebar
      activeCustomerId={customer.id}
      activeProgrammeId={activeProgrammeId}
      submissionsByProgramme={submissionsByProgramme}
      programmes={programmes}
    />
  );
}
