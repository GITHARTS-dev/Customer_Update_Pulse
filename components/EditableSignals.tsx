"use client";

import { ActionButtons } from "./ActionButtons";
import { AskNote } from "./AskNote";
import { AutoTextarea, EditBadge } from "./EditableField";
import { useEditMode } from "./EditModeProvider";
import { actionKey } from "@/lib/helpers";
import type { ActionStatus } from "@/lib/actions";
import type { Signal, SignalKind } from "@/lib/types";

/** Sreema's response to one ask, resolved on the server and passed in flat. */
export interface AskState {
  status?: ActionStatus;
  noteText?: string;
  noteTo?: string;
}

const SIGNAL_STYLE: Record<SignalKind, { bg: string; dot: string; label: string }> = {
  win: { bg: "#E1F0E7", dot: "#3BA46A", label: "Won" },
  watch: { bg: "#F8E7CC", dot: "#E8A020", label: "Watching" },
  ask: { bg: "#F2D9D3", dot: "#D6473F", label: "Ask" }
};

const KIND_ORDER: SignalKind[] = ["win", "watch", "ask"];

/**
 * The lead's own sentences from this week, sorted by Claude into wins,
 * watch-outs and asks. Claude never rewrites the text, only classifies it -
 * but it can still mis-sort a line, or split one badly, so edit mode lets the
 * lead fix both the wording and the kind.
 *
 * Sreema's response controls are hidden while editing: they act on a published
 * ask, and the ask being edited isn't published yet.
 *
 * `children` is the attachments block, which stays server-rendered and is not
 * editable - it's files, not wording.
 */
export function EditableSignals({
  programmeId,
  signals,
  askState,
  hasAttachments,
  /** False when the check-in these came from is over a week old. */
  isFresh,
  children
}: {
  programmeId: string;
  signals: Signal[];
  askState: Record<string, AskState>;
  hasAttachments: boolean;
  isFresh: boolean;
  children?: React.ReactNode;
}) {
  const { editMode, programmeDraft, setProgrammeField } = useEditMode();
  const draft = programmeDraft(programmeId).signals;
  const value = draft ?? signals;

  function update(next: Signal[]) {
    setProgrammeField(programmeId, "signals", next, signals);
  }

  const asks = value.filter((s) => s.kind === "ask");
  const rest = value.filter((s) => s.kind !== "ask");

  return (
    <section className="card px-5 sm:px-6 py-5">
      <div className="flex items-baseline justify-between gap-2">
        {/* Never say "this week" about a check-in that isn't from this week -
            the whole card would read as current when it is weeks old. */}
        <h3 className="font-serif text-lg text-ink-900 mb-1">
          {isFresh ? "Signals this week" : "Signals from the last check-in"}
        </h3>
        {editMode && <EditBadge />}
      </div>
      <p className="text-[11px] text-ink-400 mb-3">
        The lead's own words{isFresh ? " this week" : ""}, flagged as wins, watch-outs, and asks.
      </p>

      {editMode ? (
        <div className="space-y-2">
          {value.length === 0 && (
            <p className="text-[12px] text-ink-400">
              No signals yet. Add one to put a line in front of Sreema.
            </p>
          )}
          {value.map((sig, i) => (
            <div
              key={i}
              className="rounded-xl border border-sand-200 bg-sand-50 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <AutoTextarea
                  value={sig.text}
                  ariaLabel={`Signal ${i + 1}`}
                  placeholder="What should this say?"
                  maxLength={400}
                  onChange={(v) =>
                    update(value.map((x, xi) => (xi === i ? { ...x, text: v } : x)))
                  }
                  className="text-sm leading-snug text-ink-800 bg-cream/70"
                />
                <button
                  type="button"
                  aria-label="Remove this signal"
                  title="Remove this signal"
                  onClick={() => update(value.filter((_, xi) => xi !== i))}
                  className="mt-1.5 shrink-0 w-5 h-5 inline-flex items-center justify-center rounded-full text-ink-400 hover:text-crimson hover:bg-sand-200 transition"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {KIND_ORDER.map((k) => {
                  const style = SIGNAL_STYLE[k];
                  const on = sig.kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        update(value.map((x, xi) => (xi === i ? { ...x, kind: k } : x)))
                      }
                      className={`pill text-[9px] py-0.5 px-2 border transition ${
                        on ? "" : "border-transparent opacity-45 hover:opacity-80"
                      }`}
                      style={
                        on
                          ? { backgroundColor: style.bg, color: style.dot, borderColor: style.dot }
                          : { backgroundColor: "#FCFBFF", color: "#6C6689" }
                      }
                      aria-pressed={on}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: style.dot }}
                      />
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => update([...value, { kind: "watch", text: "" }])}
            className="text-[11px] text-coral hover:underline"
          >
            + Add a signal
          </button>
        </div>
      ) : value.length === 0 && !hasAttachments ? (
        <p className="text-sm text-ink-400">No signals flagged.</p>
      ) : (
        <>
          {asks.length > 0 && (
            <div className="mb-3 rounded-xl border border-[#D6473F33] bg-[#D6473F0A] px-3.5 py-3">
              <p className="text-[9px] uppercase tracking-[0.16em] font-semibold text-[#B03A33] mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D6473F] animate-pulse" />
                Waiting on you
              </p>
              <ul className="space-y-2">
                {asks.map((sig, i) => {
                  const key = actionKey("signal", programmeId, sig.text);
                  const state = askState[key];
                  const handled = state !== undefined;
                  return (
                    <li key={i}>
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex-1 text-sm leading-snug ${
                            handled
                              ? "text-ink-400 line-through decoration-1"
                              : "text-ink-900 font-medium"
                          }`}
                        >
                          {sig.text}
                        </span>
                        <ActionButtons
                          actionKey={key}
                          initialStatus={state?.status ?? "open"}
                          programmeId={programmeId}
                          askText={sig.text}
                        />
                      </div>
                      <AskNote
                        actionKey={key}
                        programmeId={programmeId}
                        askText={sig.text}
                        initialText={state?.noteText ?? ""}
                        initialTo={state?.noteTo}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {rest.length > 0 && (
            <ul className="space-y-2">
              {rest.map((sig, i) => {
                const style = SIGNAL_STYLE[sig.kind];
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 pill text-[9px] py-0.5 px-2 shrink-0"
                      style={{ backgroundColor: style.bg, color: style.dot }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: style.dot }}
                      />
                      {style.label}
                    </span>
                    <span className="flex-1 text-sm leading-snug text-ink-800">{sig.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {hasAttachments && (
        <div className={!editMode && value.length > 0 ? "mt-4 pt-4 border-t border-sand-200" : "mt-4"}>
          {children}
        </div>
      )}
    </section>
  );
}
