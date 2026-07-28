"use client";

import { AutoTextarea, EditBadge } from "./EditableField";
import { useEditMode } from "./EditModeProvider";
import { parseBold } from "@/lib/helpers";

/**
 * The programme's weekly narrative - Claude's two sentences, and the card most
 * worth correcting: it is the line the CEO reads first, written by a model
 * inferring tone from a short check-in. In edit mode the lead rewrites it and
 * publishes their own wording, shown to the CEO verbatim.
 */
export function EditableNarrative({
  programmeId,
  narrative,
  label,
  /** True once this card carries the lead's own words rather than Claude's. */
  isEdited,
  /** False when the check-in this came from is over a week old. */
  isFresh
}: {
  programmeId: string;
  narrative: string;
  label: string;
  isEdited: boolean;
  isFresh: boolean;
}) {
  const { editMode, programmeDraft, setProgrammeField } = useEditMode();
  const draft = programmeDraft(programmeId).aiNarrative;
  const value = draft ?? narrative;
  const parts = parseBold(value);

  return (
    <section className="card px-5 sm:px-6 py-5 relative">
      <span className="absolute -top-2.5 left-5 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] bg-cream border border-sand-200 rounded-full text-ink-500">
        {label}
      </span>
      {editMode && (
        <span className="absolute -top-2.5 right-5">
          <EditBadge />
        </span>
      )}

      {editMode ? (
        <>
          <AutoTextarea
            value={value}
            ariaLabel="Programme narrative"
            placeholder="How should this week read?"
            maxLength={600}
            onChange={(v) => setProgrammeField(programmeId, "aiNarrative", v, narrative)}
            className="font-serif text-lg sm:text-xl text-ink-900 leading-snug"
          />
          <p className="mt-2 text-[11px] text-ink-400">
            Wrap a phrase in **double asterisks** to highlight it, the way the published
            card does.
          </p>
        </>
      ) : (
        <>
          <blockquote className="font-serif text-lg sm:text-xl text-ink-900 leading-snug">
            “
            {parts.map((p, i) =>
              p.bold ? (
                <strong key={i} className="text-coral font-normal">
                  {p.text}
                </strong>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )}
            ”
          </blockquote>
          {/* Only claim Claude wrote it while that is still true, and only
              call it "this week's" when it is. */}
          {!isEdited && (
            <p className="mt-3 text-[11px] text-ink-400">
              Written by Claude from {isFresh ? "this week's" : "the last"} check-in.
            </p>
          )}
        </>
      )}
    </section>
  );
}
