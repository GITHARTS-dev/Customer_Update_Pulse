"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCustomerApiBase } from "@/lib/use-customer";
import { ACTION_LABEL, ACTION_ORDER, type ActionStatus } from "@/lib/actions";

type Status = ActionStatus | "open";

interface ActionButtonsProps {
  actionKey: string;
  initialStatus: Status;
  /** Context passed to the API so it can email the lead when Sreema responds. */
  programmeId: string;
  askText: string;
}

const STATUS_TONE: Record<ActionStatus, { bg: string; text: string }> = {
  need_info: { bg: "#F8E7CC", text: "#7A4A0E" },
  noted: { bg: "#ECEAF7", text: "#6C6689" },
  lets_talk: { bg: "#E1F0E7", text: "#2F6A4A" }
};

const BTN_TONE: Record<ActionStatus, { color: string; borderColor: string }> = {
  need_info: { color: "#8A5A20", borderColor: "#EDD8B0" },
  noted: { color: "#6C6689", borderColor: "#D0CBE2" },
  lets_talk: { color: "#4A8A6A", borderColor: "#C7E0D2" }
};

export function ActionButtons({
  actionKey,
  initialStatus,
  programmeId,
  askText
}: ActionButtonsProps) {
  // Guard against a legacy stored status (old "done"/"dismissed"): anything not
  // a current option shows as open rather than crashing on a missing tone.
  const normalized: Status =
    initialStatus !== "open" && STATUS_TONE[initialStatus] ? initialStatus : "open";
  const [status, setStatus] = useState<Status>(normalized);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const apiBase = useCustomerApiBase();

  async function setAction(next: Status) {
    const prev = status;
    setStatus(next);
    setPending(true);
    try {
      const res = await fetch(`${apiBase}/ceo-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "action",
          key: actionKey,
          status: next,
          programmeId,
          askText
        })
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
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        {ACTION_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setAction(s)}
            disabled={pending}
            style={BTN_TONE[s]}
            className="text-[10px] font-medium px-1.5 py-[1px] rounded-full border bg-transparent hover:bg-sand-50 transition disabled:opacity-50"
          >
            {ACTION_LABEL[s]}
          </button>
        ))}
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
        <span aria-hidden>✓</span> {ACTION_LABEL[status]}
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
