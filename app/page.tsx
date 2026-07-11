"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { primaryCustomer } from "@/lib/customers";

/**
 * The platform root. Deliberately a STATIC client page (not a server redirect):
 * on Azure SWA a server/dynamic root gets routed through middleware and loops,
 * and a statically-optimized `redirect()` isn't served at all (404). A static
 * page IS served directly by SWA, and the client then bounces into the primary
 * customer's pulse — which is a registered route the SSR backend serves.
 */
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/c/${primaryCustomer().id}`);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-ink-400">
      Loading…
    </div>
  );
}
