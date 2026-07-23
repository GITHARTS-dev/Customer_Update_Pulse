"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BabyElephant } from "@/components/BabyElephant";

// Root-level boundary (no more specific /c/[customer]/error.tsx exists), so it
// always replaces the tree from above the customer layout that sets --accent -
// meaning bg-coral/bg-violet never resolve here. Hardcode the brand color instead.
export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#F4F2FC] to-cream px-4">
      <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
        <BabyElephant vibe="watch_it" size={110} />
        <div>
          <h1 className="font-serif text-xl text-ink-900">
            Something didn't load right.
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            This is usually temporary - Jira, SharePoint, or Claude taking a
            moment. Trying again fixes it most of the time.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-full text-cream text-sm font-medium hover:opacity-90 transition"
            style={{ backgroundColor: "#6C47E8" }}
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded-full bg-sand-100 text-ink-700 text-sm font-medium hover:bg-sand-200 transition"
          >
            Back to launchpad
          </Link>
        </div>
      </div>
    </div>
  );
}
