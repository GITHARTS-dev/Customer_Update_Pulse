"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BabyElephant } from "@/components/BabyElephant";
import { PROGRAMMES } from "@/lib/programmes";
import { VIBE_LABEL, type PulseSubmission, type Vibe } from "@/lib/types";
import { VIBE_COLOR, actionKey } from "@/lib/helpers";
import type { ActionStatus, CeoLog } from "@/lib/ceo-store";

interface CeoTouch {
  text: string;
  status: ActionStatus;
  at: string;
}

const STATUS_META: Record<ActionStatus, { label: string; bg: string; fg: string; icon: string }> = {
  done: { label: "Done", bg: "#E1F0E7", fg: "#2F6A4A", icon: "✓" },
  noted: { label: "Noted", bg: "#ECEAF7", fg: "#6C6689", icon: "•" },
  dismissed: { label: "Not now", bg: "#F8E7CC", fg: "#7A4A0E", icon: "⏸" }
};

const VIBE_HELP: Record<Vibe, string> = {
  going_well: "Energy is up, things are moving, no decisions waiting.",
  watch_it: "Something has cooled, a person, a date, or a decision is wobbling.",
  stuck: "Waiting on something important. A little help this week would go a long way.",
  quiet_week: "Nothing material to flag, scoping or early phase."
};

/** Check-ins are always entered by Srimathi on behalf of the programmes. */
const SUBMITTER = "Srimathi Ravi";

const FREE_TEXT_MIN = 20;
const FREE_TEXT_MIN_DISTINCT_LETTERS = 5;
const LINES_MAX = 6;

function countLines(raw: string): number {
  return raw.split("\n").map((l) => l.trim()).filter(Boolean).length;
}

function distinctLetters(s: string): number {
  const set = new Set<string>();
  for (const ch of s.toLowerCase()) {
    if (/[a-z]/.test(ch)) set.add(ch);
  }
  return set.size;
}

function isMeaningfulProse(s: string): boolean {
  const trimmed = s.trim();
  return (
    trimmed.length >= FREE_TEXT_MIN &&
    distinctLetters(trimmed) >= FREE_TEXT_MIN_DISTINCT_LETTERS
  );
}

function isThisWeek(iso: string | undefined): boolean {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) / 86400000 <= 7;
}

function peopleSignalsToText(s: PulseSubmission | null): string {
  if (!s || s.people.length === 0) return "";
  return s.people.map((p) => (p.note ? `${p.name}: ${p.note}` : p.name)).join("\n");
}

function openTopicsToText(s: PulseSubmission | null): string {
  if (!s || s.openTopics.length === 0) return "";
  return s.openTopics.map((t) => t.title).join("\n");
}

interface InputDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialProgrammeId?: string;
}

export function InputDrawer({ isOpen, onClose, initialProgrammeId }: InputDrawerProps) {
  const router = useRouter();

  const [programmeId, setProgrammeId] = useState(initialProgrammeId ?? PROGRAMMES[0].id);
  const [accountable, setAccountable] = useState("");
  const [vibe, setVibe] = useState<Vibe>("going_well");
  const [vibeTouched, setVibeTouched] = useState(false);
  const [peopleNote, setPeopleNote] = useState("");
  const [noPeople, setNoPeople] = useState(false);
  const [openTopics, setOpenTopics] = useState("");
  const [noDecisions, setNoDecisions] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [existing, setExisting] = useState<PulseSubmission | null>(null);
  const [ceoTouches, setCeoTouches] = useState<CeoTouch[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const programme =
    PROGRAMMES.find((p) => p.id === programmeId) ?? PROGRAMMES[0];

  // Reset state after drawer slides out
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => {
        setSubmitted(false);
        setError(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Load existing submission + CEO actions on open or programme change
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [subRes, logRes] = await Promise.all([
          fetch(`/api/submissions/${programmeId}`),
          fetch(`/api/ceo-log`)
        ]);
        const data: PulseSubmission | null = await subRes.json();
        const log: CeoLog = logRes.ok ? await logRes.json() : { actions: {}, views: {} };
        if (cancelled) return;
        setExisting(data);
        if (data) {
          setVibe(data.vibe);
          setVibeTouched(true);
          setAccountable(data.accountable ?? programme.lead);
          const pt = peopleSignalsToText(data);
          const tt = openTopicsToText(data);
          setPeopleNote(pt);
          setNoPeople(pt.length === 0);
          setOpenTopics(tt);
          setNoDecisions(tt.length === 0);
          setFreeText(data.leadFreeText ?? "");

          const touches: CeoTouch[] = [];
          for (const topic of data.openTopics ?? []) {
            const state = log.actions[actionKey("topic", programmeId, topic.title)];
            if (state) touches.push({ text: topic.title, status: state.status, at: state.at });
          }
          for (const sig of data.signals ?? []) {
            if (sig.kind !== "ask") continue;
            const state = log.actions[actionKey("signal", programmeId, sig.text)];
            if (state) touches.push({ text: sig.text, status: state.status, at: state.at });
          }
          setCeoTouches(touches);
        } else {
          setVibe("going_well");
          setVibeTouched(false);
          setAccountable(programme.lead);
          setPeopleNote("");
          setNoPeople(false);
          setOpenTopics("");
          setNoDecisions(false);
          setFreeText("");
          setCeoTouches([]);
        }
      } catch (err) {
        if (!cancelled) setError(`Could not load existing: ${err}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [programmeId, programme.lead, isOpen]);

  const vibeCovered = vibeTouched;
  const peopleCovered = noPeople || peopleNote.trim().length > 0;
  const decisionsCovered = noDecisions || openTopics.trim().length > 0;
  const freeTextCovered = isMeaningfulProse(freeText);

  const sections = [
    { key: "vibe", label: "Vibe", covered: vibeCovered },
    { key: "people", label: "People", covered: peopleCovered },
    { key: "decisions", label: "Decisions", covered: decisionsCovered },
    { key: "freetext", label: "Your words", covered: freeTextCovered }
  ];
  const allCovered = sections.every((s) => s.covered) && (accountable || programme.lead).trim().length > 0;
  const missing = sections.filter((s) => !s.covered).map((s) => s.label);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allCovered) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submittedBy: SUBMITTER,
          entries: [
            {
              programmeId,
              accountable: accountable || programme.lead,
              vibe,
              peopleNote: noPeople ? "" : peopleNote,
              openTopics: noDecisions ? "" : openTopics,
              leadFreeText: freeText
            }
          ]
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      setSubmitted(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const editingThisWeek = isThisWeek(existing?.submittedAt);
  const editingOld = existing && !editingThisWeek;

  return (
    <>
      {/* Full-page panel */}
      <div
        className={`fixed inset-0 z-50 bg-cream flex flex-col transition-all duration-300 ease-out ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="border-b border-sand-200 shrink-0">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl sm:text-2xl text-ink-900">Weekly check-in</h2>
              <p className="mt-0.5 text-xs text-ink-500">Cover all four sections, then submit.</p>
            </div>
            <button
              onClick={onClose}
              className="mt-0.5 p-1.5 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition"
              aria-label="Close"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 3 L13 13 M13 3 L3 13" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          {submitted ? (
            <SuccessState
              vibe={vibe}
              programmeName={programme.name}
              programmeId={programmeId}
              onAnother={() => { setSubmitted(false); setExisting(null); }}
              onClose={onClose}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="px-4 py-3 rounded-lg bg-[#F2D9D3] border border-[#E8B5A8] text-[#7E1F14] text-sm">
                  {error}
                </div>
              )}

              {ceoTouches.length > 0 && <CeoTouchesBanner touches={ceoTouches} />}

              {editingThisWeek && (
                <div className="px-4 py-3 rounded-lg bg-[#F8E7CC] border border-[#E8C685] text-[#7A4A0E] text-sm flex items-start gap-3">
                  <span className="leading-none">↻</span>
                  <div>
                    <strong>You already checked in this week.</strong> Submitting again will overwrite your earlier note.
                  </div>
                </div>
              )}

              {editingOld && (
                <div className="px-4 py-3 rounded-lg bg-sand-50 border border-sand-200 text-ink-700 text-sm flex items-start gap-3">
                  <span className="leading-none">↻</span>
                  <div>Last check-in was over a week ago. Pre-filled so you can refresh it.</div>
                </div>
              )}

              <section className="card px-5 py-4">
                <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-2">
                  Programme
                </label>
                <select
                  value={programmeId}
                  onChange={(e) => setProgrammeId(e.target.value)}
                  disabled={loading || submitting}
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-coral/40 disabled:opacity-60"
                >
                  {PROGRAMMES.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-ink-500">
                    Checked in by <span className="text-ink-700">{SUBMITTER}</span>
                  </p>
                  {loading && <span className="text-[10px] text-ink-400">loading…</span>}
                </div>
              </section>

              <section className="card px-5 py-4">
                <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-2">
                  Accountable for this programme
                </label>
                <input
                  value={accountable}
                  onChange={(e) => setAccountable(e.target.value)}
                  placeholder={programme.lead}
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40"
                />
              </section>

              <SectionCard label="How does it feel this week?" covered={vibeCovered}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["going_well", "watch_it", "stuck", "quiet_week"] as Vibe[]).map((v) => {
                    const selected = vibe === v && vibeTouched;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => { setVibe(v); setVibeTouched(true); }}
                        className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 transition ${
                          selected ? "bg-cream" : "bg-sand-50 border-sand-200 hover:border-sand-300"
                        }`}
                        style={selected ? { borderColor: VIBE_COLOR[v] } : undefined}
                      >
                        <BabyElephant vibe={v} size={52} background={false} animated={selected} />
                        <span className="text-[11px] font-medium text-ink-900">{VIBE_LABEL[v]}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-ink-500">
                  {vibeTouched ? VIBE_HELP[vibe] : "Pick the one that fits this week."}
                </p>
              </SectionCard>

              <SectionCard label="People signals" covered={peopleCovered}>
                <p className="text-[11px] text-ink-500 mb-2">Anyone leaning in? Anyone cooling? One per line, up to {LINES_MAX}.</p>
                <textarea
                  value={peopleNote}
                  onChange={(e) => { setPeopleNote(e.target.value); if (e.target.value.trim().length > 0) setNoPeople(false); }}
                  disabled={noPeople}
                  rows={3}
                  placeholder="Share anything about people worth knowing this week"
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <LineCounter value={peopleNote} disabled={noPeople} />
                <SkipCheckbox
                  label="Nothing notable on people this week"
                  checked={noPeople}
                  onChange={(c) => { setNoPeople(c); if (c) setPeopleNote(""); }}
                />
              </SectionCard>

              <SectionCard label="Open decisions" covered={decisionsCovered}>
                <p className="text-[11px] text-ink-500 mb-2">What needs a call this week? One per line, up to {LINES_MAX}.</p>
                <textarea
                  value={openTopics}
                  onChange={(e) => { setOpenTopics(e.target.value); if (e.target.value.trim().length > 0) setNoDecisions(false); }}
                  disabled={noDecisions}
                  rows={3}
                  placeholder="Tell if there are any discussions or decisions waiting"
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <LineCounter value={openTopics} disabled={noDecisions} />
                <SkipCheckbox
                  label="No decisions needed this week"
                  checked={noDecisions}
                  onChange={(c) => { setNoDecisions(c); if (c) setOpenTopics(""); }}
                />
              </SectionCard>

              <SectionCard label="In your own words" covered={freeTextCovered}>
                <p className="text-[11px] text-ink-500 mb-2">How would you describe the week to Sreema over coffee?</p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  rows={3}
                  placeholder="Describe how the week felt, in your own words"
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none"
                />
                {!freeTextCovered && freeText.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    {freeText.trim().length < FREE_TEXT_MIN
                      ? `A few more words. ${FREE_TEXT_MIN - freeText.trim().length} to go.`
                      : "A real sentence, please — the CEO reads this."}
                  </p>
                )}
              </SectionCard>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2">
                <div className="text-[11px] text-ink-500 min-w-0">
                  {allCovered ? (
                    <span className="text-leaf">All sections covered. Ready to send.</span>
                  ) : (
                    <span>
                      Still to cover:{" "}
                      <span className="text-ink-800 font-medium">{missing.join(", ")}</span>
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!allCovered || submitting || loading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition shadow-card disabled:bg-sand-300 disabled:text-ink-400 disabled:cursor-not-allowed disabled:shadow-none shrink-0"
                >
                  {submitting ? "Submitting…" : editingThisWeek ? "Overwrite check-in" : "Submit check-in"}
                </button>
              </div>
            </form>
          )}
        </div>
        </div>

        {/* Progress footer */}
        {!submitted && (
          <div className="border-t border-sand-200 shrink-0">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {sections.map((s) => (
                <span
                  key={s.key}
                  className="w-6 h-1.5 rounded-full transition-colors duration-200"
                  style={{ backgroundColor: s.covered ? "#3BA46A" : "#D0CBE2" }}
                  title={`${s.label}: ${s.covered ? "covered" : "to do"}`}
                />
              ))}
            </div>
            <span className="text-[10px] text-ink-400">
              {sections.filter((s) => s.covered).length} of {sections.length} sections
            </span>
          </div>
          </div>
        )}
      </div>
    </>
  );
}

function SuccessState({
  vibe, programmeName, programmeId, onAnother, onClose
}: {
  vibe: Vibe;
  programmeName: string;
  programmeId: string;
  onAnother: () => void;
  onClose: () => void;
}) {
  return (
    <div className="text-center py-10 px-4">
      <div className="flex justify-center mb-4">
        <BabyElephant vibe={vibe} size={120} animated />
      </div>
      <h3 className="font-serif text-2xl text-ink-900">Thank you.</h3>
      <p className="mt-3 text-sm text-ink-500 max-w-sm mx-auto">
        Your check-in for <strong className="text-ink-800">{programmeName}</strong> is in.
        Claude has written the narrative and the CEO view is updated.
      </p>
      <div className="mt-6 flex justify-center gap-2.5 flex-wrap">
        <button
          onClick={onAnother}
          className="px-4 py-2 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition"
        >
          Submit another
        </button>
        <Link
          href={`/programme/${programmeId}`}
          onClick={onClose}
          className="px-4 py-2 rounded-full bg-sand-200 text-ink-800 text-sm font-medium hover:bg-sand-300 transition"
        >
          View this programme
        </Link>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-full bg-sand-100 text-ink-700 text-sm font-medium hover:bg-sand-200 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  label, covered, children
}: {
  label: string;
  covered: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400">{label}</label>
        <span
          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
          style={
            covered
              ? { backgroundColor: "#E1F0E7", color: "#2F6A4A" }
              : { backgroundColor: "#ECEAF7", color: "#948FAB" }
          }
        >
          {covered ? "covered" : "to do"}
        </span>
      </div>
      {children}
    </section>
  );
}

function SkipCheckbox({
  label, checked, onChange
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="mt-2 flex items-center gap-2 cursor-pointer text-[11px] text-ink-600 hover:text-ink-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-sand-300 text-coral focus:ring-coral/40"
      />
      {label}
    </label>
  );
}

function LineCounter({ value, disabled }: { value: string; disabled: boolean }) {
  if (disabled) return null;
  const n = countLines(value);
  if (n === 0) return null;
  const over = n > LINES_MAX;
  return (
    <p
      className={`mt-1.5 text-[11px] ${
        over ? "text-amber font-medium" : "text-ink-400"
      }`}
    >
      {n} / {LINES_MAX} lines
      {over && ` — only the first ${LINES_MAX} will be sent`}
    </p>
  );
}

function CeoTouchesBanner({ touches }: { touches: CeoTouch[] }) {
  const counts = touches.reduce<Record<ActionStatus, number>>(
    (acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; },
    { done: 0, noted: 0, dismissed: 0 }
  );
  const summary = (["done", "noted", "dismissed"] as ActionStatus[])
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${STATUS_META[s].label.toLowerCase()}`)
    .join(" · ");

  return (
    <div className="px-4 py-3 rounded-lg bg-[#EEEAFB] border border-[#D3C7F2] text-ink-800 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-[#4A2E9E]">
          Sreema reviewed your last check-in
        </p>
        <span className="text-[11px] text-ink-500">{summary}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {touches.map((t, i) => {
          const m = STATUS_META[t.status];
          return (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <span
                className="mt-0.5 pill text-[9px] py-0.5 px-1.5 shrink-0"
                style={{ backgroundColor: m.bg, color: m.fg }}
              >
                <span aria-hidden>{m.icon}</span>
                {m.label}
              </span>
              <span className="text-ink-700 leading-snug">{t.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
