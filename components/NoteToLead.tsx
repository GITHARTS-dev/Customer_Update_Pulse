"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCustomerApiBase } from "@/lib/use-customer";

interface NoteToLeadProps {
  programmeId: string;
  initialText: string;
}

/**
 * Sreema's private reply to a programme's lead. Sending clears the box — this
 * is a compose-and-send action, not a persistent editable field. The lead
 * sees whatever was last sent on their next check-in.
 */
export function NoteToLead({ programmeId, initialText }: NoteToLeadProps) {
  const [text, setText] = useState("");
  const [savedNote, setSavedNote] = useState(initialText.trim());
  const [pending, setPending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const apiBase = useCustomerApiBase();

  const trimmed = text.trim();

  async function send() {
    if (trimmed.length === 0) return;
    setPending(true);
    setJustSent(false);
    try {
      const res = await fetch(`${apiBase}/ceo-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", programmeId, text: trimmed })
      });
      if (!res.ok) throw new Error("save failed");
      setSavedNote(trimmed);
      setText("");
      setJustSent(true);
      startTransition(() => router.refresh());
    } catch {
      // Leave the text as-is so she can retry; nothing is lost.
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card px-5 py-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-serif text-lg text-ink-900">Your note to the lead</h3>
        {savedNote.length > 0 && (
          <span className="text-[10px] text-leaf">shared with the lead</span>
        )}
      </div>
      <p className="text-[11px] text-ink-500 mb-2.5">
        Reply to this programme's lead. They'll see it on their next check-in.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setJustSent(false);
        }}
        rows={3}
        placeholder="A short note back — a thank you, a question, a nudge on a decision…"
        className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-ink-400">
          {justSent ? "Sent." : `${trimmed.length}/1000`}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={pending || trimmed.length === 0}
          className="px-3.5 py-1.5 rounded-full bg-coral text-cream text-xs font-medium hover:bg-coral/90 transition disabled:bg-sand-300 disabled:text-ink-400 disabled:cursor-not-allowed"
        >
          {pending ? "Sending…" : savedNote.length > 0 ? "Update note" : "Send note"}
        </button>
      </div>
    </section>
  );
}
