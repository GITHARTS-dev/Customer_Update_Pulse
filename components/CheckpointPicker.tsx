"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { WeekCheckpoint } from "@/lib/snapshot-store";

/**
 * The way back into an earlier week.
 *
 * Deliberately one quiet button until it is asked for: the dashboard's job is
 * this week, and a permanent row of week controls would compete with it. Opening
 * it lists only weeks that actually have check-ins, so a chosen week is never
 * empty.
 */
export function CheckpointPicker({
  weeks,
  activeKey,
  currentKey
}: {
  weeks: WeekCheckpoint[];
  /** The week being viewed, or null when viewing live. */
  activeKey: string | null;
  /** The week "now" falls in - shown as "This week". */
  currentKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside and Esc close it, like any menu.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(key: string | null) {
    setOpen(false);
    // The week rides in the URL so a checkpoint is shareable and the browser's
    // back button behaves the way anyone would expect.
    router.push(key ? `${pathname}?week=${key}` : pathname);
  }

  const active = weeks.find((w) => w.key === activeKey);
  const viewingPast = Boolean(activeKey) && activeKey !== currentKey;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition ${
          viewingPast
            ? "border-[#E8C685] bg-[#F8E7CC] text-[#7A4A0E] hover:bg-[#F3DDBA]"
            : "border-sand-200 bg-cream text-ink-600 hover:border-sand-300 hover:text-ink-900"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 8v4l3 2" />
          <path d="M3.05 11a9 9 0 1 1 .5 4" />
          <path d="M3 4v5h5" />
        </svg>
        {viewingPast && active ? `Week ${active.week}` : "Past weeks"}
        <svg
          viewBox="0 0 24 24"
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-2 w-[264px] rounded-card border border-sand-200 bg-cream shadow-hero overflow-hidden"
        >
          <p className="px-3.5 pt-3 pb-2 text-[10px] uppercase tracking-[0.14em] text-ink-400">
            Checkpoints
          </p>

          <button
            type="button"
            role="option"
            aria-selected={!viewingPast}
            onClick={() => go(null)}
            className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-2 transition ${
              !viewingPast ? "bg-coral/[0.07]" : "hover:bg-sand-50"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink-900">This week</span>
              <span className="block text-[10.5px] text-ink-400">live dashboard</span>
            </span>
            {!viewingPast && <span className="text-coral text-[11px] shrink-0">✓</span>}
          </button>

          <div className="max-h-[280px] overflow-y-auto border-t border-sand-200">
            {weeks.filter((w) => w.key !== currentKey).length === 0 ? (
              <p className="px-3.5 py-3 text-[11.5px] text-ink-400">
                No earlier weeks on record yet.
              </p>
            ) : (
              weeks
                .filter((w) => w.key !== currentKey)
                .map((w) => {
                  const on = w.key === activeKey;
                  return (
                    <button
                      key={w.key}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => go(w.key)}
                      className={`w-full text-left px-3.5 py-2 flex items-center justify-between gap-2 transition ${
                        on ? "bg-[#F8E7CC]" : "hover:bg-sand-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-medium text-ink-900">
                          Week {w.week}
                        </span>
                        <span className="block text-[10.5px] text-ink-400 truncate">
                          {w.range}
                        </span>
                      </span>
                      <span className="text-[10px] text-ink-300 shrink-0 tabular-nums">
                        {w.programmeCount}
                      </span>
                    </button>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
