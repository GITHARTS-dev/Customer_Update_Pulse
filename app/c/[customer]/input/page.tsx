"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { BabyElephant } from "@/components/BabyElephant";
import { getCustomer, primaryCustomer } from "@/lib/customers";
import { personById } from "@/lib/people";
import { ACTION_LABEL, type ActionStatus } from "@/lib/actions";
import { useCustomerId } from "@/lib/use-customer";
import {
  VIBE_LABEL,
  type Attachment,
  type Programme,
  type PulseSubmission,
  type Vibe
} from "@/lib/types";
import { VIBE_COLOR, relativeTime } from "@/lib/helpers";

/** Client mirror of the CEO log shape (ceo-store is server-only). */
interface ClientNote {
  text: string;
  at: string;
  to?: string;
  askText?: string;
  programmeId?: string;
}
interface ClientAction {
  status: ActionStatus;
  at: string;
  askText?: string;
  programmeId?: string;
}
interface ClientLog {
  notes: Record<string, ClientNote>;
  actions: Record<string, ClientAction>;
  views: Record<string, string>;
}

const VIBE_HELP: Record<Vibe, string> = {
  going_well: "Energy is up, things are moving, no decisions waiting on the CEO.",
  watch_it: "Something has cooled, a person, a date, or a decision is wobbling.",
  stuck: "Waiting on something important. A little help this week would go a long way."
};

const FREE_TEXT_MIN = 20;
const FREE_TEXT_MIN_DISTINCT_LETTERS = 5;
const LINES_MAX = 6;

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
  /** New files picked this session, uploaded on submit. */
  files: File[];
  /** Files already attached for this week (shown read-only when editing). */
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
  // "name: note" (or just the name) so the round-trip stays stable and never
  // re-embeds the name into its own note - see personToLine / parsePersonLine.
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

function coverageOf(e: Entry): Coverage {
  const vibe = e.vibeTouched;
  const people = e.noPeople || e.peopleNote.trim().length > 0;
  const decisions = e.noDecisions || e.openTopics.trim().length > 0;
  const freetext = isMeaningfulProse(e.freeText);
  return { vibe, people, decisions, freetext, all: vibe && people && decisions && freetext };
}

function LeadInputForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const cid = useCustomerId();
  const customer = getCustomer(cid) ?? primaryCustomer();
  const submitter = customer.submitter || "the lead";
  const apiBase = `/api/c/${customer.id}`;

  // Config for an instant list, then the resolved list (config + custom).
  const [programmes, setProgrammes] = useState<Programme[]>(customer.programmes);
  const byId: Record<string, Programme> = Object.fromEntries(programmes.map((p) => [p.id, p]));

  const raw = searchParams.get("programme");
  const initialProgrammeId =
    raw && customer.programmes.some((p) => p.id === raw)
      ? raw
      : customer.programmes[0]?.id ?? "";

  const [current, setCurrent] = useState(initialProgrammeId);
  const [entries, setEntries] = useState<Record<string, Entry>>(() => ({
    [initialProgrammeId]: blankEntry(byId[initialProgrammeId]?.lead ?? "")
  }));
  const [existingByProgramme, setExistingByProgramme] = useState<
    Record<string, PulseSubmission>
  >({});
  // The full CEO log - Sreema's per-ask responses (actions + notes) and her
  // "viewed" marks - so each programme can show exactly what she sent back.
  const [ceoLog, setCeoLog] = useState<ClientLog>({ notes: {}, actions: {}, views: {} });
  // Programmes the lead has actively edited this session = the ones to submit.
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const includedRef = useRef<Set<string>>(new Set());

  const [loadingExisting, setLoadingExisting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const programme = byId[current] ?? programmes[0];

  // Sreema's responses for the current programme, merged per ask: an action
  // (Need more info / Noted / Let's talk) and/or a note (tagged with who it was
  // directed to). This is the on-screen half of "notify the lead".
  const sreemaResponses = useMemo(() => {
    const byAsk = new Map<
      string,
      { askText: string; at: string; statusLabel?: string; note?: string; to?: string }
    >();
    const bump = (askText: string, at: string) => {
      const e = byAsk.get(askText) ?? { askText, at };
      if (at > e.at) e.at = at;
      byAsk.set(askText, e);
      return e;
    };
    for (const a of Object.values(ceoLog.actions)) {
      if (a.programmeId !== current || !a.askText) continue;
      bump(a.askText, a.at).statusLabel = ACTION_LABEL[a.status];
    }
    for (const n of Object.values(ceoLog.notes)) {
      if (n.programmeId !== current) continue;
      const e = bump(n.askText ?? "", n.at);
      e.note = n.text;
      e.to = n.to;
    }
    return Array.from(byAsk.values()).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [ceoLog, current]);

  // Load every programme's latest submission once, for pre-fill + banners.
  useEffect(() => {
    let cancelled = false;
    setLoadingExisting(true);
    fetch(`${apiBase}/submissions`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, PulseSubmission>) => {
        if (!cancelled) setExistingByProgramme(data ?? {});
      })
      .catch(() => {
        if (!cancelled) setExistingByProgramme({});
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the resolved programme list (config + any added / minus removed), so
  // the check-in and the manager below reflect the lead's own programmes.
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/programmes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { programmes?: Programme[] } | null) => {
        if (!cancelled && data?.programmes && data.programmes.length > 0) {
          setProgrammes(data.programmes);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // Load Sreema's responses back to the leads (her actions + notes, per ask),
  // so each programme shows what she sent back. This is the CEO side.
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/ceo-log`)
      .then((r) => (r.ok ? r.json() : null))
      .then((log: Partial<ClientLog> | null) => {
        if (cancelled) return;
        setCeoLog({
          notes: log?.notes ?? {},
          actions: log?.actions ?? {},
          views: log?.views ?? {}
        });
      })
      .catch(() => {
        if (!cancelled) setCeoLog({ notes: {}, actions: {}, views: {} });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Make sure the current programme has an entry. Pre-fill from the existing
  // submission unless the lead has already edited it this session.
  useEffect(() => {
    const lead = byId[current]?.lead ?? "";
    setEntries((prev) => {
      if (prev[current] && includedRef.current.has(current)) return prev;
      const ex = existingByProgramme[current];
      return {
        ...prev,
        [current]: ex ? entryFromExisting(ex, lead) : blankEntry(lead)
      };
    });
  }, [current, existingByProgramme]);

  const cur = entries[current] ?? blankEntry(programme.lead);

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
      [current]: { ...(prev[current] ?? blankEntry(programme.lead)), ...patch }
    }));
    markTouched(current);
  }

  // Merge newly picked/dropped files into the current programme, skipping exact
  // duplicates (same name + size) so re-picking doesn't pile up copies.
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
  const incompletePid = includedList.filter((p) => !coverageOf(entries[p.id]).all);
  const readyToSubmit = includedList.length > 0 && incompletePid.length === 0;

  const curCoverage = coverageOf(cur);
  const curSections = [
    { key: "vibe", label: "Vibe", covered: curCoverage.vibe },
    { key: "people", label: "People", covered: curCoverage.people },
    { key: "decisions", label: "Decisions", covered: curCoverage.decisions },
    { key: "freetext", label: "Your words", covered: curCoverage.freetext }
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!readyToSubmit) return;
    setSubmitting(true);
    setError(null);
    setWarnings([]);
    try {
      // Upload any picked files first, per programme, so their URLs can ride
      // along with the check-in. Files are stored as-is for Sreema to open;
      // Claude never reads them.
      const uploadWarnings: string[] = [];
      const attachmentsByProgramme: Record<string, Attachment[]> = {};
      for (const p of includedList) {
        const en = entries[p.id];
        if (en.files.length === 0) continue;
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
          uploadWarnings.push(
            `${p.shortName ?? p.name}: could not upload ${f.name} (${f.error})`
          );
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
          // Kept existing files + this session's uploads = the authoritative set
          // for this week; removed files are simply left out.
          attachments: [...en.existingAttachments, ...(attachmentsByProgramme[p.id] ?? [])]
        };
      });

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
      setSubmittedCount(saved.length);
      const saveWarnings = failed.map(
        (f) => `${byId[f.programmeId]?.name ?? f.programmeId}: ${f.error}`
      );
      setWarnings([...uploadWarnings, ...saveWarnings]);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetAll() {
    includedRef.current = new Set();
    setIncluded(new Set());
    setEntries({ [current]: blankEntry(programme.lead) });
    setSubmittedCount(null);
    setWarnings([]);
    setError(null);
  }

  if (submittedCount !== null) {
    return (
      <div className="flex flex-col lg:flex-row min-h-screen">
        <Sidebar activeCustomerId={customer.id} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full lg:max-w-[760px] min-w-0">
          <div className="card px-6 sm:px-10 py-8 sm:py-12 text-center">
            <div className="flex justify-center mb-4">
              <BabyElephant vibe={cur.vibe} size={120} animated />
            </div>
            <h1 className="font-serif text-3xl text-ink-900">Thank you.</h1>
            <p className="mt-3 text-ink-500 max-w-md mx-auto">
              {submittedCount === 1
                ? "1 programme check-in is in."
                : `${submittedCount} programme check-ins are in.`}{" "}
              Claude has written the narratives and the CEO view is updated.
            </p>
            {warnings.length > 0 && (
              <div className="mt-4 mx-auto max-w-md px-4 py-3 rounded-lg bg-[#F8E7CC] border border-[#E8C685] text-[#7A4A0E] text-sm text-left">
                <p className="font-medium mb-1">Some did not save:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={resetAll}
                className="px-4 py-2 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition"
              >
                Start a new check-in
              </button>
              <Link
                href={`/c/${customer.id}`}
                className="px-4 py-2 rounded-full bg-sand-100 text-ink-700 text-sm font-medium hover:bg-sand-200 transition"
              >
                Back to pulse
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <Sidebar activeCustomerId={customer.id} />
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full lg:max-w-[760px] min-w-0">
        <header className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl text-ink-900">Your weekly check-in</h1>
              <p className="mt-1 text-sm text-ink-500">
                Fill one programme, pick another, fill it too. Submit them all at once.
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1">
              <span className="text-sm font-medium text-ink-800">
                {includedList.length}{" "}
                {includedList.length === 1 ? "programme" : "programmes"} added
              </span>
              <span className="text-[10px] text-ink-400">
                {readyToSubmit
                  ? "all ready to send"
                  : includedList.length === 0
                    ? "start below"
                    : `${incompletePid.length} still need finishing`}
              </span>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-[#F2D9D3] border border-[#E8B5A8] text-[#7E1F14] text-sm">
            {error}
          </div>
        )}

        {/* Chips: programmes queued for this submission */}
        {includedList.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
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
                        backgroundColor: en.vibeTouched ? VIBE_COLOR[en.vibe] : "#D0CBE2"
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
          <div className="mb-4 px-4 py-3 rounded-lg bg-[#F8E7CC] border border-[#E8C685] text-[#7A4A0E] text-sm flex items-start gap-3">
            <span className="text-base leading-none">↻</span>
            <div>
              <strong>{programme.name} was already checked in this week.</strong>{" "}
              Submitting again will overwrite it. The form is pre-filled with what was there.
            </div>
          </div>
        )}

        {sreemaResponses.length > 0 && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-[#ECEAF7] border border-[#D0CBE2]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#6C6689] mb-2 flex items-center gap-1.5">
              <span className="text-sm leading-none">✉</span> From Sreema
            </p>
            <ul className="space-y-2.5">
              {sreemaResponses.map((r, i) => {
                const person = personById(r.to);
                return (
                  <li key={i} className="text-sm min-w-0">
                    {r.askText && (
                      <p className="text-[11px] text-ink-500 mb-0.5 break-words">
                        re: “{r.askText}”
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {r.statusLabel && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/70 text-[#6C6689] border border-[#D0CBE2]">
                          {r.statusLabel}
                        </span>
                      )}
                      {r.note && (
                        <span className="text-ink-800 whitespace-pre-wrap break-words">
                          {person && <span className="font-medium text-coral">@{person.first} </span>}
                          {r.note}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(() => {
          const viewedAt = ceoLog.views[current];
          const sub = existingByProgramme[current];
          const seen =
            viewedAt &&
            sub?.submittedAt &&
            new Date(viewedAt) >= new Date(sub.submittedAt);
          return seen ? (
            <p className="mb-4 text-[11px] text-ink-500 flex items-center gap-1.5 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-leaf shrink-0" />
              Sreema viewed your last check-in {relativeTime(viewedAt)}.
            </p>
          ) : null;
        })()}

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="card px-5 py-4">
            <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-2">
              Programme
            </label>
            <select
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={submitting}
              className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-coral/40 disabled:opacity-60"
            >
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {included.has(p.id) ? "  ✓ added" : ""}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-ink-500">
                Checked in by <span className="text-ink-700">{submitter}</span>
              </p>
              {loadingExisting && (
                <span className="text-[10px] text-ink-400">loading existing…</span>
              )}
            </div>
          </section>

          <section className="card px-5 py-4">
            <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mb-2">
              Accountable for this programme
            </label>
            <input
              value={cur.accountable}
              onChange={(e) => patchCurrent({ accountable: e.target.value })}
              placeholder={programme.lead}
              className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40"
            />
          </section>

          <SectionCard label="How does it feel this week?" covered={curCoverage.vibe}>
            <div className="grid grid-cols-3 gap-2.5">
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
                    <BabyElephant vibe={v} size={56} background={false} animated={selected} />
                    <span className="text-xs font-medium text-ink-900">{VIBE_LABEL[v]}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              {cur.vibeTouched ? VIBE_HELP[cur.vibe] : "Pick the one that fits this week."}
            </p>
          </SectionCard>

          <SectionCard label="People signals" covered={curCoverage.people}>
            <p className="text-[11px] text-ink-500 mb-2">
              How is everyone feeling? One per line, up to {LINES_MAX}.
            </p>
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
              onChange={(checked) =>
                patchCurrent({ noPeople: checked, ...(checked ? { peopleNote: "" } : {}) })
              }
            />
          </SectionCard>

          <SectionCard label="Open decisions" covered={curCoverage.decisions}>
            <p className="text-[11px] text-ink-500 mb-2">
              What needs a call this week? One per line, up to {LINES_MAX}.
            </p>
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
              onChange={(checked) =>
                patchCurrent({ noDecisions: checked, ...(checked ? { openTopics: "" } : {}) })
              }
            />
          </SectionCard>

          <SectionCard label="In your own words" covered={curCoverage.freetext}>
            <p className="text-[11px] text-ink-500 mb-2">
              How would you describe the week to Sreema? A sentence or two.
            </p>
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
                  : "A real sentence, please. The CEO reads this."}
              </p>
            )}
          </SectionCard>

          <section className="card px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400">
                Files & folders for Sreema (optional)
              </label>
              <span className="text-[9px] text-ink-400">she can download these</span>
            </div>
            <p className="text-[11px] text-ink-500 mb-3">
              Attach anything worth a look, a PDF, a spreadsheet, a deck. Got a
              whole folder? Zip it and drop it in. Sreema downloads these
              directly. They are not read or summarised by AI.
            </p>

            {cur.existingAttachments.length > 0 && (
              <ul className="mb-2 space-y-1">
                {cur.existingAttachments.map((a) => (
                  <li
                    key={a.url}
                    className="flex items-center gap-2 text-[12px] text-ink-700"
                  >
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
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 text-[12px] text-ink-800"
                  >
                    <FileIcon />
                    <span className="truncate">{f.name}</span>
                    <span className="text-[10px] text-ink-400 shrink-0">
                      {(f.size / 1024 / 1024).toFixed(f.size < 1024 * 1024 ? 2 : 1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        patchCurrent({ files: cur.files.filter((_, idx) => idx !== i) })
                      }
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

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-1 gap-3 sm:gap-4">
            <div className="text-[11px] text-ink-500 min-w-0">
              {includedList.length === 0 ? (
                <span>Start filling this programme to add it.</span>
              ) : readyToSubmit ? (
                <span className="text-leaf">
                  {includedList.length}{" "}
                  {includedList.length === 1 ? "programme" : "programmes"} ready to send.
                </span>
              ) : (
                <span>
                  Finish:{" "}
                  <span className="text-ink-800 font-medium">
                    {incompletePid.map((p) => p.shortName ?? p.name).join(", ")}
                  </span>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!readyToSubmit || submitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-coral text-cream text-sm font-medium hover:bg-coral/90 transition shadow-card disabled:bg-sand-300 disabled:text-ink-400 disabled:cursor-not-allowed disabled:shadow-none shrink-0"
            >
              {submitting
                ? "Submitting…"
                : includedList.length > 1
                  ? `Submit ${includedList.length} check-ins`
                  : "Submit check-in"}
            </button>
          </div>
        </form>

        {/* Add or remove programmes for this customer */}
        <div className="mt-4">
          <ProgrammeManager
            apiBase={apiBase}
            programmes={programmes}
            setProgrammes={setProgrammes}
            disabled={submitting}
          />
        </div>

        {/* Current programme's section progress */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {curSections.map((s) => (
              <span
                key={s.key}
                className="w-6 h-1.5 rounded-full transition"
                style={{ backgroundColor: s.covered ? "#3BA46A" : "#D0CBE2" }}
                title={`${s.label}: ${s.covered ? "covered" : "to do"}`}
              />
            ))}
          </div>
          <span className="text-[10px] text-ink-400">
            {programme.shortName ?? programme.name}:{" "}
            {curSections.filter((s) => s.covered).length} of {curSections.length} sections
          </span>
        </div>
      </main>
    </div>
  );
}

export default function LeadInputPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sand-100" />}>
      <LeadInputForm />
    </Suspense>
  );
}

/**
 * Add or remove this customer's programmes. Removal is optimistic with a short
 * Undo window (persisted only once the window passes); adding takes a second
 * confirm before it's created. All changes persist to the customer's own list.
 */
function ProgrammeManager({
  apiBase,
  programmes,
  setProgrammes,
  disabled
}: {
  apiBase: string;
  programmes: Programme[];
  setProgrammes: React.Dispatch<React.SetStateAction<Programme[]>>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");
  const [jira, setJira] = useState("");
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{
    programme: Programme;
    prev: Programme[];
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commitRemove(programme: Programme) {
    fetch(`${apiBase}/programmes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", programmeId: programme.id })
    }).catch(() => {});
  }

  function removeProgramme(p: Programme) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    // Commit any still-pending removal before starting a new one.
    if (pendingRemove) commitRemove(pendingRemove.programme);
    const prev = programmes;
    setProgrammes(programmes.filter((x) => x.id !== p.id));
    setPendingRemove({ programme: p, prev });
    undoTimer.current = setTimeout(() => {
      commitRemove(p);
      setPendingRemove(null);
      undoTimer.current = null;
    }, 6000);
  }

  function undoRemove() {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    if (pendingRemove) setProgrammes(pendingRemove.prev);
    setPendingRemove(null);
  }

  async function addProgramme() {
    if (!confirmAdd) {
      if (!name.trim()) {
        setErr("A programme name is required.");
        return;
      }
      setErr(null);
      setConfirmAdd(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase}/programmes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name, lead, jiraProjectKey: jira })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not add programme.");
      if (body.programme) setProgrammes((prev) => [...prev, body.programme as Programme]);
      setName("");
      setLead("");
      setJira("");
      setConfirmAdd(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full bg-cream border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40";

  return (
    <section className="card px-5 py-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400">
          Manage programmes
        </span>
        <span className="text-[11px] text-ink-400">{open ? "hide" : `${programmes.length} · edit`}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {pendingRemove && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#F8E7CC] border border-[#E8C685] text-[#7A4A0E] text-xs">
              <span>
                Removed <strong>{pendingRemove.programme.name}</strong>.
              </span>
              <button
                type="button"
                onClick={undoRemove}
                className="font-medium underline hover:no-underline"
              >
                Undo
              </button>
            </div>
          )}

          <ul className="space-y-1.5">
            {programmes.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sand-50 border border-sand-200"
              >
                <span className="text-sm text-ink-800 truncate">{p.name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeProgramme(p)}
                  className="text-[11px] text-ink-400 hover:text-crimson transition shrink-0 disabled:opacity-50"
                  aria-label={`Remove ${p.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-dashed border-sand-300 px-3 py-3 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400">Add a programme</p>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setConfirmAdd(false);
              }}
              placeholder="Programme name"
              className={field}
            />
            <div className="flex gap-2">
              <input
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                placeholder="Lead (optional)"
                className={`${field} flex-1`}
              />
              <input
                value={jira}
                onChange={(e) => setJira(e.target.value.toUpperCase())}
                placeholder="Jira key"
                className={`${field} w-28`}
              />
            </div>
            {err && <p className="text-[11px] text-crimson">{err}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={addProgramme}
                className="px-3.5 py-1.5 rounded-full bg-coral text-cream text-xs font-medium hover:bg-coral/90 transition disabled:opacity-60"
              >
                {busy
                  ? "Adding…"
                  : confirmAdd
                    ? `Confirm add "${name.trim()}"`
                    : "Add programme"}
              </button>
              {confirmAdd && (
                <button
                  type="button"
                  onClick={() => setConfirmAdd(false)}
                  className="text-[11px] text-ink-400 hover:text-ink-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
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
    <section className="card px-5 py-4 relative">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400">
          {label}
        </label>
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
  onChange: (checked: boolean) => void;
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
