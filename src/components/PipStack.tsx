"use client";

import { useId } from "react";
import type { ResolvedStream } from "@/lib/streams/types";
import { ChevronUpIcon, CloseIcon } from "./icons";
import { ProviderBadge } from "./ProviderBadge";
import { StreamPlayer } from "./StreamPlayer";

interface PipStackProps {
  streams: ResolvedStream[];
  /** Stream on the main player, shown as a "now playing" card in the list when it has 2+ tiles. */
  active: ResolvedStream | null;
  /** Whole stack hidden behind the corner toggle (tiles unmount, so hidden streams stop loading). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onPromote: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Previously watched streams, floating over the full-screen player (above the header panel).
 * Mobile: a bottom-aligned horizontal row. Desktop (lg+): a bottom-right column, most recent
 * nearest the corner. With 2+ tiles, a "now playing" card for the main stream leads the list
 * so the whole lineup reads in one place. A toggle in the bottom-right corner shows or hides the whole stack.
 * Tiles never idle-hide.
 */
export function PipStack({ streams, active, collapsed, onToggleCollapsed, onPromote, onClose }: PipStackProps) {
  const listId = useId();
  if (streams.length === 0) return null;
  const count = `${streams.length} picture-in-picture ${streams.length === 1 ? "stream" : "streams"}`;
  return (
    <section
      aria-label="Picture-in-picture streams"
      className="pip-dock flex items-end gap-(--pip-gap) lg:flex-col"
    >
      <h2 className="sr-only">Recently watched</h2>
      {!collapsed && (
        <ul
          id={listId}
          className="pointer-events-auto -m-1 mr-auto flex w-max min-w-0 max-w-[calc(100%+0.5rem)] snap-x gap-(--pip-gap) overflow-x-auto overscroll-contain p-1 lg:mr-0 lg:ml-auto lg:max-h-[calc(100dvh-var(--bar-h)-var(--pip-tab-h)-env(safe-area-inset-top)-3rem)] lg:flex-col-reverse lg:overflow-x-hidden lg:overflow-y-auto"
        >
          {active && streams.length > 1 && (
            <li className="shrink-0 snap-start">
              <NowPlayingCard stream={active} />
            </li>
          )}
          {streams.map((stream) => (
            <li key={stream.id} className="shrink-0 snap-start">
              <PipTile stream={stream} onPromote={onPromote} onClose={onClose} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : listId}
        aria-label={`${collapsed ? "Show" : "Hide"} ${count}`}
        className="pointer-events-auto ml-auto flex h-(--pip-tab-h) shrink-0 items-center gap-2 rounded-full bg-zinc-900/90 pr-3 pl-1.5 text-xs font-semibold text-zinc-100 shadow-xl shadow-black/70 ring-1 ring-white/25 backdrop-blur transition hover:ring-white/50 focus-visible:outline-2 focus-visible:outline-red-500"
      >
        <span className="flex -space-x-1.5" aria-hidden>
          {streams.slice(0, 3).map((s) => (
            <ProviderBadge key={s.id} providerId={s.providerId} size="sm" decorative />
          ))}
        </span>
        <span aria-hidden>{collapsed ? streams.length : "Hide"}</span>
        <ChevronUpIcon className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </button>
    </section>
  );
}

/** Placeholder for the main stream inside the PiP list: logo, channel and a playing indicator. */
function NowPlayingCard({ stream }: { stream: ResolvedStream }) {
  return (
    <div
      aria-current="true"
      className="relative flex aspect-video w-(--pip-w) flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-zinc-900/90 p-2 text-center shadow-xl shadow-black/70 ring-2 ring-red-600/80 backdrop-blur"
    >
      <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-red-600 px-1.5 py-px text-[9px] font-bold tracking-wider text-white uppercase">
        <span className="flex h-2 items-end gap-px" aria-hidden>
          <span className="w-0.5 animate-[eq_0.9s_ease-in-out_infinite] bg-white motion-reduce:animate-none" />
          <span className="w-0.5 animate-[eq_0.9s_ease-in-out_-0.3s_infinite] bg-white motion-reduce:animate-none" />
          <span className="w-0.5 animate-[eq_0.9s_ease-in-out_-0.6s_infinite] bg-white motion-reduce:animate-none" />
        </span>
        Now playing
      </span>
      <ProviderBadge providerId={stream.providerId} size="md" />
      <span className="line-clamp-1 text-xs font-semibold text-zinc-100">{stream.name}</span>
    </div>
  );
}

function PipTile({
  stream,
  onPromote,
  onClose,
}: {
  stream: ResolvedStream;
  onPromote: (id: string) => void;
  onClose: (id: string) => void;
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose(stream.id);
        }}
        aria-label={`Close ${stream.name}`}
        className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1 text-white ring-1 ring-white/25 transition hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-red-500"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
