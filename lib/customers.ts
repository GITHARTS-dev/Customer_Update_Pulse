import type { Programme } from "./types";
import { PROGRAMMES as EVORA_PROGRAMMES } from "./programmes";

/**
 * A customer engagement HARTS tracks (Evora, GMR, …). This is the top-level
 * tenant: each customer has its own overview pulse, its own programmes, its own
 * check-in, its own SharePoint list, and its own accent + logo. HARTS people
 * (Sreema, the leads) are the viewers; customers are the subjects.
 *
 * This module is CLIENT-SAFE — it holds only display config + programme lists,
 * no secrets. The SharePoint list id for each customer is resolved separately,
 * server-side, in lib/customer-lists.ts.
 */
export interface CustomerTheme {
  /**
   * Accent colour as space-separated RGB channels, e.g. "108 71 232".
   * Stored this way (not as #hex) so Tailwind's coral/violet utilities —
   * defined as rgb(var(--accent) / <alpha-value>) — keep working with opacity
   * modifiers like `bg-coral/10`, `focus:ring-coral/40`.
   */
  accent: string;
}

export interface Customer {
  id: string;
  name: string;
  shortName?: string;
  /** The customer `/` redirects to; exactly one should be primary. */
  primary?: boolean;
  /** No data wired yet — the pulse page shows a "coming soon" state. */
  comingSoon?: boolean;
  /** Path under /public, shown alongside the HARTS platform mark. */
  logo: string;
  /** Intrinsic logo dimensions, so next/image reserves the right aspect ratio. */
  logoWidth: number;
  logoHeight: number;
  theme: CustomerTheme;
  /** Who check-ins are entered by, on behalf of the programmes. */
  submitter: string;
  /** This customer's programmes (empty while coming soon). */
  programmes: Programme[];
}

export const CUSTOMERS: Customer[] = [
  {
    id: "evora",
    name: "Evora Group",
    shortName: "Evora",
    primary: true,
    logo: "/logos/evora_logo.png",
    logoWidth: 307,
    logoHeight: 45,
    theme: { accent: "108 71 232" }, // Evora violet #6C47E8
    submitter: "Srimathi Ravi",
    programmes: EVORA_PROGRAMMES
  },
  {
    id: "gmr",
    name: "GMR SSC",
    shortName: "GMR",
    comingSoon: true,
    logo: "/logos/gmr_logo.png",
    logoWidth: 6000,
    logoHeight: 2213,
    theme: { accent: "13 148 136" }, // placeholder teal until GMR brand is set
    submitter: "",
    programmes: []
  }
];

export const CUSTOMERS_BY_ID: Record<string, Customer> = Object.fromEntries(
  CUSTOMERS.map((c) => [c.id, c])
);

export function getCustomer(id: string): Customer | undefined {
  return CUSTOMERS_BY_ID[id];
}

/** The customer the bare `/` redirects into (first `primary`, else first). */
export function primaryCustomer(): Customer {
  return CUSTOMERS.find((c) => c.primary) ?? CUSTOMERS[0];
}

/** A programme lookup scoped to one customer (ids are unique within a customer). */
export function programmesById(customer: Customer): Record<string, Programme> {
  return Object.fromEntries(customer.programmes.map((p) => [p.id, p]));
}
