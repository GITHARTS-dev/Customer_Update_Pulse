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
 * Account badge in the corner of the launchpad. At rest it's just the
 * initials circle; hovering slides a name chip out from behind it (pure CSS,
 * via group-hover — no state needed); clicking opens a dropdown with the full
 * details and sign out. Fetches the session client-side (NextAuth's own
 * /api/auth/session) rather than the page reading it server-side, so the
 * launchpad itself stays a static export — see the note in app/page.tsx.
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
      <div className="group relative h-10">
        {/* Name chip — same footprint as the avatar at rest (perfectly hidden
            underneath it), widens leftward on hover to reveal the name. */}
        <div
          className="absolute right-0 top-0 h-10 w-10 overflow-hidden rounded-full border border-sand-200 bg-cream shadow-card transition-[width] duration-300 ease-out group-hover:w-[190px]"
          aria-hidden="true"
        >
          <span className="absolute inset-y-0 left-4 right-11 flex items-center text-[13px] font-medium text-ink-900 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-150">
            {displayName}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Account: ${displayName}`}
          className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full text-white text-[13px] font-semibold shadow-card ring-2 ring-cream"
          style={{ backgroundColor: "#6C47E8" }}
        >
          {initials(name, email)}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-12 w-56 rounded-xl border border-sand-200 bg-cream shadow-hero overflow-hidden">
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
