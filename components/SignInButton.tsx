"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

/**
 * Reads callbackUrl from the URL on the client, so the sign-in page can stay
 * static (no server-side searchParams). Defaults to "/", which lands on the
 * primary customer's pulse.
 */
export function SignInButton() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";
  return (
    <button
      type="button"
      onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
      className="w-full rounded-lg bg-violet text-white py-2.5 text-sm font-medium hover:opacity-90 transition"
    >
      Sign in with Microsoft
    </button>
  );
}
