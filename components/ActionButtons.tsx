"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionStatus } from "@/lib/ceo-store";

type Status = ActionStatus | "open";

interface ActionButtonsProps {
  actionKey: string;
  initialStatus: Status;
}

const STATUS_TONE: Record<ActionStatus, { bg: string; text: string; label: string }> = {
  noted: { bg: "#ECEAF7", text: "#6C6689", label: "Noted" },
  done: { bg: "#E1F0E7", text: "#2F6A4A", label: "Done" },
  dismissed: { bg: "#F8E7CC", text: "#7A4A0E", label: "Not now" }
};

export function ActionButtons({ actionKey, initialStatus }: ActionButtonsProps) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function setAction(next: Status) {
    const prev = status;
    setStatus(next);
    setPending(true);
    try {
      const res = await fetch("/api/ceo-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "action", key: actionKey, status: next })
      });
      if (!res.ok) throw new Error("save failed");
      startTransition(() => router.refresh());
    } catch {
      setStatus(prev);
    } finally {
      setPending(false);
    }
  }

  if (status === "open") {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <ActBtn label="Noted" onClick={() => setAction("noted")} tone="neutral" disabled={pending} />
        <ActBtn label="Done" onClick={() => setAction("done")} tone="leaf" disabled={pending} />
        <ActBtn label="Not now" onClick={() => setAction("dismissed")} tone="amber" disabled={pending} />
      </div>
    );
  }

  const tone = STATUS_TONE[status];
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
        style={{ backgroundColor: tone.bg, color: tone.text }}
      >
        <span aria-hidden>✓</span> {tone.label}
      </span>
      <button
        type="button"
        onClick={() => setAction("open")}
        disabled={pending}
        className="text-[10px] text-ink-400 hover:text-coral disabled:opacity-50"
      >
        undo
      </button>
    </div>
  );
}

function ActBtn({
  label, onClick, tone, disabled
}: {
  label: string;
  onClick: () => void;
  tone: "neutral" | "leaf" | "amber";
  disabled: boolean;
}) {
  const style =
    tone === "leaf"
      ? { color: "#4A8A6A", borderColor: "#C7E0D2" }
      : tone === "amber"
        ? { color: "#8A5A20", borderColor: "#EDD8B0" }
        : { color: "#6C6689", borderColor: "#D0CBE2" };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className="text-[10px] font-medium px-1.5 py-[1px] rounded-full border bg-transparent hover:bg-sand-50 transition disabled:opacity-50"
    >
      {label}
    </button>
  );
}
