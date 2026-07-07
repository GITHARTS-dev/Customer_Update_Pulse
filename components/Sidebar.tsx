"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { PROGRAMMES } from "@/lib/programmes";
import { freshnessOf, isoWeek, safeVibe, shortDate, VIBE_COLOR } from "@/lib/helpers";
import type { PulseSubmission } from "@/lib/types";

interface SidebarProps {
  activeProgrammeId?: string;
  activePath?: string;
  submissionsByProgramme?: Record<string, PulseSubmission>;
}

/** The HARTS heart-cluster rainbow, as one thin woven thread. */
const RAINBOW =
  "linear-gradient(90deg, #D6473F 0%, #E8A020 28%, #3BA46A 55%, #3E8FCF 78%, #6C47E8 100%)";

export function Sidebar({
  activeProgrammeId,
  activePath = "/",
  submissionsByProgramme = {}
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [nowLabel, setNowLabel] = useState<string | null>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [activePath, activeProgrammeId]);

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

  const navContent = (
    <>
      {/* Brand block */}
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
              src="/logos/evora_logo.png"
              alt="Evora Group"
              width={307}
              height={45}
              className="h-[17px] w-auto shrink-0"
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

      <nav className="px-3 py-3 border-t border-sand-200">
        <NavItem href="/" label="Pulse" active={activePath === "/"} icon={<PulseIcon />} />
      </nav>

      <div className="px-3 py-3 border-t border-sand-200 overflow-y-auto flex-1">
        <div className="px-3 pb-2 text-[9px] uppercase tracking-[0.16em] text-ink-400">
          Programmes
        </div>
        <ul className="space-y-0.5">
          {PROGRAMMES.map((p) => {
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
                  href={`/programme/${p.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={`relative flex items-center gap-2.5 pl-4 pr-3 py-1.5 rounded-lg text-xs transition-all duration-150 ${
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
      </div>

      <div className="px-5 py-3 border-t border-sand-200 text-[10px] text-ink-400 flex items-center justify-between">
        <span suppressHydrationWarning>{nowLabel ?? " "}</span>
        <span className="hidden sm:flex items-center gap-1 text-ink-300">
          <span>type</span>
          <kbd className="px-1.5 py-0.5 rounded bg-coral/10 border border-coral/20 font-sans text-[9px] tracking-[0.08em] text-coral font-semibold">
            harts
          </kbd>
          <span>to check-in</span>
        </span>
      </div>
      <div className="px-5 py-2.5 border-t border-sand-200">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/sign-in" })}
          className="text-[10px] text-ink-400 hover:text-coral transition"
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
          <Link
            href="/input"
            className="text-[11px] text-coral font-medium px-2.5 py-1 rounded-full bg-coral/10 hover:bg-coral/15 transition"
          >
            Check-in
          </Link>
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

function NavItem({
  href,
  label,
  active,
  icon
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
        active ? "bg-coral/10 text-coral" : "text-ink-700 hover:bg-sand-100"
      }`}
    >
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center">{icon}</span>
      {label}
    </Link>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8 H4 L5.5 4 L8 12 L10 6 L11.5 8 H15" />
    </svg>
  );
}
