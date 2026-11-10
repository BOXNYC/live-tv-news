// Pure player state: which stream is on the main player and which are stacked as PiP tiles.
// Kept free of React/DOM so the transitions are easy to reason about and test.

export const PIP_CAP = 4;
export const STORAGE_KEY = "live-tv-news:player-state:v1";

export interface PlayerState {
  /** Stream on the main player, or null before anything is chosen. */
  activeId: string | null;
  /** PiP stack, most recent first. Never contains activeId, never has duplicates. */
  pip: string[];
  /** Whole PiP stack hidden behind its corner toggle. */
  pipCollapsed: boolean;
  /** Closed captions on the main player (a user preference, remembered between visits). */
  captions: boolean;
  /** True once saved state (or the default stream) has been applied after the catalog loaded. */
  hydrated: boolean;
}

export type PlayerAction =
  /** Watch a stream on the main player (from a tab chip). */
  | { type: "select"; id: string }
  /** Tap on a PiP tile: identical semantics to select. */
  | { type: "promote"; id: string }
  /** Close a PiP tile. */
  | { type: "close"; id: string }
  /** Show or hide the whole PiP stack. */
  | { type: "togglePip" }
  /** Turn closed captions on or off. */
  | { type: "toggleCaptions" }
  /**
   * Swipe through the lineup [active, ...pip] as a loop: "next" plays pip[0] and sends the current
   * stream to the end; "previous" plays the last PiP and puts the current stream first. The cyclic
   * order is preserved, so repeated swipes walk the whole lineup and wrap around at both ends.
   */
  | { type: "next" }
  | { type: "previous" }
  /**
   * Apply saved state once the catalog is known. Unknown ids are dropped; if no valid active
   * stream remains, `fallbackActiveId` is used.
   */
  | {
      type: "hydrate";
      saved: SavedState | null;
      validIds: readonly string[];
      fallbackActiveId: string | null;
    };

/** What is persisted between visits, so a returning user continues with the same setup. */
export interface SavedState {
  activeId: string | null;
  pip: string[];
  pipCollapsed: boolean;
  captions: boolean;
}

export const initialPlayerState: PlayerState = {
  activeId: null,
  pip: [],
  pipCollapsed: false,
  captions: false,
  hydrated: false,
};

function selectStream(state: PlayerState, id: string): PlayerState {
  if (state.activeId === id) return state;
  const rest = state.pip.filter((p) => p !== id);
  const pip = state.activeId ? [state.activeId, ...rest] : rest;
  return { ...state, activeId: id, pip: pip.slice(0, PIP_CAP) };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "select":
    case "promote":
      return selectStream(state, action.id);
    case "close": {
      if (!state.pip.includes(action.id)) return state;
      return { ...state, pip: state.pip.filter((p) => p !== action.id) };
    }
    case "togglePip":
      return { ...state, pipCollapsed: !state.pipCollapsed };
    case "toggleCaptions":
      return { ...state, captions: !state.captions };
    case "next": {
      if (!state.activeId || state.pip.length === 0) return state;
      const [first, ...rest] = state.pip;
      return { ...state, activeId: first, pip: [...rest, state.activeId] };
    }
    case "previous": {
      if (!state.activeId || state.pip.length === 0) return state;
      const last = state.pip[state.pip.length - 1];
      return { ...state, activeId: last, pip: [state.activeId, ...state.pip.slice(0, -1)] };
    }
    case "hydrate": {
      const valid = new Set(action.validIds);
      const savedActive = action.saved?.activeId;
      const activeId =
        savedActive && valid.has(savedActive)
          ? savedActive
          : action.fallbackActiveId && valid.has(action.fallbackActiveId)
            ? action.fallbackActiveId
            : null;
      const seen = new Set<string>(activeId ? [activeId] : []);
      const pip: string[] = [];
      for (const id of action.saved?.pip ?? []) {
        if (typeof id !== "string" || !valid.has(id) || seen.has(id)) continue;
        seen.add(id);
        pip.push(id);
      }
      return {
        activeId,
        pip: pip.slice(0, PIP_CAP),
        pipCollapsed: action.saved?.pipCollapsed ?? false,
        captions: action.saved?.captions ?? false,
        hydrated: true,
      };
    }
    default:
      return state;
  }
}

/** Parse persisted state defensively (storage contents are untrusted). */
export function parseSavedState(raw: string | null): SavedState | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const { activeId, pip, pipCollapsed, captions } = data as {
      activeId?: unknown;
      pip?: unknown;
      pipCollapsed?: unknown;
      captions?: unknown;
    };
    return {
      activeId: typeof activeId === "string" ? activeId : null,
      pip: Array.isArray(pip) ? pip.filter((p): p is string => typeof p === "string") : [],
      pipCollapsed: pipCollapsed === true,
      captions: captions === true,
    };
  } catch {
    return null;
  }
}

export function loadSavedState() {
  try {
    return parseSavedState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveState(state: SavedState) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeId: state.activeId,
        pip: state.pip,
        pipCollapsed: state.pipCollapsed,
        captions: state.captions,
      } satisfies SavedState),
    );
  } catch {
    // Storage unavailable (private mode, quota, disabled) — persistence is best-effort.
  }
}
