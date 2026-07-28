"use client";

import Link from "next/link";
import { AutoTextarea, EditBadge } from "./EditableField";
import { useEditMode } from "./EditModeProvider";
import type { OpenTopic, Programme } from "@/lib/types";

interface Item {
  programmeId: string;
  topic: OpenTopic;
  /** From a check-in older than a week - still open, just not raised again. */
  stale: boolean;
}

interface AttentionBandProps {
  items: Item[];
  /** The active customer's programmes, for grouping + links. */
  programmes: Programme[];
  customerId: string;
  /**
   * Programmes that have a check-in to attach points to. A programme with
   * nothing published has no submission to edit, so it is not offered in edit
   * mode - adding a point there would fail on publish.
   */
  editableProgrammeIds: string[];
}

/**
 * The open decisions leads have raised across the portfolio - and the only
 * place they appear (the programme page no longer repeats them). Grouped by
 * programme, each linking through. Acting on things happens on the asks in a
 * programme's Signals card, not here.
 *
 * In edit mode each programme's points become editable in place, because this
 * is the card most likely to need a human pass: Claude split them out of a
 * free-text check-in, so the wording is a guess at what the lead meant.
 * Programmes with no points are still listed while editing, so one can be
 * added where Claude found none.
 */
export function AttentionBand({
  items,
  programmes,
  customerId,
  editableProgrammeIds
}: AttentionBandProps) {
  const { editMode, programmeDraft, setProgrammeField } = useEditMode();
  const editable = new Set(editableProgrammeIds);

  const groups = programmes
    .map((p) => {
      const mine = items.filter((it) => it.programmeId === p.id);
      const published = mine.map((it) => it.topic);
      const draft = programmeDraft(p.id).openTopics;
      return {
        programme: p,
        published,
        topics: draft ?? published,
        // A programme's points all come from one check-in, so staleness is a
        // property of the group, not of individual points.
        stale: mine.length > 0 && mine.every((it) => it.stale)
      };
    })
    // Read-only shows only what has something to say. Editing also shows every
    // checked-in programme with none, so a point Claude missed can be added.
    .filter((g) => g.topics.length > 0 || (editMode && editable.has(g.programme.id)));

  const liveCount = editMode
    ? groups.reduce((n, g) => n + g.topics.filter((t) => t.title.trim()).length, 0)
    : items.length;

  function updateTopics(programmeId: string, next: OpenTopic[], baseline: OpenTopic[]) {
    setProgrammeField(programmeId, "openTopics", next, baseline);
  }

  return (
    <section className="card px-6 py-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl text-ink-900">Key Discussion Points</h3>
        <span className="flex items-center gap-2 shrink-0">
          {editMode && <EditBadge />}
          <span className="text-[11px] text-ink-400">{liveCount} open</span>
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Nothing needs a decision this week.</p>
      ) : (
        <div className="mt-3 flex-1 overflow-y-auto -mr-2 pr-2 space-y-3.5">
          {groups.map((g) => (
            <div key={g.programme.id}>
              <Link
                href={`/c/${customerId}/programme/${g.programme.id}`}
                className="group flex items-center gap-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-coral">
                  {g.programme.shortName ?? g.programme.name}
                </span>
                {g.stale && (
                  <span
                    className="pill text-[8.5px] py-0 px-1.5 shrink-0"
                    style={{ backgroundColor: "#F8E7CC", color: "#7A4A0E" }}
                    title="From a check-in older than a week, still unresolved"
                  >
                    carried over
                  </span>
                )}
                <span className="h-px flex-1 bg-sand-200" />
                <span className="text-[10px] text-ink-300 group-hover:text-coral transition">
                  open →
                </span>
              </Link>

              {editMode ? (
                <div className="mt-1.5 space-y-1.5">
                  {g.topics.map((t, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AutoTextarea
                        value={t.title}
                        ariaLabel={`Discussion point ${i + 1} for ${g.programme.name}`}
                        placeholder="What needs a call?"
                        maxLength={300}
                        onChange={(v) => {
                          const next = g.topics.map((x, xi) =>
                            xi === i ? { ...x, title: v } : x
                          );
                          updateTopics(g.programme.id, next, g.published);
                        }}
                        className="text-[13px] leading-snug text-ink-800"
                      />
                      <button
                        type="button"
                        aria-label="Remove this point"
                        title="Remove this point"
                        onClick={() =>
                          updateTopics(
                            g.programme.id,
                            g.topics.filter((_, xi) => xi !== i),
                            g.published
                          )
                        }
                        className="mt-1.5 shrink-0 w-5 h-5 inline-flex items-center justify-center rounded-full text-ink-400 hover:text-crimson hover:bg-sand-100 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateTopics(g.programme.id, [...g.topics, { title: "" }], g.published)
                    }
                    className="text-[11px] text-coral hover:underline"
                  >
                    + Add a point
                  </button>
                </div>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {g.topics.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-1 h-1 mt-[7px] rounded-full shrink-0 bg-coral/60" />
                      <p className="flex-1 text-[13px] leading-snug text-ink-800">{t.title}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
