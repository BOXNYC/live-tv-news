"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ResolvedStream } from "@/lib/streams/types";
import { ChevronUpIcon, CloseIcon, MinimizeIcon } from "./icons";
import { ProviderBadge } from "./ProviderBadge";
import { StreamPlayer } from "./StreamPlayer";

interface PipStackProps {
  /** Visible PiP tiles. */
  streams: ResolvedStream[];
  /** PiPs collapsed into the corner tab (no player mounted). */
  minimized: ResolvedStream[];
  onPromote: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onRestore: (id: string) => void;
}

/**
 * Previously watched streams, floating over the full-screen player (above the header panel).
 * Mobile: a bottom-aligned horizontal row. Desktop (lg+): a bottom-right column, most recent
 * nearest the corner. Minimized PiPs collapse into a tab in the bottom-right corner.
 * Tiles never idle-hide.
 */
export function PipStack({ streams, minimized, onPromote, onClose, onMinimize, onRestore }: PipStackProps) {
  if (streams.length === 0 && minimized.length === 0) return null;
  return (
    <section
      aria-label="Picture-in-picture streams"
      className="pip-dock flex items-end gap-(--pip-gap) lg:flex-col"
    >
      <h2 className="sr-only">Recently watched</h2>
      {streams.length > 0 && (
        <ul className="pointer-events-auto -m-1 mr-auto flex w-max min-w-0 max-w-[calc(100%+0.5rem)] snap-x gap-(--pip-gap) overflow-x-auto overscroll-contain p-1 lg:mr-0 lg:ml-auto lg:max-h-[calc(100dvh-var(--bar-h)-var(--pip-tab-h)-env(safe-area-inset-top)-3rem)] lg:flex-col-reverse lg:overflow-x-hidden lg:overflow-y-auto">
          {streams.map((stream) => (
            <li key={stream.id} className="shrink-0 snap-start">
              <PipTile stream={stream} onPromote={onPromote} onClose={onClose} onMinimize={onMinimize} />
            </li>
          ))}
        </ul>
      )}
      {minimized.length > 0 && (
        <MinimizedTab streams={minimized} onPromote={onPromote} onRestore={onRestore} onClose={onClose} />
      )}
    </section>
  );
}

function PipTile({
  stream,
  onPromote,
  onClose,
  onMinimize,
}: {
  stream: ResolvedStream;
  onPromote: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
}) {
  return (
    <div className="group relative aspect-video w-(--pip-w) overflow-hidden rounded-lg bg-black shadow-xl shadow-black/70 ring-1 ring-white/25 transition hover:ring-white/50">
      {/* Live preview is purely visual: pointer events go to the promote button above it. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <StreamPlayer key={stream.id} stream={stream} muted variant="pip" />
      </div>
      <button
        type="button"
        onClick={() => onPromote(stream.id)}
        aria-label={`Watch ${stream.name}`}
        className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/0 to-black/0 p-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-500"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ProviderBadge providerId={stream.providerId} size="sm" />
          <span className="truncate text-xs font-medium text-white drop-shadow">{stream.name}</span>
        </span>
      </button>
      <div className="absolute top-1.5 right-1.5 flex gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMinimize(stream.id);
          }}
          aria-label={`Minimize ${stream.name}`}
          className="rounded-full bg-black/70 p-1 text-white ring-1 ring-white/25 transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-red-500"
        >
          <MinimizeIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose(stream.id);
          }}
          aria-label={`Close ${stream.name}`}
          className="rounded-full bg-black/70 p-1 text-white ring-1 ring-white/25 transition hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-red-500"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Corner tab holding minimized PiPs. Opens a tray to restore, watch or close each one. */
function MinimizedTab({
  streams,
  onPromote,
  onRestore,
  onClose,
}: {
  streams: ResolvedStream[];
  onPromote: (id: string) => void;
  onRestore: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const trayId = useId();

  // Escape or a press outside closes the tray.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative ml-auto shrink-0">
      {open && (
        <ul
          id={trayId}
          aria-label="Minimized streams"
          className="absolute right-0 bottom-full mb-2 flex w-64 max-w-[calc(100vw-2*var(--pip-gap))] flex-col gap-1 rounded-xl bg-zinc-900/95 p-1.5 shadow-2xl shadow-black/70 ring-1 ring-white/15 backdrop-blur"
        >
          {streams.map((stream) => (
            <li key={stream.id} className="flex items-center gap-1 rounded-lg hover:bg-white/5">
              <button
                type="button"
                onClick={() => onRestore(stream.id)}
                aria-label={`Restore ${stream.name}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-red-500"
              >
                <ProviderBadge providerId={stream.providerId} size="sm" />
                <span className="truncate text-xs font-medium text-zinc-100">{stream.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onPromote(stream.id)}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-red-500"
              >
                Watch
                <span className="sr-only"> {stream.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onClose(stream.id)}
                aria-label={`Close ${stream.name}`}
                className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-red-600 hover:text-white focus-visible:outline-2 focus-visible:outline-red-500"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? trayId : undefined}
        aria-label={`${open ? "Hide" : "Show"} ${streams.length} minimized ${streams.length === 1 ? "stream" : "streams"}`}
        className="flex h-(--pip-tab-h) items-center gap-2 rounded-full bg-zinc-900/90 pr-3 pl-1.5 text-xs font-semibold text-zinc-100 shadow-xl shadow-black/70 ring-1 ring-white/25 backdrop-blur transition hover:ring-white/50 focus-visible:outline-2 focus-visible:outline-red-500"
      >
        <span className="flex -space-x-1.5" aria-hidden>
          {streams.slice(0, 3).map((s) => (
            <ProviderBadge key={s.id} providerId={s.providerId} size="sm" decorative />
          ))}
        </span>
        <span aria-hidden>{streams.length}</span>
        <ChevronUpIcon className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
