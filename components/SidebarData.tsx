import { Sidebar } from "./Sidebar";
import { readAllSubmissions } from "@/lib/store";
import type { Customer } from "@/lib/customers";

interface SidebarDataProps {
  customer: Customer;
  activeProgrammeId?: string;
}

/**
 * Async wrapper that feeds the sidebar the active customer's per-programme
 * submission data (the coloured status dots). Rendered inside a <Suspense>
 * whose fallback is a plain <Sidebar> with no data, so the sidebar frame paints
 * instantly and the dots light up when SharePoint responds.
 */
export async function SidebarData({ customer, activeProgrammeId }: SidebarDataProps) {
  const submissionsByProgramme = await readAllSubmissions(customer);
  return (
    <Sidebar
      activeCustomerId={customer.id}
      activeProgrammeId={activeProgrammeId}
      submissionsByProgramme={submissionsByProgramme}
    />
  );
}
