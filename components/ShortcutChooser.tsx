"use client";

import { useEffect, useRef } from "react";

/**
 * What the magic word opens. Typing "harts" no longer jumps straight into the
 * check-in, because there are now two different jobs behind it: putting a new
 * update IN, and correcting how an already-published one READS. Naming both
 * plainly here is what keeps that fork from being a surprise.
 */
export function ShortcutChooser({
  isOpen,
  onClose,
  onChooseInput,
  onChooseEdit,
  canEdit
}: {
  isOpen: boolean;
  onClose: () => void;
  onChooseInput: () => void;
  onChooseEdit: () => void;
  /** False when this page has nothing published yet to edit. */
  canEdit: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the panel so the choice is reachable by keyboard the
  // instant it opens, not after a tab through the page behind it.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("button[data-choice]")?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [isOpen]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-200 ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="What would you like to do?"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/35 backdrop-blur-[2px] cursor-default"
      />

      <div
        ref={panelRef}
        className={`relative w-full max-w-lg rounded-card bg-cream border border-sand-200 shadow-hero px-5 sm:px-7 py-6 transition-all duration-200 ${
          isOpen ? "translate-y-0 scale-100" : "translate-y-2 scale-[0.98]"
        }`}
      >
        <div className="text-center mb-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-400 mb-1.5">
            Weekly pulse
          </p>
          <h2 className="font-serif text-xl sm:text-2xl text-ink-900">
            What would you like to do?
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ChoiceCard
            title="Add an update"
            description="Check in on your programmes for this week."
            onClick={onChooseInput}
            icon={
              <>
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </>
            }
          />
          <ChoiceCard
            title="Edit this page"
            description={
              canEdit
                ? "Reword what's published, then publish it again."
                : "Nothing published here yet to reword."
            }
            onClick={onChooseEdit}
            disabled={!canEdit}
            icon={
              <>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </>
            }
          />
        </div>

        <p className="mt-5 text-center text-[10.5px] text-ink-400">
          Press <kbd className="font-sans text-ink-500">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}

function ChoiceCard({
  title,
  description,
  onClick,
  icon,
  disabled = false
}: {
  title: string;
  description: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-choice
      onClick={onClick}
      disabled={disabled}
      className={`group text-left rounded-xl border px-4 py-4 transition-all ${
        disabled
          ? "border-sand-200 bg-sand-50 opacity-60 cursor-not-allowed"
          : "border-sand-200 bg-cream hover:border-coral/50 hover:bg-coral/[0.04] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-coral/40"
      }`}
    >
      <span
        className={`inline-flex w-9 h-9 items-center justify-center rounded-full mb-2.5 transition-colors ${
          disabled ? "bg-sand-200 text-ink-400" : "bg-coral/10 text-coral"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-[18px] h-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {icon}
        </svg>
      </span>
      <span className="block text-sm font-medium text-ink-900">{title}</span>
      <span className="block mt-0.5 text-[11.5px] text-ink-500 leading-snug">
        {description}
      </span>
    </button>
  );
}
