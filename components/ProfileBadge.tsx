"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

interface SessionUser {
  name?: string;
  email?: string;
}

function initials(name: string, email: string): string {
  const source = name || email;
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * Account chip in the corner of the launchpad — avatar, name/email, sign out.
 * Fetches the session client-side (NextAuth's own /api/auth/session) rather
 * than the page reading it server-side, so the launchpad itself stays a
 * static export — see the note in app/page.tsx for why that matters here.
 */
export function ProfileBadge() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) setUser(data.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user || (!user.name && !user.email)) return null;

  const name = user.name ?? "";
  const email = user.email ?? "";
  const displayName = name || email;

  return (
    <div ref={ref} className="fixed top-4 right-4 sm:top-6 sm:right-6 z-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-full border border-sand-200 bg-cream/90 backdrop-blur pl-2 pr-3.5 py-1.5 shadow-card hover:shadow-hero transition"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-white text-[11px] font-semibold shrink-0"
          style={{ backgroundColor: "#6C47E8" }}
        >
          {initials(name, email)}
        </span>
        <span className="text-left leading-tight hidden sm:block">
          <span className="block text-[12.5px] font-medium text-ink-900 max-w-[140px] truncate">
            {displayName}
          </span>
          {name && email && (
            <span className="block text-[10.5px] text-ink-400 max-w-[140px] truncate">{email}</span>
          )}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-sand-200 bg-cream shadow-hero overflow-hidden">
          <div className="px-4 py-3 border-b border-sand-200">
            <p className="text-sm font-medium text-ink-900 truncate">{displayName}</p>
            {name && email && <p className="text-xs text-ink-400 truncate mt-0.5">{email}</p>}
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/sign-in" })}
            className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-sand-100 transition"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
