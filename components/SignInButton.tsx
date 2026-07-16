"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

/**
 * Reads callbackUrl from the URL on the client, so the sign-in page can stay
 * static (no server-side searchParams). Defaults to "/", which lands on the
 * HARTS launchpad. The background color is hardcoded (not the bg-violet /
 * bg-coral utilities) because this page sits outside /c/[customer], where the
 * --accent CSS variable those utilities depend on is never set.
 */
export function SignInButton() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/";
  return (
    <button
      type="button"
      onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
      className="w-full rounded-lg text-white py-2.5 text-sm font-medium hover:opacity-90 transition"
      style={{ backgroundColor: "#6C47E8" }}
    >
      Sign in with Microsoft
    </button>
  );
}
