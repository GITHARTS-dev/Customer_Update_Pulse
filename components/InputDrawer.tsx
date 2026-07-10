"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BabyElephant } from "@/components/BabyElephant";
import { getCustomer, primaryCustomer } from "@/lib/customers";
import { useCustomerId } from "@/lib/use-customer";
import { VIBE_LABEL, type Attachment, type PulseSubmission, type Vibe } from "@/lib/types";
import { VIBE_COLOR, actionKey, relativeTime } from "@/lib/helpers";
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

const FREE_TEXT_MIN = 20;
const FREE_TEXT_MIN_DISTINCT_LETTERS = 5;
const LINES_MAX = 6;
const EMPTY_LOG: CeoLog = { actions: {}, views: {}, notes: {} };

/** One programme's in-progress check-in, held in memory until the batch submit. */
interface Entry {
  accountable: string;
  vibe: Vibe;
  vibeTouched: boolean;
  peopleNote: string;
  noPeople: boolean;
  openTopics: string;
  noDecisions: boolean;
  freeText: string;
  existedThisWeek: boolean;
  files: File[];
  existingAttachments: Attachment[];
}

function countLines(raw: string): number {
  return raw.split("\n").map((l) => l.trim()).filter(Boolean).length;
}

function distinctLetters(s: string): number {
  const set = new Set<string>();
  for (const ch of s.toLowerCase()) if (/[a-z]/.test(ch)) set.add(ch);
  return set.size;
}

function isMeaningfulProse(s: string): boolean {
  const t = s.trim();
  return t.length >= FREE_TEXT_MIN && distinctLetters(t) >= FREE_TEXT_MIN_DISTINCT_LETTERS;
}

function isThisWeek(iso: string | undefined): boolean {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) / 86400000 <= 7;
}

function peopleSignalsToText(s: PulseSubmission): string {
  return s.people
    .map((p) => (p.note && p.note !== p.name ? `${p.name}: ${p.note}` : p.name))
    .join("\n");
}

function openTopicsToText(s: PulseSubmission): string {
  return s.openTopics.map((t) => t.title).join("\n");
}

function blankEntry(lead: string): Entry {
  return {
    accountable: lead,
    vibe: "going_well",
    vibeTouched: false,
    peopleNote: "",
    noPeople: false,
    openTopics: "",
    noDecisions: false,
    freeText: "",
    existedThisWeek: false,
    files: [],
    existingAttachments: []
  };
}

function entryFromExisting(s: PulseSubmission, lead: string): Entry {
  const peopleText = peopleSignalsToText(s);
  const topicsText = openTopicsToText(s);
  const thisWeek = isThisWeek(s.submittedAt);
  return {
    accountable: s.accountable ?? lead,
    vibe: s.vibe,
    vibeTouched: true,
    peopleNote: peopleText,
    noPeople: peopleText.length === 0,
    openTopics: topicsText,
    noDecisions: topicsText.length === 0,
    freeText: s.leadFreeText ?? "",
    existedThisWeek: thisWeek,
    files: [],
    existingAttachments: thisWeek ? s.attachments ?? [] : []
  };
}

interface Coverage {
  vibe: boolean;
  people: boolean;
  decisions: boolean;
  freetext: boolean;
  all: boolean;
}

function coverageOf(e: Entry | undefined): Coverage {
  if (!e) return { vibe: false, people: false, decisions: false, freetext: false, all: false };
  const vibe = e.vibeTouched;
  const people = e.noPeople || e.peopleNote.trim().length > 0;
  const decisions = e.noDecisions || e.openTopics.trim().length > 0;
  const freetext = isMeaningfulProse(e.freeText);
  return { vibe, people, decisions, freetext, all: vibe && people && decisions && freetext };
}

interface InputDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialProgrammeId?: string;
}

/**
 * The weekly check-in, as a full-screen overlay opened by typing "harts".
 * Multi-programme: the lead fills one programme, switches to another (the first
 * one's answers are kept), and so on. Everything filled is shown as chips so
 * she always sees what's captured. ONE submit sends every filled programme in a
 * single request, and the server writes all their narratives in a single Claude
 * call, not one per programme.
 */
export function InputDrawer({ isOpen, onClose, initialProgrammeId }: InputDrawerProps) {
  const router = useRouter();

  const cid = useCustomerId();
  const customer = getCustomer(cid) ?? primaryCustomer();
  const apiBase = `/api/c/${customer.id}`;
  const programmes = customer.programmes;
  const submitter = customer.submitter || "the lead";
  const byId: Record<string, (typeof programmes)[number]> = Object.fromEntries(
    programmes.map((p) => [p.id, p])
  );

  const firstId = initialProgrammeId ?? programmes[0]?.id ?? "";
  const [current, setCurrent] = useState(firstId);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [existingByProgramme, setExistingByProgramme] = useState<
    Record<string, PulseSubmission>
  >({});
  const [ceoLog, setCeoLog] = useState<CeoLog>(EMPTY_LOG);

  // Programmes the lead has actively edited this session = the ones to submit.
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const includedRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const programme = byId[current] ?? programmes[0];

  // Reset everything a moment after the drawer slides away, so reopening starts fresh.
  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      includedRef.current = new Set();
      setIncluded(new Set());
      setEntries({});
      setExistingByProgramme({});
      setCeoLog(EMPTY_LOG);
      setSubmittedCount(null);
      setWarnings([]);
      setError(null);
      setDragActive(false);
      setCurrent(firstId);
    }, 300);
    return () => clearTimeout(t);
    // firstId is stable per customer; intentionally not re-resetting on its change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Load every programme's latest submission + the CEO log ONCE when the drawer
  // opens (one GET each, covering all programmes) — for prefill and banners.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${apiBase}/submissions`).then((r) => (r.ok ? r.json() : {})),
      fetch(`${apiBase}/ceo-log`).then((r) => (r.ok ? r.json() : EMPTY_LOG))
    ])
      .then(([subs, log]: [Record<string, PulseSubmission>, CeoLog]) => {
        if (cancelled) return;
        setExistingByProgramme(subs ?? {});
        setCeoLog(log ?? EMPTY_LOG);
      })
      .catch(() => {
        if (!cancelled) {
          setExistingByProgramme({});
          setCeoLog(EMPTY_LOG);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiBase]);

  // Ensure the current programme has an entry. Pre-fill from its existing
  // submission unless the lead has already edited it this session (keep edits).
  useEffect(() => {
    if (!isOpen || !current) return;
    const lead = byId[current]?.lead ?? "";
    setEntries((prev) => {
      if (prev[current] && includedRef.current.has(current)) return prev;
      const ex = existingByProgramme[current];
      return { ...prev, [current]: ex ? entryFromExisting(ex, lead) : blankEntry(lead) };
    });
    // byId is derived from static config; current + existing drive prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, existingByProgramme, isOpen]);

  const cur = entries[current] ?? blankEntry(programme?.lead ?? "");

  function markTouched(pid: string) {
    if (!includedRef.current.has(pid)) {
      includedRef.current.add(pid);
      setIncluded(new Set(includedRef.current));
    }
  }

  function unInclude(pid: string) {
    includedRef.current.delete(pid);
    setIncluded(new Set(includedRef.current));
  }

  function patchCurrent(patch: Partial<Entry>) {
    setEntries((prev) => ({
      ...prev,
      [current]: { ...(prev[current] ?? blankEntry(programme?.lead ?? "")), ...patch }
    }));
    markTouched(current);
  }

  function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    const keyOf = (f: File) => `${f.name}:${f.size}`;
    const seen = new Set(cur.files.map(keyOf));
    const merged = [...cur.files];
    for (const f of picked) {
      const k = keyOf(f);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(f);
      }
    }
    patchCurrent({ files: merged });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (submitting) return;
    addFiles(Array.from(e.dataTransfer.files ?? []));
  }

  const includedList = programmes.filter((p) => included.has(p.id));
  const incomplete = includedList.filter((p) => !coverageOf(entries[p.id]).all);
  const readyToSubmit = includedList.length > 0 && incomplete.length === 0;

  const curCoverage = coverageOf(cur);
  const sections = [
    { key: "vibe", label: "Vibe", covered: curCoverage.vibe },
    { key: "people", label: "People", covered: curCoverage.people },
    { key: "decisions", label: "Decisions", covered: curCoverage.decisions },
    { key: "freetext", label: "Your words", covered: curCoverage.freetext }
  ];
  const missing = sections.filter((s) => !s.covered).map((s) => s.label);

  // CEO's side of the conversation for the current programme.
  const existing = existingByProgramme[current];
  const ceoNote = ceoLog.notes?.[current]?.text ?? "";
  const ceoViewedAt = ceoLog.views?.[current] ?? null;
  const ceoHasViewed = Boolean(
    ceoViewedAt && existing?.submittedAt && new Date(ceoViewedAt) >= new Date(existing.submittedAt)
  );
  const ceoTouches: CeoTouch[] = [];
  if (existing) {
    for (const topic of existing.openTopics ?? []) {
      const st = ceoLog.actions[actionKey("topic", current, topic.title)];
      if (st) ceoTouches.push({ text: topic.title, status: st.status, at: st.at });
    }
    for (const sig of existing.signals ?? []) {
      if (sig.kind !== "ask") continue;
      const st = ceoLog.actions[actionKey("signal", current, sig.text)];
      if (st) ceoTouches.push({ text: sig.text, status: st.status, at: st.at });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!readyToSubmit) return;
    setSubmitting(true);
    setError(null);
    setWarnings([]);
    try {
      // Upload each programme's picked files first (not a Claude call), so their
      // URLs can ride along with the check-in.
      const uploadWarnings: string[] = [];
      const attachmentsByProgramme: Record<string, Attachment[]> = {};
      for (const p of includedList) {
        const en = entries[p.id];
        if (!en || en.files.length === 0) continue;
        const fd = new FormData();
        fd.set("programmeId", p.id);
        en.files.forEach((f) => fd.append("files", f));
        const uRes = await fetch(`${apiBase}/attachments`, { method: "POST", body: fd });
        const uBody = await uRes.json().catch(() => ({}));
        if (!uRes.ok) {
          throw new Error(uBody.error || `File upload failed for ${p.shortName ?? p.name}`);
        }
        attachmentsByProgramme[p.id] = uBody.uploaded ?? [];
        for (const f of uBody.failed ?? []) {
          uploadWarnings.push(`${p.shortName ?? p.name}: could not upload ${f.name} (${f.error})`);
        }
      }

      const payloadEntries = includedList.map((p) => {
        const en = entries[p.id];
        return {
          programmeId: p.id,
          accountable: en.accountable || p.lead,
          vibe: en.vibe,
          peopleNote: en.noPeople ? "" : en.peopleNote,
          openTopics: en.noDecisions ? "" : en.openTopics,
          leadFreeText: en.freeText,
          attachments: [...en.existingAttachments, ...(attachmentsByProgramme[p.id] ?? [])]
        };
      });

      // ONE request → the server writes every narrative in a single Claude call.
      const res = await fetch(`${apiBase}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submittedBy: submitter, entries: payloadEntries })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const saved: PulseSubmission[] = body.saved ?? [];
      const failed: Array<{ programmeId: string; error: string }> = body.failed ?? [];
      const saveWarnings = failed.map(
        (f) => `${byId[f.programmeId]?.name ?? f.programmeId}: ${f.error}`
      );
      setWarnings([...uploadWarnings, ...saveWarnings]);
      setSubmittedCount(saved.length);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    includedRef.current = new Set();
    setIncluded(new Set());
    setEntries({});
    setSubmittedCount(null);
    setWarnings([]);
    setError(null);
    setCurrent(firstId);
  }

  return (
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
            <p className="mt-0.5 text-xs text-ink-500">
              Fill one programme, add another, then submit them all together.
            </p>
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
          {submittedCount !== null ? (
            <SuccessState
              vibe={cur.vibe}
              count={submittedCount}
              warnings={warnings}
              onAnother={startAnother}
              onClose={onClose}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="px-4 py-3 rounded-lg bg-[#F2D9D3] border border-[#E8B5A8] text-[#7E1F14] text-sm">
                  {error}
                </div>
              )}

              {/* Chips — everything filled this session, so nothing feels lost on switch */}
              {includedList.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {includedList.map((p) => {
                    const cov = coverageOf(entries[p.id]);
                    const en = entries[p.id];
                    const active = p.id === current;
                    return (
                      <span
                        key={p.id}
                        className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full border text-xs transition ${
                          active
                            ? "border-coral bg-coral/10 text-ink-900"
                            : "border-sand-200 bg-sand-50 text-ink-700"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setCurrent(p.id)}
                          className="inline-flex items-center gap-1.5"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: en?.vibeTouched ? VIBE_COLOR[en.vibe] : "#D0CBE2"
                            }}
                          />
                          {p.shortName ?? p.name}
                          <span className={cov.all ? "text-leaf" : "text-amber"}>
                            {cov.all ? "✓" : "…"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => unInclude(p.id)}
                          aria-label={`Remove ${p.name}`}
                          className="ml-0.5 w-4 h-4 inline-flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 hover:bg-sand-200"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {cur.existedThisWeek && (
                <div className="px-4 py-3 rounded-lg bg-[#F8E7CC] border border-[#E8C685] text-[#7A4A0E] text-sm flex items-start gap-3">
                  <span className="leading-none">↻</span>
                  <div>
                    <strong>{programme?.name} was already checked in this week.</strong>{" "}
                    Submitting again overwrites it. The form is pre-filled with what was there.
                  </div>
                </div>
              )}

              {ceoTouches.length > 0 && <CeoTouchesBanner touches={ceoTouches} />}

              {ceoNote.trim().length > 0 && (
                <div className="px-4 py-3 rounded-lg bg-[#ECEAF7] border border-[#D0CBE2] flex items-start gap-3">
                  <span className="leading-none">✉</span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#6C6689] mb-0.5">
                      A note from Sreema
                    </p>
                    <p className="text-sm text-ink-800 whitespace-pre-wrap break-words">{ceoNote}</p>
                  </div>
                </div>
              )}

              {ceoHasViewed && ceoViewedAt && (
                <p className="text-[11px] text-ink-500 flex items-center gap-1.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-leaf shrink-0" />
                  Sreema viewed your last check-in {relativeTime(ceoViewedAt)}.
                </p>
              )}

              <section className="card px-5 py-4">
                <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-2">
                  Programme
                </label>
                <select
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  disabled={loading || submitting}
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-coral/40 disabled:opacity-60"
                >
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {included.has(p.id) ? "  ✓ added" : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-ink-500">
                    Checked in by <span className="text-ink-700">{submitter}</span>
                  </p>
                  {loading && <span className="text-[10px] text-ink-400">loading…</span>}
                </div>
              </section>

              <section className="card px-5 py-4">
                <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-2">
                  Accountable for this programme
                </label>
                <input
                  value={cur.accountable}
                  onChange={(e) => patchCurrent({ accountable: e.target.value })}
                  placeholder={programme?.lead}
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40"
                />
              </section>

              <SectionCard label="How does it feel this week?" covered={curCoverage.vibe}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["going_well", "watch_it", "stuck", "quiet_week"] as Vibe[]).map((v) => {
                    const selected = cur.vibe === v && cur.vibeTouched;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => patchCurrent({ vibe: v, vibeTouched: true })}
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
                  {cur.vibeTouched ? VIBE_HELP[cur.vibe] : "Pick the one that fits this week."}
                </p>
              </SectionCard>

              <SectionCard label="People signals" covered={curCoverage.people}>
                <p className="text-[11px] text-ink-500 mb-2">Key People. One per line, up to {LINES_MAX}.</p>
                <textarea
                  value={cur.peopleNote}
                  onChange={(e) =>
                    patchCurrent({
                      peopleNote: e.target.value,
                      ...(e.target.value.trim().length > 0 ? { noPeople: false } : {})
                    })
                  }
                  disabled={cur.noPeople}
                  rows={3}
                  placeholder="Share anything about people worth knowing this week"
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <LineCounter value={cur.peopleNote} disabled={cur.noPeople} />
                <SkipCheckbox
                  label="Nothing notable on people this week"
                  checked={cur.noPeople}
                  onChange={(c) => patchCurrent({ noPeople: c, ...(c ? { peopleNote: "" } : {}) })}
                />
              </SectionCard>

              <SectionCard label="Open decisions" covered={curCoverage.decisions}>
                <p className="text-[11px] text-ink-500 mb-2">What needs a call this week? One per line, up to {LINES_MAX}.</p>
                <textarea
                  value={cur.openTopics}
                  onChange={(e) =>
                    patchCurrent({
                      openTopics: e.target.value,
                      ...(e.target.value.trim().length > 0 ? { noDecisions: false } : {})
                    })
                  }
                  disabled={cur.noDecisions}
                  rows={3}
                  placeholder="Tell if there are any discussions or decisions waiting"
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <LineCounter value={cur.openTopics} disabled={cur.noDecisions} />
                <SkipCheckbox
                  label="No decisions needed this week"
                  checked={cur.noDecisions}
                  onChange={(c) => patchCurrent({ noDecisions: c, ...(c ? { openTopics: "" } : {}) })}
                />
              </SectionCard>

              <SectionCard label="In your own words" covered={curCoverage.freetext}>
                <p className="text-[11px] text-ink-500 mb-2">How would you describe the week to Sreema?</p>
                <textarea
                  value={cur.freeText}
                  onChange={(e) => patchCurrent({ freeText: e.target.value })}
                  rows={3}
                  placeholder="Describe how the week felt, in your own words"
                  className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none"
                />
                {!curCoverage.freetext && cur.freeText.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    {cur.freeText.trim().length < FREE_TEXT_MIN
                      ? `A few more words. ${FREE_TEXT_MIN - cur.freeText.trim().length} to go.`
                      : "A real sentence, please — the CEO reads this."}
                  </p>
                )}
              </SectionCard>

              <section className="card px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400">
                    Files &amp; folders for Sreema (optional)
                  </label>
                  <span className="text-[9px] text-ink-400">she can download these</span>
                </div>
                <p className="text-[11px] text-ink-500 mb-3">
                  Attach anything worth a look — a PDF, a spreadsheet, a deck. Got a whole folder?
                  Zip it and drop it in. They are not read or summarised by AI.
                </p>

                {cur.existingAttachments.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {cur.existingAttachments.map((a) => (
                      <li key={a.url} className="flex items-center gap-2 text-[12px] text-ink-700">
                        <FileIcon />
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate hover:text-coral hover:underline"
                          title="View this file"
                        >
                          {a.name}
                        </a>
                        <span className="text-[10px] text-ink-400 shrink-0">already attached</span>
                        <button
                          type="button"
                          onClick={() =>
                            patchCurrent({
                              existingAttachments: cur.existingAttachments.filter(
                                (x) => x.url !== a.url
                              )
                            })
                          }
                          className="ml-auto text-ink-400 hover:text-crimson text-sm leading-none shrink-0"
                          aria-label={`Remove ${a.name}`}
                          title="Remove on submit"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {cur.files.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {cur.files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-[12px] text-ink-800">
                        <FileIcon />
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] text-ink-400 shrink-0">
                          {(f.size / 1024 / 1024).toFixed(f.size < 1024 * 1024 ? 2 : 1)} MB
                        </span>
                        <button
                          type="button"
                          onClick={() => patchCurrent({ files: cur.files.filter((_, idx) => idx !== i) })}
                          className="ml-auto text-ink-400 hover:text-crimson text-sm leading-none shrink-0"
                          aria-label={`Remove ${f.name}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!submitting) setDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                  }}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-1.5 px-4 py-6 rounded-xl border-2 border-dashed cursor-pointer text-center transition ${
                    dragActive
                      ? "border-coral bg-coral/5"
                      : "border-sand-300 bg-sand-50 hover:border-coral/50 hover:bg-coral/[0.02]"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-7 h-7 text-coral"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 16V4" />
                    <path d="M7 9l5-5 5 5" />
                    <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
                  </svg>
                  <span className="text-sm font-medium text-ink-800">
                    Drag files here, or <span className="text-coral">browse</span>
                  </span>
                  <span className="text-[10px] text-ink-400">
                    Any format, up to 25 MB each. Zip a folder to send it whole.
                  </span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    disabled={submitting}
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                </label>
              </section>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2">
                <div className="text-[11px] text-ink-500 min-w-0">
                  {includedList.length === 0 ? (
                    <span>Start filling this programme to add it.</span>
                  ) : readyToSubmit ? (
                    <span className="text-leaf">
                      {includedList.length} {includedList.length === 1 ? "programme" : "programmes"}{" "}
                      ready to send.
                    </span>
                  ) : (
                    <span>
                      Finish:{" "}
                      <span className="text-ink-800 font-medium">
                        {incomplete.map((p) => p.shortName ?? p.name).join(", ")}
                      </span>
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!readyToSubmit || submitting || loading}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition shadow-card disabled:bg-sand-300 disabled:text-ink-400 disabled:cursor-not-allowed disabled:shadow-none shrink-0"
                >
                  {submitting
                    ? "Submitting…"
                    : includedList.length > 1
                      ? `Submit ${includedList.length} check-ins`
                      : "Submit check-in"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Progress footer — current programme's section coverage */}
      {submittedCount === null && (
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
              {programme?.shortName ?? programme?.name}: {sections.filter((s) => s.covered).length} of{" "}
              {sections.length} sections
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SuccessState({
  vibe,
  count,
  warnings,
  onAnother,
  onClose
}: {
  vibe: Vibe;
  count: number;
  warnings: string[];
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
        {count === 1 ? "1 programme check-in is in." : `${count} programme check-ins are in.`} Claude
        has written the narratives and the CEO view is updated.
      </p>
      {warnings.length > 0 && (
        <div className="mt-4 mx-auto max-w-sm px-4 py-3 rounded-lg bg-[#F8E7CC] border border-[#E8C685] text-[#7A4A0E] text-sm text-left">
          <p className="font-medium mb-1">Some did not save:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 flex justify-center gap-2.5 flex-wrap">
        <button
          onClick={onAnother}
          className="px-4 py-2 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition"
        >
          Start a new check-in
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-full bg-sand-100 text-ink-700 text-sm font-medium hover:bg-sand-200 transition"
        >
          Back to pulse
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  label,
  covered,
  children
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
  label,
  checked,
  onChange
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

function FileIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="w-3.5 h-3.5 shrink-0 text-ink-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9 1.5Z" />
      <path d="M9 1.5V5.5H13" />
    </svg>
  );
}

function LineCounter({ value, disabled }: { value: string; disabled: boolean }) {
  if (disabled) return null;
  const n = countLines(value);
  if (n === 0) return null;
  const over = n > LINES_MAX;
  return (
    <p className={`mt-1.5 text-[11px] ${over ? "text-amber font-medium" : "text-ink-400"}`}>
      {n} / {LINES_MAX} lines
      {over && ` — only the first ${LINES_MAX} will be sent`}
    </p>
  );
}

function CeoTouchesBanner({ touches }: { touches: CeoTouch[] }) {
  const counts = touches.reduce<Record<ActionStatus, number>>(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    { done: 0, noted: 0, dismissed: 0 }
  );
  const summary = (["done", "noted", "dismissed"] as ActionStatus[])
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${STATUS_META[s].label.toLowerCase()}`)
    .join(" · ");

  return (
    <div className="px-4 py-3 rounded-lg bg-[#EEEAFB] border border-[#D3C7F2] text-ink-800 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-[#4A2E9E]">Sreema reviewed your last check-in</p>
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
