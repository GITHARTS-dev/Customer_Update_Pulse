"use client";

import { signIn } from "next-auth/react";

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
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
