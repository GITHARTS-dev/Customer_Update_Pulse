"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCustomer } from "@/lib/customers";
import type { OpenTopic, Signal } from "@/lib/types";

/**
 * Edit mode: the lead's pass over what Claude published.
 *
 * Claude writes the narrative and classifies the signals from a check-in, but
 * it can only ever approximate the lead's intent, and this is sentiment - so
 * the lead gets to correct the published wording and have the CEO see it
 * verbatim.
 *
 * Edits are held here as DRAFTS and only hit the server on Publish. The draft
 * store lives at the layout level so it survives moving between the pulse page
 * and any programme page: the lead can fix several cards across several pages
 * and publish the lot in one go. A full page reload would lose them, so an
 * unload guard warns first.
 */

interface ProgrammeDraft {
  aiNarrative?: string;
  signals?: Signal[];
  openTopics?: OpenTopic[];
}

interface PortfolioDraft {
  headline?: string;
  supporting?: string;
}

type ProgrammeField = keyof ProgrammeDraft;

interface EditModeValue {
  /** True while the lead is editing. Cards render their editable form. */
  editMode: boolean;
  enterEditMode: () => void;
  exitEditMode: () => void;
  /** True on pages where editing is possible at all (a live customer). */
  available: boolean;
  /**
   * Called by a page that is showing a historical checkpoint, to take editing
   * off the table while it is mounted. A past week is a record of what was
   * said; letting it be rewritten would make the history worthless.
   */
  setEditingBlocked: (blocked: boolean) => void;

  programmeDraft: (programmeId: string) => ProgrammeDraft;
  setProgrammeField: <K extends ProgrammeField>(
    programmeId: string,
    field: K,
    value: NonNullable<ProgrammeDraft[K]>,
    baseline: NonNullable<ProgrammeDraft[K]>
  ) => void;

  portfolioDraft: PortfolioDraft;
  setPortfolioField: (
    field: keyof PortfolioDraft,
    value: string,
    baseline: string
  ) => void;

  dirtyCount: number;
  publishing: boolean;
  error: string | null;
}

const EditModeContext = createContext<EditModeValue | null>(null);

const NOOP_DRAFT: ProgrammeDraft = {};

/**
 * Unsaved edits are mirrored to sessionStorage per customer, so an accidental
 * reload (or a mistaken "leave site") doesn't throw away a pass over several
 * cards. Session-scoped on purpose: an edit is meant to be published in the
 * sitting it was written, not resurrected days later against copy that has
 * since moved on.
 */
const STORAGE_PREFIX = "pulse:edit-drafts:";

interface StoredDrafts {
  programmes: Record<string, ProgrammeDraft>;
  portfolio: PortfolioDraft;
}

function loadStored(customerId: string | undefined): StoredDrafts | null {
  if (!customerId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + customerId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDrafts>;
    const programmes =
      parsed.programmes && typeof parsed.programmes === "object" ? parsed.programmes : {};
    const portfolio =
      parsed.portfolio && typeof parsed.portfolio === "object" ? parsed.portfolio : {};
    if (Object.keys(programmes).length === 0 && Object.keys(portfolio).length === 0) {
      return null;
    }
    return { programmes, portfolio };
  } catch {
    return null;
  }
}

function saveStored(customerId: string | undefined, drafts: StoredDrafts | null): void {
  if (!customerId || typeof window === "undefined") return;
  try {
    if (!drafts) window.sessionStorage.removeItem(STORAGE_PREFIX + customerId);
    else window.sessionStorage.setItem(STORAGE_PREFIX + customerId, JSON.stringify(drafts));
  } catch {
    // Private mode or a full quota - persistence is a safety net, not a
    // requirement, so losing it must never break editing.
  }
}

/** Deep-equal for the small, JSON-shaped values held in a draft. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useEditMode(): EditModeValue {
  const ctx = useContext(EditModeContext);
  // Outside a customer page there is nothing to edit; the cards still render,
  // they just never switch into their editable form.
  if (!ctx) {
    return {
      editMode: false,
      enterEditMode: () => {},
      exitEditMode: () => {},
      available: false,
      setEditingBlocked: () => {},
      programmeDraft: () => NOOP_DRAFT,
      setProgrammeField: () => {},
      portfolioDraft: {},
      setPortfolioField: () => {},
      dirtyCount: 0,
      publishing: false,
      error: null
    };
  }
  return ctx;
}

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const match = pathname.match(/^\/c\/([^/]+)/);
  const customer = match ? getCustomer(decodeURIComponent(match[1])) : undefined;
  const availableForCustomer = Boolean(
    customer && !customer.comingSoon && customer.programmes.length > 0
  );

  const [editMode, setEditMode] = useState(false);
  const [programmes, setProgrammes] = useState<Record<string, ProgrammeDraft>>({});
  const [portfolio, setPortfolio] = useState<PortfolioDraft>({});
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  // Set by whichever page is showing a past checkpoint. Read via a ref-like
  // state so `available` collapses and any open session closes immediately.
  const [editingBlocked, setEditingBlocked] = useState(false);

  const available = availableForCustomer && !editingBlocked;

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const draft of Object.values(programmes)) n += Object.keys(draft).length;
    n += Object.keys(portfolio).length;
    return n;
  }, [programmes, portfolio]);

  const clearDrafts = useCallback(() => {
    setProgrammes({});
    setPortfolio({});
    setError(null);
    saveStored(customer?.id, null);
  }, [customer?.id]);

  // Mirror every change so a reload can pick the session back up.
  useEffect(() => {
    if (!customer?.id) return;
    const empty =
      Object.keys(programmes).length === 0 && Object.keys(portfolio).length === 0;
    saveStored(customer.id, empty ? null : { programmes, portfolio });
  }, [customer?.id, programmes, portfolio]);

  /**
   * Entering restores anything a reload interrupted, so the lead picks up
   * mid-pass rather than starting over.
   */
  const enterEditMode = useCallback(() => {
    setJustPublished(false);
    setError(null);
    const stored = loadStored(customer?.id);
    if (stored) {
      setProgrammes(stored.programmes);
      setPortfolio(stored.portfolio);
    }
    setEditMode(true);
  }, [customer?.id]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    clearDrafts();
  }, [clearDrafts]);

  // A reload mid-edit lands here with drafts still in sessionStorage but the
  // mode reset. Restoring both is the least surprising outcome: the work is
  // visibly still there, in the mode it was written in. Runs once per customer.
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!available || !customer?.id || restoredFor.current === customer.id) return;
    restoredFor.current = customer.id;
    const stored = loadStored(customer.id);
    if (!stored) return;
    setProgrammes(stored.programmes);
    setPortfolio(stored.portfolio);
    setEditMode(true);
  }, [available, customer?.id]);

  // Leaving the customer's pages ends the session, but the drafts stay in
  // sessionStorage so coming back resumes rather than restarts.
  useEffect(() => {
    if (!available && editMode) setEditMode(false);
  }, [available, editMode]);

  // A reload now survives (sessionStorage), but closing the tab still clears
  // it, and either way an unpublished edit is invisible to the CEO - so the
  // warning stays.
  useEffect(() => {
    if (dirtyCount === 0) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyCount]);

  // Read inside the Esc handler so it always sees the live count without
  // re-binding the listener on every keystroke.
  const dirtyCountRef = useRef(dirtyCount);
  dirtyCountRef.current = dirtyCount;

  // Esc leaves edit mode, but never silently discards work - with unsaved
  // edits it does nothing, and the bar's Discard (which confirms) is the way out.
  useEffect(() => {
    if (!editMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      if (dirtyCountRef.current > 0) return;
      setEditMode(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMode]);

  const programmeDraft = useCallback(
    (programmeId: string): ProgrammeDraft => programmes[programmeId] ?? NOOP_DRAFT,
    [programmes]
  );

  /**
   * Records a field only while it actually differs from what is published.
   * Typing a change and then undoing it by hand clears the draft again, so the
   * "unsaved changes" count never counts a no-op edit.
   */
  const setProgrammeField = useCallback(
    <K extends ProgrammeField>(
      programmeId: string,
      field: K,
      value: NonNullable<ProgrammeDraft[K]>,
      baseline: NonNullable<ProgrammeDraft[K]>
    ) => {
      setProgrammes((prev) => {
        const current = prev[programmeId] ?? {};
        const next: ProgrammeDraft = { ...current };
        if (sameValue(value, baseline)) delete next[field];
        else next[field] = value;

        const out = { ...prev };
        if (Object.keys(next).length === 0) delete out[programmeId];
        else out[programmeId] = next;
        return out;
      });
    },
    []
  );

  const setPortfolioField = useCallback(
    (field: keyof PortfolioDraft, value: string, baseline: string) => {
      setPortfolio((prev) => {
        const next = { ...prev };
        if (sameValue(value, baseline)) delete next[field];
        else next[field] = value;
        return next;
      });
    },
    []
  );

  const publish = useCallback(async () => {
    if (!customer || dirtyCount === 0 || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const programmeEdits = Object.entries(programmes).map(([programmeId, draft]) => ({
        programmeId,
        ...draft
      }));
      const res = await fetch(`/api/c/${customer.id}/edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedBy: customer.submitter,
          programmes: programmeEdits,
          portfolio: Object.keys(portfolio).length > 0 ? portfolio : undefined
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server returned ${res.status}`);

      const failed: Array<{ programmeId: string; error: string }> = body.failed ?? [];
      if (failed.length > 0) {
        // Some landed, some didn't. Keep the session open and say which, rather
        // than closing on a half-published page.
        setError(failed.map((f) => f.error).join(" · "));
        router.refresh();
        return;
      }

      clearDrafts();
      setEditMode(false);
      setJustPublished(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  }, [customer, dirtyCount, publishing, programmes, portfolio, router, clearDrafts]);

  // The "published" confirmation is a moment, not a state to dismiss.
  useEffect(() => {
    if (!justPublished) return;
    const t = setTimeout(() => setJustPublished(false), 4000);
    return () => clearTimeout(t);
  }, [justPublished]);

  const value = useMemo<EditModeValue>(
    () => ({
      editMode,
      enterEditMode,
      exitEditMode,
      available,
      setEditingBlocked,
      programmeDraft,
      setProgrammeField,
      portfolioDraft: portfolio,
      setPortfolioField,
      dirtyCount,
      publishing,
      error
    }),
    [
      editMode,
      enterEditMode,
      exitEditMode,
      available,
      programmeDraft,
      setProgrammeField,
      portfolio,
      setPortfolioField,
      dirtyCount,
      publishing,
      error
    ]
  );

  return (
    <EditModeContext.Provider value={value}>
      {children}
      {editMode && (
        <EditBar
          dirtyCount={dirtyCount}
          publishing={publishing}
          error={error}
          onPublish={publish}
          onDiscard={exitEditMode}
        />
      )}
      {justPublished && <PublishedToast />}
    </EditModeContext.Provider>
  );
}

/**
 * Mounted by a page that is showing a historical checkpoint. Renders nothing;
 * it exists so a server page can switch editing off without the provider
 * needing to read search params (which, from the root layout, would force every
 * page - including the static launchpad - out of static rendering).
 */
export function EditingBlockedWhileMounted() {
  const { setEditingBlocked } = useEditMode();
  useEffect(() => {
    setEditingBlocked(true);
    return () => setEditingBlocked(false);
  }, [setEditingBlocked]);
  return null;
}

/* ---------- the persistent bar ---------- */

function EditBar({
  dirtyCount,
  publishing,
  error,
  onPublish,
  onDiscard
}: {
  dirtyCount: number;
  publishing: boolean;
  error: string | null;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-card bg-cream border border-sand-200 shadow-hero px-4 py-3">
        {error && (
          <p className="mb-2 text-[11.5px] text-[#7E1F14] bg-[#F2D9D3] border border-[#E8B5A8] rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-ink-900 leading-tight">
                Editing this page
              </p>
              <p className="text-[11px] text-ink-500 leading-tight">
                {dirtyCount === 0
                  ? "Change any card, then publish."
                  : `${dirtyCount} unsaved ${dirtyCount === 1 ? "change" : "changes"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {confirmDiscard ? (
              <>
                <span className="text-[11px] text-ink-500">Discard {dirtyCount}?</span>
                <button
                  type="button"
                  onClick={onDiscard}
                  className="px-3 py-1.5 rounded-full bg-[#F2D9D3] text-[#7E1F14] text-xs font-medium hover:bg-[#EBC9C1] transition"
                >
                  Yes, discard
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="text-[11px] text-ink-400 hover:text-ink-700"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => (dirtyCount > 0 ? setConfirmDiscard(true) : onDiscard())}
                className="px-3.5 py-1.5 rounded-full bg-sand-100 text-ink-700 text-xs font-medium hover:bg-sand-200 transition"
              >
                {dirtyCount > 0 ? "Discard" : "Done"}
              </button>
            )}
            <button
              type="button"
              onClick={onPublish}
              disabled={dirtyCount === 0 || publishing}
              className="px-4 py-1.5 rounded-full bg-coral text-cream text-xs font-medium hover:bg-coral/90 transition disabled:bg-sand-300 disabled:text-ink-400 disabled:cursor-not-allowed"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublishedToast() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto w-fit rounded-full bg-[#E1F0E7] border border-[#B7DCC6] text-[#2F6A4A] shadow-card px-4 py-2 text-[12.5px] font-medium flex items-center gap-2">
        <span aria-hidden>✓</span>
        Published. This is what Sreema sees now.
      </div>
    </div>
  );
}
