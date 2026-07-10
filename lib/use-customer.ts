"use client";

import { usePathname } from "next/navigation";
import { primaryCustomer } from "./customers";

/**
 * The current customer id, read from the URL (/c/<id>/...). Lets client
 * components target the right per-customer API without prop-drilling. Falls
 * back to the primary customer when not on a customer route (e.g. transient
 * states), so callers always get a usable id.
 */
export function useCustomerId(): string {
  const pathname = usePathname() ?? "";
  const m = pathname.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : primaryCustomer().id;
}

/** Base path for this customer's API routes, e.g. /api/c/evora. */
export function useCustomerApiBase(): string {
  return `/api/c/${useCustomerId()}`;
}
