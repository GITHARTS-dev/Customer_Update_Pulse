"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BabyElephant } from "@/components/BabyElephant";

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
            This is usually temporary — Jira, SharePoint, or Claude taking a
            moment. Trying again fixes it most of the time.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded-full bg-sand-100 text-ink-700 text-sm font-medium hover:bg-sand-200 transition"
          >
            Back to pulse
          </Link>
        </div>
      </div>
    </div>
  );
}
