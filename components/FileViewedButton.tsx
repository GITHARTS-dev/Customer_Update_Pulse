"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface FileViewedButtonProps {
  actionKey: string;
  /** Whether Sreema has already marked this file as viewed. */
  initialViewed: boolean;
}

/**
 * A light "mark as viewed" toggle for an uploaded file, wired to the same CEO
 * action log the decisions use. Lets Sreema quietly acknowledge she has opened
 * a file the lead shared, so nothing sits unnoticed.
 */
export function FileViewedButton({ actionKey, initialViewed }: FileViewedButtonProps) {
  const [viewed, setViewed] = useState(initialViewed);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    const next = !viewed;
    setViewed(next);
    setPending(true);
    try {
      const res = await fetch("/api/ceo-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "action",
          key: actionKey,
          status: next ? "noted" : "open"
        })
      });
      if (!res.ok) throw new Error("save failed");
      startTransition(() => router.refresh());
    } catch {
      setViewed(!next);
    } finally {
      setPending(false);
    }
  }

  if (viewed) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Mark as not viewed"
        className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full disabled:opacity-50"
        style={{ backgroundColor: "#E1F0E7", color: "#2F6A4A" }}
      >
        <span aria-hidden>✓</span> Viewed
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-sand-300 text-ink-500 hover:text-coral hover:border-coral/50 transition disabled:opacity-50"
    >
      Mark viewed
    </button>
  );
}
