"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { CUSTOMERS, getCustomer, primaryCustomer } from "@/lib/customers";
import { freshnessOf, isoWeek, safeVibe, shortDate, VIBE_COLOR } from "@/lib/helpers";
import type { Programme, PulseSubmission } from "@/lib/types";

interface SidebarProps {
  /** Which customer is currently open (its programmes expand beneath it). */
  activeCustomerId?: string;
  activeProgrammeId?: string;
  /** Latest submission per programme, for the active customer's status dots. */
  submissionsByProgramme?: Record<string, PulseSubmission>;
  /**
   * The active customer's resolved programme list (config + custom). When
   * absent (loading fallback) the active customer's config programmes are used.
   */
  programmes?: Programme[];
}

/** The HARTS heart-cluster rainbow, as one thin woven thread (platform brand). */
const RAINBOW =
  "linear-gradient(90deg, #D6473F 0%, #E8A020 28%, #3BA46A 55%, #3E8FCF 78%, #6C47E8 100%)";

// Same order the home mood board uses, so the sidebar's coloured dots read
// top-to-bottom in the same sequence as the shelves.
const VIBE_RANK: Record<string, number> = {
  going_well: 0,
  watch_it: 1,
  stuck: 2,
  quiet_week: 3
};

export function Sidebar({
  activeCustomerId,
  activeProgrammeId,
  submissionsByProgramme = {},
  programmes
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [nowLabel, setNowLabel] = useState<string | null>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeCustomerId, activeProgrammeId]);

  useEffect(() => {
    const now = new Date();
    setNowLabel(`Week ${isoWeek(now)} · ${shortDate(now)}`);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // The customer whose logo sits beside HARTS — the active one, or the primary
  // as a sensible default for transient/loading states.
  const brandCustomer =
    (activeCustomerId ? getCustomer(activeCustomerId) : undefined) ?? primaryCustomer();

  // Order a programme by its current vibe, matching the home mood board:
  // fresh going-well → watch → stuck → quiet, then stale, then not-yet-in.
  function programmeRank(id: string): number {
    const s = submissionsByProgramme[id];
    const f = freshnessOf(s?.submittedAt);
    if (s && f === "fresh") return VIBE_RANK[safeVibe(s.vibe)] ?? 3;
    return f === "stale" ? 10 : 11;
  }

  const navContent = (
    <>
      {/* Platform brand + the active customer's logo */}
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="block group" onClick={() => setMobileOpen(false)}>
          <div className="flex items-center gap-2.5">
            <Image
              src="/logos/harts_logo.png"
              alt="HARTS Consulting"
              width={278}
              height={98}
              className="h-[26px] w-auto shrink-0"
              priority
            />
            <span className="h-5 w-px bg-sand-300 shrink-0" />
            <Image
              key={brandCustomer.id}
              src={brandCustomer.logo}
              alt={brandCustomer.name}
              width={brandCustomer.logoWidth}
              height={brandCustomer.logoHeight}
              className="h-[17px] w-auto object-contain shrink-0"
              priority
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-px flex-1" style={{ background: RAINBOW, opacity: 0.5 }} />
            <span className="text-[10px] tracking-[0.26em] uppercase text-coral font-semibold">
              Pulse
            </span>
            <span className="h-px flex-1" style={{ background: RAINBOW, opacity: 0.5 }} />
          </div>
        </Link>
      </div>

      {/* Customers, each expanding to its own programmes when active */}
      <div className="px-3 py-3 border-t border-sand-200 overflow-y-auto flex-1">
        <div className="px-3 pb-2 text-[9px] uppercase tracking-[0.16em] text-ink-400">
          Customers
        </div>
        <ul className="space-y-1.5">
          {CUSTOMERS.map((c) => {
            const isActiveCustomer = c.id === activeCustomerId;
            // The active customer shows its resolved list (config + custom);
            // others just use config (they're collapsed anyway).
            const list = isActiveCustomer && programmes ? programmes : c.programmes;
            return (
              <li key={c.id}>
                <Link
                  href={`/c/${c.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                    isActiveCustomer
                      ? "bg-coral/10 text-ink-900 font-medium"
                      : "text-ink-700 hover:bg-sand-100"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-cream"
                    style={{ backgroundColor: `rgb(${c.theme.accent})` }}
                  />
                  <span className="truncate">{c.shortName ?? c.name}</span>
                  {c.comingSoon && (
                    <span className="ml-auto text-[8.5px] uppercase tracking-[0.12em] text-ink-400 bg-sand-100 border border-sand-200 rounded-full px-1.5 py-0.5">
                      soon
                    </span>
                  )}
                </Link>

                {/* Active customer's programmes, ordered by vibe like the board */}
                {isActiveCustomer && list.length > 0 && (
                  <ul className="mt-1 ml-3 pl-3 border-l border-sand-200 space-y-0.5">
                    {[...list]
                      .sort((a, b) => programmeRank(a.id) - programmeRank(b.id))
                      .map((p) => {
                      const s = submissionsByProgramme[p.id];
                      const f = freshnessOf(s?.submittedAt);
                      const dotColor =
                        s && f === "fresh"
                          ? VIBE_COLOR[safeVibe(s.vibe)]
                          : f === "stale"
                            ? "#E8A020"
                            : "#D0CBE2";
                      const isActive = activeProgrammeId === p.id;
                      const isMuted = f !== "fresh";
                      return (
                        <li key={p.id}>
                          <Link
                            href={`/c/${c.id}/programme/${p.id}`}
                            onClick={() => setMobileOpen(false)}
                            className={`relative flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-lg text-xs transition-all duration-150 ${
                              isActive
                                ? "bg-coral/10 text-ink-900 font-medium"
                                : isMuted
                                  ? "text-ink-400 hover:bg-sand-100 hover:translate-x-0.5"
                                  : "text-ink-700 hover:bg-sand-100 hover:translate-x-0.5"
                            }`}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-coral" />
                            )}
                            <span
                              className="w-2 h-2 rounded-full shrink-0 ring-2 ring-cream"
                              style={{ backgroundColor: dotColor }}
                            />
                            <span className="truncate">{p.shortName ?? p.name}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {isActiveCustomer && c.comingSoon && (
                  <p className="mt-1 ml-3 pl-3 border-l border-sand-200 text-[10px] text-ink-400 py-1">
                    No programmes yet.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-5 py-3 border-t border-sand-200 text-[10px] text-ink-400">
        <span suppressHydrationWarning>{nowLabel ?? " "}</span>
      </div>
      <div className="px-5 py-3 border-t border-sand-200 flex items-center gap-2">
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="inline-flex items-center justify-center rounded-lg border border-sand-200 px-3 py-1.5 text-[10px] font-medium text-ink-500 hover:border-coral/40 hover:bg-coral/5 hover:text-coral transition"
        >
          ← Apps
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/sign-in" })}
          className="inline-flex items-center justify-center rounded-lg border border-sand-200 px-3 py-1.5 text-[10px] font-medium text-ink-500 hover:border-coral/40 hover:bg-coral/5 hover:text-coral transition"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-cream/95 backdrop-blur border-b border-sand-200">
        <div className="h-[3px] w-full" style={{ background: RAINBOW }} />
        <div className="h-[calc(100%-3px)] flex items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-md text-ink-700 hover:bg-sand-100 transition"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 4H14 M2 8H14 M2 12H14" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <Image
              src="/logos/harts_logo.png"
              alt="HARTS"
              width={70}
              height={24}
              className="h-6 w-auto"
            />
            <span className="text-[10px] tracking-[0.2em] uppercase text-coral font-semibold">
              Pulse
            </span>
          </Link>
          <span className="w-9" aria-hidden="true" />
        </div>
      </header>

      {/* Spacer so page content isn't hidden behind fixed top bar on mobile */}
      <div aria-hidden className="lg:hidden h-14 shrink-0 w-full" />

      {/* Mobile drawer overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-ink-900/40 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-gradient-to-b from-[#F4F2FC] to-cream border-r border-sand-200 flex flex-col shadow-hero transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-[3px] w-full shrink-0" style={{ background: RAINBOW }} />
          <div className="flex items-center justify-end px-3 pt-3">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition"
              aria-label="Close menu"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 3 L13 13 M13 3 L3 13" />
              </svg>
            </button>
          </div>
          {navContent}
        </aside>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-sand-200 bg-gradient-to-b from-[#F4F2FC] to-cream h-screen sticky top-0 flex-col">
        <div className="h-[3px] w-full shrink-0" style={{ background: RAINBOW }} />
        {navContent}
      </aside>
    </>
  );
}
