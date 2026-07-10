import { redirect } from "next/navigation";
import { primaryCustomer } from "@/lib/customers";

// Must stay a runtime (server) route, NOT a statically-prerendered redirect.
// On Azure SWA a static-optimized redirect at "/" isn't wired to anything
// servable, so SWA serves its 404 fallback instead of routing "/" to SSR.
// force-dynamic makes "/" a server route: SSR runs and issues the redirect.
export const dynamic = "force-dynamic";

// The platform root sends you straight into the primary customer's pulse; the
// sidebar lists every customer so you can switch from there.
export default function RootPage() {
  redirect(`/c/${primaryCustomer().id}`);
}
