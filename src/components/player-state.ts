// Pure player state: which stream is on the main player and which are stacked as PiP tiles.
// Kept free of React/DOM so the transitions are easy to reason about and test.

export const PIP_CAP = 4;
export const STORAGE_KEY = "live-tv-news:player-state:v1";

export interface PlayerState {
  /** Stream on the main player, or null before anything is chosen. */
  activeId: string | null;
  /** PiP stack, most recent first. Never contains activeId, never has duplicates. */
  pip: string[];
  /** PiP streams collapsed into the corner tab (a subset of `pip`, kept in `pip` order). */
  minimized: string[];
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
  /** Collapse a PiP tile into the corner tab (its player is unmounted while minimized). */
  | { type: "minimize"; id: string }
  /** Bring a minimized stream back as a PiP tile. */
  | { type: "restore"; id: string }
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

export interface SavedState {
  activeId: string | null;
  pip: string[];
  minimized: string[];
}

export const initialPlayerState: PlayerState = { activeId: null, pip: [], minimized: [], hydrated: false };

/** Keep `minimized` a subset of `pip`, in `pip` order. */
function minimizedWithin(pip: readonly string[], minimized: readonly string[]): string[] {
  const set = new Set(minimized);
  return pip.filter((id) => set.has(id));
}

function selectStream(state: PlayerState, id: string): PlayerState {
  if (state.activeId === id) return state;
  const rest = state.pip.filter((p) => p !== id);
  const pip = (state.activeId ? [state.activeId, ...rest] : rest).slice(0, PIP_CAP);
  // The promoted stream leaves the PiP stack; the old active one enters it as a visible tile.
  return { ...state, activeId: id, pip, minimized: minimizedWithin(pip, state.minimized.filter((m) => m !== id)) };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "select":
    case "promote":
      return selectStream(state, action.id);
    case "close": {
      if (!state.pip.includes(action.id)) return state;
      return {
        ...state,
        pip: state.pip.filter((p) => p !== action.id),
        minimized: state.minimized.filter((m) => m !== action.id),
      };
    }
    case "minimize": {
      if (!state.pip.includes(action.id) || state.minimized.includes(action.id)) return state;
      return { ...state, minimized: minimizedWithin(state.pip, [...state.minimized, action.id]) };
    }
    case "restore": {
      if (!state.minimized.includes(action.id)) return state;
      return { ...state, minimized: state.minimized.filter((m) => m !== action.id) };
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
      const capped = pip.slice(0, PIP_CAP);
      return { activeId, pip: capped, minimized: minimizedWithin(capped, action.saved?.minimized ?? []), hydrated: true };
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
    const { activeId, pip, minimized } = data as { activeId?: unknown; pip?: unknown; minimized?: unknown };
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : []);
    return {
      activeId: typeof activeId === "string" ? activeId : null,
      pip: strings(pip),
      minimized: strings(minimized),
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

export function saveState(state: Pick<PlayerState, "activeId" | "pip" | "minimized">) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeId: state.activeId, pip: state.pip, minimized: state.minimized }),
    );
  } catch {
    // Storage unavailable (private mode, quota, disabled) — persistence is best-effort.
  }
}
