"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BabyElephant } from "@/components/BabyElephant";
import { getCustomer, primaryCustomer } from "@/lib/customers";
import { useCustomerId } from "@/lib/use-customer";
import { VIBE_LABEL, type Attachment, type Programme, type PulseSubmission, type Vibe } from "@/lib/types";
import { VIBE_COLOR, actionKey, relativeTime } from "@/lib/helpers";
import { personById } from "@/lib/people";
import type { ActionStatus, CeoLog } from "@/lib/ceo-store";

interface CeoTouch {
  text: string;
  status?: ActionStatus;
  at: string;
  /** Sreema's note in reply to this ask, if any, and who she directed it to. */
  note?: string;
  to?: string;
}

const STATUS_META: Record<ActionStatus, { label: string; bg: string; fg: string; icon: string }> = {
  need_info: { label: "Need more info", bg: "#F8E7CC", fg: "#7A4A0E", icon: "?" },
  noted: { label: "Noted", bg: "#ECEAF7", fg: "#6C6689", icon: "•" },
  lets_talk: { label: "Let's talk", bg: "#E1F0E7", fg: "#2F6A4A", icon: "☎" }
};

const VIBE_HELP: Record<Vibe, string> = {
  going_well: "Energy is up, things are moving, no decisions waiting.",
  watch_it: "Something has cooled, a person, a date, or a decision is wobbling.",
  stuck: "Waiting on something important. A little help this week would go a long way."
};

const FREE_TEXT_MIN = 20;
const FREE_TEXT_MIN_DISTINCT_LETTERS = 5;
const LINES_MAX = 6;
const EMPTY_LOG: CeoLog = { actions: {}, views: {}, notes: {}, leadViews: {} };

/** One programme's in-progress check-in, held in memory until the batch submit. */
interface Entry {
  accountable: string;
  vibe: Vibe;
  vibeTouched: boolean;
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

function openTopicsToText(s: PulseSubmission): string {
  return s.openTopics.map((t) => t.title).join("\n");
}

function blankEntry(lead: string): Entry {
  return {
    accountable: lead,
    vibe: "going_well",
    vibeTouched: false,
    openTopics: "",
    noDecisions: false,
    freeText: "",
    existedThisWeek: false,
    files: [],
    existingAttachments: []
  };
}

function entryFromExisting(s: PulseSubmission, lead: string): Entry {
  const topicsText = openTopicsToText(s);
  const thisWeek = isThisWeek(s.submittedAt);
  return {
    accountable: s.accountable ?? lead,
    vibe: s.vibe,
    vibeTouched: true,
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
  decisions: boolean;
  freetext: boolean;
  all: boolean;
}

function coverageOf(e: Entry | undefined): Coverage {
  if (!e) return { vibe: false, decisions: false, freetext: false, all: false };
  const vibe = e.vibeTouched;
  const decisions = e.noDecisions || e.openTopics.trim().length > 0;
  const freetext = isMeaningfulProse(e.freeText);
  return { vibe, decisions, freetext, all: vibe && decisions && freetext };
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
  const submitter = customer.submitter || "the lead";

  // Starts from config for an instant list, then swaps to the resolved list
  // (config + any programmes the lead added) once it loads.
  const [programmes, setProgrammes] = useState<Programme[]>(customer.programmes);
  const byId: Record<string, Programme> = Object.fromEntries(programmes.map((p) => [p.id, p]));

  const firstId = initialProgrammeId ?? customer.programmes[0]?.id ?? "";
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
  // Closing wipes every filled-in programme, so a close with work in progress
  // asks first rather than discarding a batch on a stray Esc or click.
  const [confirmClose, setConfirmClose] = useState(false);
  // Programmes the lead has looked at this session - clears the "new" badge
  // optimistically. setSeenTick just forces a re-render when the ref changes.
  const seenRef = useRef<Set<string>>(new Set());
  const [, setSeenTick] = useState(0);

  const programme = byId[current] ?? programmes[0];

  // Sreema's most recent activity on a programme (a note, or any action touch),
  // so a "new" badge can surface a response before the lead opens that programme.
  function ceoActivityAt(pid: string): string | null {
    let latest: string | null = null;
    for (const st of Object.values(ceoLog.actions)) {
      if (st.programmeId === pid && st.at && (!latest || st.at > latest)) latest = st.at;
    }
    for (const n of Object.values(ceoLog.notes)) {
      if (n.programmeId === pid && n.at && (!latest || n.at > latest)) latest = n.at;
    }
    return latest;
  }
  function isUnseen(pid: string): boolean {
    if (seenRef.current.has(pid)) return false;
    const at = ceoActivityAt(pid);
    if (!at) return false;
    const lv = ceoLog.leadViews?.[pid];
    return !lv || at > lv;
  }

  // Reset everything a moment after the drawer slides away, so reopening starts fresh.
  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      includedRef.current = new Set();
      seenRef.current = new Set();
      setIncluded(new Set());
      setEntries({});
      setExistingByProgramme({});
      setCeoLog(EMPTY_LOG);
      setSubmittedCount(null);
      setWarnings([]);
      setError(null);
      setDragActive(false);
      setConfirmClose(false);
      setCurrent(firstId);
    }, 300);
    return () => clearTimeout(t);
    // firstId is stable per customer; intentionally not re-resetting on its change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Esc is handled here rather than by the shortcut provider, because only the
  // drawer knows whether closing would throw away a filled-in batch.
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmClose) {
        setConfirmClose(false);
        return;
      }
      if (includedRef.current.size > 0 && submittedCount === null) setConfirmClose(true);
      else onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, confirmClose, submittedCount, onClose]);

  // A reload would drop the whole batch - it is only ever held in memory.
  // Keyed off the `included` set rather than the derived list, which is not
  // declared until further down.
  useEffect(() => {
    if (!isOpen || included.size === 0 || submittedCount !== null) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isOpen, included, submittedCount]);

  // Load every programme's latest submission + the CEO log ONCE when the drawer
  // opens (one GET each, covering all programmes) - for prefill and banners.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${apiBase}/submissions`).then((r) => (r.ok ? r.json() : {})),
      fetch(`${apiBase}/ceo-log`).then((r) => (r.ok ? r.json() : EMPTY_LOG)),
      fetch(`${apiBase}/programmes`).then((r) => (r.ok ? r.json() : null))
    ])
      .then(
        ([subs, log, prog]: [
          Record<string, PulseSubmission>,
          CeoLog,
          { programmes?: Programme[] } | null
        ]) => {
          if (cancelled) return;
          setExistingByProgramme(subs ?? {});
          setCeoLog(log ?? EMPTY_LOG);
          if (prog?.programmes && prog.programmes.length > 0) setProgrammes(prog.programmes);
        }
      )
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

  // When the lead opens a programme carrying unseen activity, quietly mark it
  // seen (locally + persisted), so its "new" badge clears once she's looking.
  useEffect(() => {
    if (!isOpen || !current || !isUnseen(current)) return;
    seenRef.current.add(current);
    setSeenTick((t) => t + 1);
    fetch(`${apiBase}/ceo-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "leadView", programmeId: current })
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, isOpen, ceoLog]);

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

  // Work that would be lost if the drawer closed right now.
  const hasUnsaved = includedList.length > 0 && submittedCount === null;

  /** Close, unless there is unsent work - then ask first. */
  function requestClose() {
    if (hasUnsaved) setConfirmClose(true);
    else onClose();
  }

  const curCoverage = coverageOf(cur);
  const sections = [
    { key: "vibe", label: "Vibe", covered: curCoverage.vibe },
    { key: "decisions", label: "Decisions", covered: curCoverage.decisions },
    { key: "freetext", label: "Your words", covered: curCoverage.freetext }
  ];

  // CEO's side of the conversation for the current programme: her response
  // (status) and/or note on each ask this week.
  const existing = existingByProgramme[current];
  const ceoViewedAt = ceoLog.views?.[current] ?? null;
  const ceoHasViewed = Boolean(
    ceoViewedAt && existing?.submittedAt && new Date(ceoViewedAt) >= new Date(existing.submittedAt)
  );
  const ceoTouches: CeoTouch[] = [];
  if (existing) {
    for (const sig of existing.signals ?? []) {
      if (sig.kind !== "ask") continue;
      const key = actionKey("signal", current, sig.text);
      const st = ceoLog.actions[key];
      const note = ceoLog.notes[key];
      if (st || note) {
        ceoTouches.push({
          text: sig.text,
          status: st?.status,
          at: st?.at ?? note?.at ?? "",
          note: note?.text,
          to: note?.to
        });
      }
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
      className={`fixed inset-0 z-50 dawn-wash flex flex-col transition-all duration-300 ease-out ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Header */}
      <div className="border-b border-sand-200 shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl sm:text-2xl text-ink-900">Weekly check-in</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Fill one programme, add another, then submit them all together.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <p className="mt-0.5 hidden sm:block text-[11px] text-ink-500 text-right">
              Checked in by
              <br />
              <span className="text-ink-800 font-medium">{submitter}</span>
            </p>
            <button
              onClick={requestClose}
              className="mt-0.5 p-1.5 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition"
              aria-label="Close"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 3 L13 13 M13 3 L3 13" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          {submittedCount !== null ? (
            <SuccessState
              vibe={cur.vibe}
              count={submittedCount}
              warnings={warnings}
              onAnother={startAnother}
              onClose={onClose}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="px-4 py-3 rounded-lg bg-[#F2D9D3] border border-[#E8B5A8] text-[#7E1F14] text-sm">
                  {error}
                </div>
              )}

              {/* Programme rail: every programme at a glance, tap any to jump -
                  replaces the old dropdown entirely */}
              <ProgrammeRail
                programmes={programmes}
                current={current}
                setCurrent={setCurrent}
                entries={entries}
                existingByProgramme={existingByProgramme}
                included={included}
                isUnseen={isUnseen}
                loading={loading}
              />

              {!included.has(current) && existingByProgramme[current] && (
                <SameAsLastWeekBanner
                  programme={programme}
                  existing={existingByProgramme[current]}
                  onKeep={() => markTouched(current)}
                />
              )}

              <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-0">
                {/* Sidebar: Sreema context, so the space beside the fields on
                    wide screens holds something useful instead of sitting
                    empty. Comes first in the DOM so it still reads naturally
                    above the fields when stacked on mobile. A hairline divider
                    (bottom on mobile, left on desktop) keeps it visually
                    distinct from the fields rather than blending together. */}
                <aside className="order-1 lg:order-2 lg:w-72 lg:shrink-0 space-y-4 pb-5 border-b border-sand-200 lg:pb-0 lg:border-b-0 lg:border-l lg:border-sand-200 lg:pl-6">
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

                  {ceoHasViewed && ceoViewedAt && (
                    <p className="text-[11px] text-ink-500 flex items-center gap-1.5 px-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-leaf shrink-0" />
                      Sreema viewed your last check-in {relativeTime(ceoViewedAt)}.
                    </p>
                  )}

                  {!cur.existedThisWeek && ceoTouches.length === 0 && !(ceoHasViewed && ceoViewedAt) && (
                    <section className="card px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-2 flex items-center gap-1.5">
                        <span className="text-sm leading-none">✉</span> From Sreema
                      </p>
                      <p className="text-[12px] text-ink-500">
                        Nothing here yet for {programme?.shortName ?? programme?.name}. Her replies
                        and notes will show up in this spot.
                      </p>
                    </section>
                  )}
                </aside>

                {/* Main: the current programme's fields */}
                <div className="order-2 lg:order-1 flex-1 min-w-0 space-y-4">
                  <section className="card px-5 py-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-1">
                          Now checking in
                        </p>
                        <h3 className="font-serif text-lg text-ink-900 truncate flex items-center gap-2">
                          {cur.vibeTouched && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: VIBE_COLOR[cur.vibe] }}
                            />
                          )}
                          {programme?.name}
                        </h3>
                        {included.has(current) && (
                          <button
                            type="button"
                            onClick={() => unInclude(current)}
                            className="mt-1 text-[10px] text-ink-400 hover:text-crimson underline underline-offset-2"
                          >
                            Remove from this batch
                          </button>
                        )}
                      </div>
                      <div className="w-full sm:w-auto sm:min-w-[220px]">
                        <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-1">
                          Accountable
                        </label>
                        <input
                          value={cur.accountable}
                          onChange={(e) => patchCurrent({ accountable: e.target.value })}
                          placeholder={programme?.lead}
                          className="w-full bg-cream border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40"
                        />
                      </div>
                    </div>
                  </section>

                  <SectionCard label="How does it feel this week?" covered={curCoverage.vibe}>
                    <div className="grid grid-cols-3 gap-2">
                      {(["going_well", "watch_it", "stuck"] as Vibe[]).map((v) => {
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        rows={4}
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
                        rows={4}
                        placeholder="Describe how the week felt, in your own words"
                        className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none"
                      />
                      {!curCoverage.freetext && cur.freeText.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-ink-400">
                          {cur.freeText.trim().length < FREE_TEXT_MIN
                            ? `A few more words. ${FREE_TEXT_MIN - cur.freeText.trim().length} to go.`
                            : "A real sentence, please. The CEO reads this."}
                        </p>
                      )}
                    </SectionCard>
                  </div>

              <section className="card px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400">
                    Files &amp; folders for Sreema (optional)
                  </label>
                 
                </div>
                <p className="text-[11px] text-ink-500 mb-3">
                  Attach anything worth a look - a PDF, a spreadsheet, a deck. Got a whole folder?
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
                </div>
              </div>

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

      {/* Progress footer - current programme's section coverage */}
      {submittedCount === null && (
        <div className="border-t border-sand-200 shrink-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
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

      {confirmClose && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4 bg-ink-900/35 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-card bg-cream border border-sand-200 shadow-hero px-5 py-5 text-center">
            <h3 className="font-serif text-lg text-ink-900">Leave without submitting?</h3>
            <p className="mt-1.5 text-[12.5px] text-ink-500">
              {includedList.length}{" "}
              {includedList.length === 1 ? "programme is" : "programmes are"} filled in but not
              sent. Closing clears {includedList.length === 1 ? "it" : "them"}.
            </p>
            <div className="mt-4 flex justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="px-4 py-2 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmClose(false);
                  onClose();
                }}
                className="px-4 py-2 rounded-full bg-sand-100 text-ink-700 text-sm font-medium hover:bg-sand-200 transition"
              >
                Discard and close
              </button>
            </div>
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
      {over && ` - only the first ${LINES_MAX} will be sent`}
    </p>
  );
}

/**
 * All of this customer's programmes, always visible, scrollable sideways -
 * the primary way to jump between programmes (replaces the old dropdown).
 * Each tile shows: a left stripe in the programme's vibe colour (this
 * session's if touched, otherwise last week's, faded until confirmed), a mini
 * 3-segment coverage bar, and a corner badge for "new from Sreema" or
 * "ready to send".
 */
function ProgrammeRail({
  programmes,
  current,
  setCurrent,
  entries,
  existingByProgramme,
  included,
  isUnseen,
  loading
}: {
  programmes: Programme[];
  current: string;
  setCurrent: (id: string) => void;
  entries: Record<string, Entry>;
  existingByProgramme: Record<string, PulseSubmission>;
  included: Set<string>;
  isUnseen: (pid: string) => boolean;
  loading: boolean;
}) {
  const readyCount = programmes.filter(
    (p) => included.has(p.id) && coverageOf(entries[p.id]).all
  ).length;

  return (
    <div className="border-b border-sand-200 pb-4">
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400">Your programmes</p>
        <span className="text-[10px] text-ink-400">
          {loading ? "loading…" : `${readyCount} of ${programmes.length} ready`}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-0.5 px-0.5 snap-x snap-proximity">
        {programmes.map((p) => {
          const en = entries[p.id];
          const existing = existingByProgramme[p.id];
          const cov = coverageOf(en);
          const active = p.id === current;
          const displayVibe = en?.vibeTouched ? en.vibe : existing?.vibe;
          const confirmed = Boolean(en?.vibeTouched);
          const unseen = isUnseen(p.id);
          const ready = included.has(p.id) && cov.all;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setCurrent(p.id)}
              className={`relative snap-start shrink-0 w-[128px] text-left rounded-xl px-3 py-2.5 border transition-colors ${
                active
                  ? "bg-coral/[0.06] border-coral/50"
                  : "bg-cream border-sand-200 hover:border-sand-300"
              }`}
            >
              {unseen && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-[15px] h-[15px] rounded-full bg-coral text-cream text-[8.5px] font-bold leading-none flex items-center justify-center ring-2 ring-cream"
                  title="New from Sreema"
                >
                  !
                </span>
              )}
              <span className="flex items-center gap-1.5 min-w-0">
                {displayVibe && (
                  <span
                    className="w-[7px] h-[7px] rounded-full shrink-0"
                    style={
                      confirmed
                        ? { backgroundColor: VIBE_COLOR[displayVibe] }
                        : {
                            backgroundColor: "transparent",
                            border: `1.5px solid ${VIBE_COLOR[displayVibe]}`
                          }
                    }
                    title={confirmed ? undefined : "Last week - not yet confirmed"}
                  />
                )}
                <span className="text-[12px] font-medium text-ink-900 truncate">
                  {p.shortName ?? p.name}
                </span>
                {ready && (
                  <span className="text-leaf text-[11px] font-bold leading-none shrink-0">✓</span>
                )}
              </span>
              <div className="mt-2 flex items-center gap-1">
                {[cov.vibe, cov.decisions, cov.freetext].map((covered, i) => (
                  <span
                    key={i}
                    className={`h-[3px] flex-1 rounded-full ${covered ? "bg-leaf" : "bg-sand-200"}`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A one-tap shortcut for a calm week: the fields are already pre-filled from
 * the last submission, so this just confirms it should be included in this
 * batch as-is, without retyping anything.
 */
function SameAsLastWeekBanner({
  programme,
  existing,
  onKeep
}: {
  programme?: Programme;
  existing: PulseSubmission;
  onKeep: () => void;
}) {
  return (
    <div className="rounded-xl border bg-coral/5 border-coral/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="text-base leading-none mt-0.5" aria-hidden>
          ↺
        </span>
        <p className="text-[12.5px] text-ink-700 min-w-0">
          <span className="font-medium text-ink-900">
            Same as last week for {programme?.shortName ?? programme?.name}?
          </span>{" "}
          It was <strong>{VIBE_LABEL[existing.vibe]}</strong>. Already filled in below, just
          confirm to add it to this batch.
        </p>
      </div>
      <button
        type="button"
        onClick={onKeep}
        className="shrink-0 px-3.5 py-1.5 rounded-full bg-coral text-cream text-xs font-medium hover:bg-coral/90 transition"
      >
        Keep it as-is
      </button>
    </div>
  );
}

function CeoTouchesBanner({ touches }: { touches: CeoTouch[] }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-[#EEEAFB] border border-[#D3C7F2] text-ink-800 text-sm">
      <p className="font-medium text-[#4A2E9E] mb-2 flex items-center gap-1.5">
        <span className="text-sm leading-none">✉</span> From Sreema
      </p>
      <ul className="space-y-2">
        {touches.map((t, i) => {
          const m = t.status ? STATUS_META[t.status] : null;
          const person = personById(t.to);
          return (
            <li key={i} className="text-[12px] min-w-0">
              <p className="text-[11px] text-ink-500 mb-0.5 break-words">re: “{t.text}”</p>
              <div className="flex flex-wrap items-center gap-2">
                {m && (
                  <span
                    className="pill text-[9px] py-0.5 px-1.5 shrink-0"
                    style={{ backgroundColor: m.bg, color: m.fg }}
                  >
                    <span aria-hidden>{m.icon}</span>
                    {m.label}
                  </span>
                )}
                {t.note && (
                  <span className="text-ink-700 leading-snug whitespace-pre-wrap break-words">
                    {person && <span className="font-medium text-coral">@{person.first} </span>}
                    {t.note}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
