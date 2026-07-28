"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A textarea that looks like the text it replaces.
 *
 * Edit mode swaps published copy for inputs in place, so the page keeps its
 * shape and the lead can see exactly how a change will read. That only works
 * if the input inherits the surrounding type - hence no built-in font or
 * colour here, just the frame and the auto-grow. Callers pass the same classes
 * the read-only text uses.
 */
export function AutoTextarea({
  value,
  onChange,
  className = "",
  placeholder,
  ariaLabel,
  tone = "light",
  rows = 1,
  maxLength
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** "dark" for the deep violet hero panels, where the frame must be light. */
  tone?: "light" | "dark";
  rows?: number;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow to fit the content rather than scrolling inside a fixed box, so a
  // longer edit shows in full and the card grows with it, exactly as the
  // published version would.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const frame =
    tone === "dark"
      ? "bg-cream/10 border-cream/30 focus:border-cream/60 placeholder:text-cream/40"
      : "bg-coral/[0.03] border-coral/30 focus:border-coral/60 placeholder:text-ink-300";

  return (
    <textarea
      ref={ref}
      value={value}
      rows={rows}
      maxLength={maxLength}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none overflow-hidden rounded-lg border border-dashed px-2.5 py-1.5 -mx-0.5 focus:outline-none transition-colors ${frame} ${className}`}
    />
  );
}

/** The small dashed label that marks a card as editable while in edit mode. */
export function EditBadge({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full ${
        tone === "dark"
          ? "bg-cream/15 text-cream/70"
          : "bg-coral/10 text-coral"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-2.5 h-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      Editing
    </span>
  );
}
