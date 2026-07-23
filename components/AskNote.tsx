"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCustomerApiBase } from "@/lib/use-customer";
import { PEOPLE, extractMention, personById } from "@/lib/people";

interface AskNoteProps {
  /** The ask's actionKey - the note is stored against this. */
  actionKey: string;
  programmeId: string;
  askText: string;
  initialText: string;
  /** Person id the saved note was directed to, if any. */
  initialTo?: string;
}

/**
 * A note sitting under one ask. Sreema types a reply; typing @Srimathi /
 * @Savio (or tapping a chip) directs it to that person, otherwise it defaults
 * to the programme's lead. Sending emails the recipient and shows the note on
 * the lead's check-in tagged with @Name.
 */
export function AskNote({
  actionKey,
  programmeId,
  askText,
  initialText,
  initialTo
}: AskNoteProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState(initialText.trim());
  const [savedTo, setSavedTo] = useState<string | undefined>(initialTo);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const apiBase = useCustomerApiBase();

  const trimmed = text.trim();
  const mentioned = extractMention(text).person;

  function insertMention(first: string) {
    setText((t) => `${t.replace(/\s*$/, "")} @${first} `.replace(/^\s+/, ""));
  }

  async function send() {
    if (!trimmed) return;
    setPending(true);
    try {
      // Strip the "@Name" mention out of the message itself - it's rendered
      // as its own chip next to the text, so leaving it in would show the
      // name twice (e.g. "@Srimathi @Srimathi ok").
      const { person, rest } = extractMention(text);
      const to = person?.id;
      const res = await fetch(`${apiBase}/ceo-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          key: actionKey,
          programmeId,
          askText,
          text: rest,
          to
        })
      });
      if (!res.ok) throw new Error("save failed");
      // The server lightly copyedits the note (spelling/grammar/casing) before
      // saving and emailing it - use that returned text so what's shown here
      // matches exactly what the lead received.
      const data = await res.json().catch(() => null);
      const finalText = typeof data?.text === "string" ? data.text : rest;
      setSavedText(finalText);
      setSavedTo(to);
      setText("");
      setOpen(false);
      setSent(true);
      window.setTimeout(() => setSent(false), 2200);
      startTransition(() => router.refresh());
    } catch {
      // keep the text so she can retry; nothing lost
    } finally {
      setPending(false);
    }
  }

  const savedPerson = personById(savedTo);

  return (
    <div className="mt-2">
      {savedText && !open && (
        <div className="flex items-start gap-1.5 rounded-lg bg-sand-50 border border-sand-200 px-2.5 py-1.5">
          <span className="text-coral text-xs leading-5" aria-hidden>↳</span>
          <p className="flex-1 text-[11.5px] leading-snug text-ink-600">
            {savedPerson && (
              <span className="font-medium text-coral">@{savedPerson.first} </span>
            )}
            {savedText}
          </p>
          {sent ? (
            <span className="text-[10px] font-medium text-[#2F6A4A] shrink-0">Sent ✓</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setText(savedPerson ? `@${savedPerson.first} ${savedText}` : savedText);
                setOpen(true);
              }}
              className="text-[10px] text-ink-400 hover:text-coral shrink-0"
            >
              edit
            </button>
          )}
        </div>
      )}

      {!savedText && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] text-ink-400 hover:text-coral transition"
        >
          + note to lead
        </button>
      )}

      {open && (
        <div className="rounded-lg border border-sand-200 bg-cream p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            autoFocus
            placeholder="A short note back… type @name to send it to a specific person"
            className="w-full bg-sand-50 border border-sand-200 rounded-md px-2.5 py-1.5 text-[13px] text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {PEOPLE.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => insertMention(p.first)}
                  className="text-[10px] px-1.5 py-0.5 rounded-full border border-sand-200 text-ink-500 hover:border-coral hover:text-coral transition"
                >
                  @{p.first}
                </button>
              ))}
              <span className="text-[10px] text-ink-400 ml-1">
                {mentioned ? `→ ${mentioned.first}` : "→ programme lead"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setText("");
                }}
                className="text-[10px] text-ink-400 hover:text-ink-700"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={pending || !trimmed}
                className="px-2.5 py-1 rounded-full bg-coral text-cream text-[11px] font-medium hover:bg-coral/90 transition disabled:bg-sand-300 disabled:text-ink-400 disabled:cursor-not-allowed"
              >
                {pending ? "Sending…" : savedText ? "Update" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
