// Pure speech-transcript parsing for voice control: wake word, then one command.
// Kept free of React/DOM (like player-state.ts) so the matching is easy to reason about and test.

/** What the user can ask for once the wake word has opened the command window. */
export type VoiceCommand = "next" | "previous" | "pause" | "resume" | "resumeLive";

export const COMMAND_LABEL: Record<VoiceCommand, string> = {
  next: "Next",
  previous: "Previous",
  pause: "Pause",
  resume: "Resume",
  resumeLive: "Resume live",
};

/** Spoken in this order on screen, and the order read out in titles and hints. */
export const COMMAND_ORDER: readonly VoiceCommand[] = [
  "next",
  "previous",
  "pause",
  "resume",
  "resumeLive",
];

/**
 * "Hey TV" / "Hey News". Recognition mangles the second word freely ("t v", "ATV", "telly"), so
 * the list is deliberately wide: it only has to beat ordinary speech, and a false open costs a
 * four-second window and a moment of quiet.
 */
const WAKE_RE = /\bhey\b ?(?:tv|t v|tee ?vee|teevee|tivo|telly|tele|television|news|newz|new)\b/;

/**
 * Engines routinely drop the second word and return a bare "hey". Accepting that alone would
 * trigger on any "hey" in the room, so it counts only when it is the whole of the speech not yet
 * read — i.e. someone said "hey" and nothing else. Running commentary never looks like that.
 */
const BARE_WAKE_RE = /^hey$/;

/**
 * Checked in order, so "resume live" wins over the bare "resume" pattern below it. The
 * alternatives are words an engine plausibly returns for the same spoken command.
 */
const COMMAND_PATTERNS: readonly (readonly [VoiceCommand, RegExp])[] = [
  ["resumeLive", /\b(?:resume|resumes|go|back to)\s+live\b/],
  ["next", /\b(?:next|necks|nest)\b/],
  ["previous", /\b(?:previous|previously|prev|preview)\b/],
  ["pause", /\b(?:pause|pauses|paws|pods)\b/],
  ["resume", /\b(?:resume|resumes|resumed)\b/],
];

/** Lowercase, punctuation-free, single-spaced, so "Hey, TV!" reads the same as "hey tv". */
export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** First command in `text` by pattern priority, with the offset just past the match. */
function matchCommand(text: string): { command: VoiceCommand; end: number } | null {
  for (const [command, re] of COMMAND_PATTERNS) {
    const m = re.exec(text);
    if (m) return { command, end: m.index + m[0].length };
  }
  return null;
}

/**
 * Nothing to act on, the wake word (so the command window opens), or a command. `end` is the
 * offset just past what was acted on, so the caller can skip it when the same phrase is revised
 * and re-delivered.
 */
export type PhraseOutcome =
  | { kind: "none" }
  | { kind: "wake"; end: number }
  | { kind: "command"; command: VoiceCommand; end: number };

/**
 * Read the stretch of normalized transcript not yet acted on. With the command window open, only
 * commands count; otherwise nothing counts until the wake word, and a command spoken straight
 * after it ("hey TV, next") is taken right away.
 */
export function readPhrase(text: string, windowOpen: boolean): PhraseOutcome {
  if (windowOpen) {
    const hit = matchCommand(text);
    return hit ? { kind: "command", command: hit.command, end: hit.end } : { kind: "none" };
  }
  const wake = WAKE_RE.exec(text);
  if (wake) {
    const end = wake.index + wake[0].length;
    const hit = matchCommand(text.slice(end));
    return hit
      ? { kind: "command", command: hit.command, end: end + hit.end }
      : { kind: "wake", end };
  }
  if (BARE_WAKE_RE.test(text.trim())) return { kind: "wake", end: text.length };
  return { kind: "none" };
}

/**
 * How much settled transcript can be forgotten. Finalized text cannot be re-worded, so dropping it
 * keeps what remains short — which is what lets a bare "hey" read as the whole of the new speech.
 * Text ending in the first half of the wake phrase is kept, because engines routinely finalize
 * "hey" before the word that follows it ("hey" | "television") and the two must still read as one.
 */
export function settlePoint(text: string, settled: number): number {
  const m = /\bhey ?$/.exec(text.slice(0, settled));
  return m ? m.index : settled;
}
