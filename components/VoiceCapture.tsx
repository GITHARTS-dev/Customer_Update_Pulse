"use client";

import { useEffect, useRef, useState } from "react";
import { createTranscriber, speechSupport, type Transcriber } from "@/lib/speech";
import type { RoutedTranscript } from "@/lib/transcript-router";

// ── Speak the week ───────────────────────────────────────────
// One microphone replaces four boxes per programme. The lead talks through
// their week once, sees exactly what was heard, corrects anything the
// recogniser mangled, and only then lets Claude sort it into programmes.
//
// The editable transcript is the point, not a nicety. Signals reach the CEO in
// the lead's VERBATIM words, so a misheard sentence would be shown word for
// word. Letting the lead read and fix the text before it is sorted is what
// makes a free, imperfect browser recogniser safe to build on.

interface Props {
  customerId: string;
  /** Called with the per-programme draft once the lead sorts their update. */
  onRouted: (routed: RoutedTranscript, transcript: string) => void;
  disabled?: boolean;
}

function joinSpoken(previous: string, addition: string): string {
  const a = previous.trimEnd();
  const b = addition.trim();
  if (!a) return b;
  if (!b) return a;
  // The recogniser hands back phrases without punctuation between them. A full
  // stop here is what lets the router (and the signal classifier downstream)
  // see them as separate sentences rather than one run-on thought.
  return /[.!?]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`;
}

function elapsedLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceCapture({ customerId, onRouted, disabled }: Props) {
  const [support] = useState(speechSupport);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [sorting, setSorting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcriberRef = useRef<Transcriber | null>(null);

  // Leaving the page mid-sentence must release the microphone, or Chrome keeps
  // the recording indicator on until the tab is closed.
  useEffect(() => {
    return () => transcriberRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [listening]);

  function start() {
    setError(null);
    setSeconds(0);
    const transcriber = createTranscriber({
      onFinal: (text) => setTranscript((prev) => joinSpoken(prev, text)),
      onInterim: setInterim,
      onError: (message) => setError(message),
      onStop: () => {
        setListening(false);
        setInterim("");
      }
    });
    if (!transcriber) {
      setError("This browser cannot listen. You can type the update below instead.");
      return;
    }
    transcriberRef.current = transcriber;
    transcriber.start();
    setListening(true);
  }

  function stop() {
    transcriberRef.current?.stop();
    setListening(false);
  }

  async function sort() {
    const text = transcript.trim();
    if (!text) return;
    setSorting(true);
    setError(null);
    try {
      const res = await fetch(`/api/c/${customerId}/route-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text })
      });
      const data = (await res.json()) as RoutedTranscript & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not sort that update.");
      onRouted(data, text);
    } catch (err) {
      setError(
        `${(err as Error).message} Your words are safe below, and you can still fill the cards yourself.`
      );
    } finally {
      setSorting(false);
    }
  }

  const busy = Boolean(disabled) || sorting;
  const hasWords = transcript.trim().length > 0;

  return (
    <div className="bg-cream border border-sand-200 rounded-card shadow-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base text-ink-900">Speak your week</h2>
          <p className="text-sm text-ink-500 mt-1 max-w-prose">
            Talk through every programme in one go, in whatever order they come to mind. You
            will see what was heard, and you can fix it before anything is sorted.
          </p>
        </div>
        {listening ? (
          <span className="shrink-0 inline-flex items-center gap-2 text-sm text-crimson">
            <span className="w-2.5 h-2.5 rounded-full bg-crimson animate-pulse" />
            {elapsedLabel(seconds)}
          </span>
        ) : null}
      </div>

      {support.ok ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={busy}
            className={
              listening
                ? "px-4 py-2 rounded-lg text-sm bg-crimson text-white disabled:opacity-50"
                : "px-4 py-2 rounded-lg text-sm bg-coral text-white disabled:opacity-50"
            }
          >
            {listening ? "Stop" : hasWords ? "Add more" : "Start speaking"}
          </button>
          {hasWords && !listening ? (
            <button
              type="button"
              onClick={() => {
                setTranscript("");
                setInterim("");
                setError(null);
              }}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-sm text-ink-500 hover:text-ink-900 disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-500">{support.reason}</p>
      )}

      <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-400 mt-5 mb-1">
        What was heard
      </label>
      <textarea
        value={listening && interim ? joinSpoken(transcript, interim) : transcript}
        onChange={(e) => setTranscript(e.target.value)}
        readOnly={listening}
        rows={7}
        placeholder={
          support.ok
            ? "Press start and talk, or type your whole update here."
            : "Type your whole update here, covering each programme."
        }
        className="w-full bg-sand-50 border border-sand-200 rounded-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-coral/40 resize-none read-only:text-ink-500"
      />
      <p className="text-xs text-ink-400 mt-1">
        {listening
          ? "Listening. Pause to think whenever you like, it keeps going."
          : "Read this through and correct any names or words before sorting."}
      </p>

      {error ? <p className="text-sm text-crimson mt-3">{error}</p> : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={sort}
          disabled={busy || listening || !hasWords}
          className="px-4 py-2 rounded-lg text-sm bg-ink-900 text-white disabled:opacity-40"
        >
          {sorting ? "Sorting into programmes…" : "Sort into programmes"}
        </button>
        <span className="text-xs text-ink-400">
          Nothing is sent to the CEO until you review each card and submit.
        </span>
      </div>
    </div>
  );
}
