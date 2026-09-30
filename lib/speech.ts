"use client";

// ── Speech capture seam ──────────────────────────────────────
// The lead speaks their whole week once, and that transcript is the only raw
// input the pulse needs. Transcription itself is deliberately kept behind this
// one small interface: today it is the browser's own Web Speech API (free, no
// key, no server), but the audio leaves the tenant via Chrome's recogniser, so
// this is the file that gets swapped for Azure AI Speech when that is
// provisioned. Nothing outside this file knows which engine is running.

/** What a transcriber reports back while, and after, the lead is speaking. */
export interface TranscriberHandlers {
  /** Words the engine has committed to. Append-only; never re-sent. */
  onFinal: (text: string) => void;
  /** The current in-flight guess, replaced on every update. */
  onInterim: (text: string) => void;
  /** Fatal enough to stop the session. The caller shows this to the lead. */
  onError: (message: string) => void;
  /** Fired once the engine has genuinely stopped, however it stopped. */
  onStop: () => void;
}

export interface Transcriber {
  start: () => void;
  stop: () => void;
}

/** Why voice is unavailable, phrased for the lead rather than for a developer. */
export type SpeechSupport =
  | { ok: true }
  | { ok: false; reason: string };

// Web Speech is unprefixed in Edge and prefixed in Chrome and Safari, and is
// absent in Firefox. Insecure origins expose the constructor but throw on
// start(), so the https check belongs here rather than at call time.
function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupport(): SpeechSupport {
  if (typeof window === "undefined") return { ok: false, reason: "Not available here." };
  if (!window.isSecureContext) {
    return { ok: false, reason: "Voice needs a secure (https) connection." };
  }
  if (!recognitionCtor()) {
    return {
      ok: false,
      reason: "This browser cannot listen yet. Chrome or Edge can, or you can type below."
    };
  }
  return { ok: true };
}

/**
 * Starts a dictation session that survives the lead pausing to think.
 *
 * Chrome ends recognition on every natural silence even with `continuous` set,
 * which would silently swallow the second half of a two minute update. So a
 * stop we did not ask for is treated as a pause and restarted, and only an
 * explicit stop() ends the session. `interimResults` is on so the lead can see
 * they are being heard, which is what stops people repeating themselves.
 */
export function createTranscriber(handlers: TranscriberHandlers): Transcriber | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  // Indian English is the closest published model for the leads using this and
  // handles the names and place references noticeably better than en-US.
  recognition.lang = "en-IN";

  let wanted = false;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) handlers.onFinal(text);
      else interim += text;
    }
    handlers.onInterim(interim);
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    // "no-speech" and "aborted" are ordinary parts of a long dictation: the
    // lead thinking, or our own restart racing the engine. Only surface the
    // ones that genuinely end the session, or the lead gets a scary banner for
    // pausing mid sentence.
    if (event.error === "no-speech" || event.error === "aborted") return;
    wanted = false;
    handlers.onError(
      event.error === "not-allowed"
        ? "Microphone access was blocked. Allow it in the browser address bar, or type below."
        : `Could not hear you (${event.error}). You can type below instead.`
    );
  };

  recognition.onend = () => {
    if (wanted) {
      // A pause, not a finish. Restart, but never let a failing restart spin.
      try {
        recognition.start();
        return;
      } catch {
        wanted = false;
      }
    }
    handlers.onStop();
  };

  return {
    start() {
      if (wanted) return;
      wanted = true;
      try {
        recognition.start();
      } catch (err) {
        wanted = false;
        handlers.onError((err as Error).message || "Could not start listening.");
        handlers.onStop();
      }
    },
    stop() {
      wanted = false;
      try {
        recognition.stop();
      } catch {
        handlers.onStop();
      }
    }
  };
}

// ── Minimal Web Speech typings ───────────────────────────────
// Still not in TypeScript's DOM library, so declare only what is used above.
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}
