"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { normalizePhrase, readPhrase, settlePoint, type VoiceCommand } from "./voice-phrases";

/** The command window closes this long after the wake word if nothing is recognized. */
export const COMMAND_WINDOW_MS = 4000;

/** How long a recognized command stays on screen as confirmation. */
const FEEDBACK_MS = 1600;

/** A command won't fire twice inside this window: engines re-deliver phrases they have reworded. */
const REPEAT_GUARD_MS = 1500;

/** A session that ran at least this long counts as healthy, so restart backoff resets. */
const HEALTHY_SESSION_MS = 1500;
const MAX_RESTARTS = 25;

// --- Minimal Web Speech API surface (not in TypeScript's DOM lib across versions). ---

interface SpeechAlternativeLike {
  readonly transcript: string;
}
interface SpeechResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: SpeechAlternativeLike;
}
interface SpeechResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechResultLike;
}
interface SpeechResultEventLike {
  readonly resultIndex: number;
  readonly results: SpeechResultListLike;
}
interface SpeechErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  abort(): void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Availability never changes while the page is open, so there is nothing to subscribe to. */
const subscribeNever = () => () => {};
const readSupported = () => recognitionCtor() !== null;
const serverSupported = () => false;

export interface VoiceCommandsState {
  /** This browser exposes the Web Speech API (Chrome, Edge, Safari). */
  supported: boolean;
  /** The wake word was heard: a command window is open, so the caller should duck the audio. */
  listening: boolean;
  /** Last recognized command, cleared after a moment; drives the on-screen confirmation. */
  lastCommand: VoiceCommand | null;
  /** Why recognition isn't running, if something went wrong. */
  error: string | null;
}

interface VoiceCommandsOptions {
  enabled: boolean;
  onCommand: (command: VoiceCommand) => void;
  /** Recognition can't run at all (no microphone, permission denied): turn the feature back off. */
  onUnavailable: (reason: string) => void;
}

/**
 * Hands-free control: while enabled, speech recognition runs continuously and listens only for the
 * wake word. Hearing it opens a {@link COMMAND_WINDOW_MS} window during which one command is taken;
 * the window then closes, whether or not anything was recognized.
 *
 * Recognition hears the TV through the microphone as well as the user, which is why the wake word
 * gates everything and why callers duck the stream audio while `listening` is true.
 */
export function useVoiceCommands({
  enabled,
  onCommand,
  onUnavailable,
}: VoiceCommandsOptions): VoiceCommandsState {
  // Read after hydration (the server can't know), without a mismatched first render.
  const supported = useSyncExternalStore(subscribeNever, readSupported, serverSupported);
  const [listening, setListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Latest callbacks without tearing down the recognition session when they change.
  const cb = useRef({ onCommand, onUnavailable });
  useEffect(() => {
    cb.current = { onCommand, onUnavailable };
  });

  // An error outlives the session that failed, and the auto-disable that followed, so the user can
  // read it; switching voice control back on is what clears it.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (enabled && error) setError(null);
  }

  useEffect(() => {
    if (!enabled) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    // Interim results let the wake word land as it is spoken rather than after a pause.
    recognition.interimResults = true;
    // The wake words and commands are English, so recognize English whatever the UI locale is.
    recognition.lang = "en-US";

    let disposed = false;
    /** Permission or hardware failure: don't restart. */
    let fatal = false;
    let windowTimer = 0;
    let feedbackTimer = 0;
    let restartTimer = 0;
    let restarts = 0;
    let startedAt = 0;
    /** The wake word was heard and the command window is open. */
    let open = false;
    // The exact stretch of transcript already acted on, so a phrase fires once however many times
    // the engine re-delivers it. Held as text, not a length, because engines also reword history.
    let consumed = "";
    let firedCommand: VoiceCommand | null = null;
    let firedAt = 0;

    const closeWindow = () => {
      open = false;
      window.clearTimeout(windowTimer);
      setListening(false);
    };

    const openWindow = () => {
      open = true;
      setListening(true);
      window.clearTimeout(windowTimer);
      windowTimer = window.setTimeout(closeWindow, COMMAND_WINDOW_MS);
    };

    const fire = (command: VoiceCommand) => {
      closeWindow();
      // A reworded transcript can present the same phrase again; act on it once.
      if (command === firedCommand && Date.now() - firedAt < REPEAT_GUARD_MS) return;
      firedCommand = command;
      firedAt = Date.now();
      setLastCommand(command);
      window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => setLastCommand(null), FEEDBACK_MS);
      cb.current.onCommand(command);
    };

    recognition.onresult = (event) => {
      if (disposed) return;
      // Read the whole session transcript as one string. Engines hand back several results and
      // shuffle words across the boundary between them as they re-think ("hey" | " television"
      // becomes "hey television"), so per-result parsing loses phrases that straddle a boundary.
      // Joined, the transcript only ever grows, which one offset can track.
      let text = "";
      /** Length up to the last finalized result: that much can never be re-worded. */
      let settled = 0;
      for (let i = 0; i < event.results.length; i++) {
        const part = normalizePhrase(event.results[i]?.[0]?.transcript ?? "");
        if (part) text = text ? `${text} ${part}` : part;
        if (event.results[i]?.isFinal) settled = text.length;
      }
      // Engines revise what they have already said. When the transcript no longer starts with
      // what was acted on, history was reworded: read it afresh, guarded against a repeat.
      const already = text.startsWith(consumed) ? consumed.length : 0;
      const fresh = text.slice(already);
      if (!fresh) return;

      const outcome = readPhrase(fresh, open);
      if (outcome.kind === "none") {
        consumed = text.slice(0, Math.max(already, settlePoint(text, settled)));
        return;
      }
      consumed = text.slice(0, already + outcome.end);
      if (outcome.kind === "command") fire(outcome.command);
      else openWindow();
    };

    recognition.onerror = (event) => {
      if (disposed) return;
      const reason =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked."
          : event.error === "audio-capture"
            ? "No microphone was found."
            : null;
      if (!reason) return; // "no-speech", "network", "aborted": onend restarts the session.
      fatal = true;
      setError(reason);
      cb.current.onUnavailable(reason);
    };

    const start = () => {
      try {
        recognition.start();
        startedAt = Date.now();
      } catch {
        // Already running (a stop that hadn't landed yet): nothing to do.
      }
    };

    recognition.onend = () => {
      if (disposed || fatal) return;
      closeWindow();
      consumed = "";
      if (Date.now() - startedAt > HEALTHY_SESSION_MS) restarts = 0;
      if (restarts >= MAX_RESTARTS) {
        setError("Voice control kept stopping, so it was turned off.");
        cb.current.onUnavailable("Voice control kept stopping.");
        return;
      }
      // Chrome ends a session after a stretch of silence; restart to keep the wake word live.
      restarts += 1;
      restartTimer = window.setTimeout(start, Math.min(200 * restarts, 2000));
    };

    start();

    return () => {
      disposed = true;
      window.clearTimeout(windowTimer);
      window.clearTimeout(feedbackTimer);
      window.clearTimeout(restartTimer);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Never started; nothing to abort.
      }
      setListening(false);
      setLastCommand(null);
    };
  }, [enabled]);

  return { supported, listening, lastCommand, error };
}
