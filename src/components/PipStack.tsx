"use client";

import type { ResolvedStream } from "@/lib/streams/types";
import { CloseIcon } from "./icons";
import { ProviderBadge } from "./ProviderBadge";
import { StreamPlayer } from "./StreamPlayer";

interface PipStackProps {
  streams: ResolvedStream[];
  onPromote: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Previously watched streams. Mobile: a horizontal strip under the main player (never covers it).
 * Desktop (lg+): a floating column in the bottom-right corner, most recent nearest the corner.
 */
export function PipStack({ streams, onPromote, onClose }: PipStackProps) {
  if (streams.length === 0) return null;
  return (
    <section
      aria-label="Picture-in-picture streams"
      className="lg:pointer-events-none lg:fixed lg:right-4 lg:bottom-4 lg:z-30"
    >
      <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase lg:sr-only">
        Recently watched
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col-reverse lg:overflow-visible lg:p-0">
        {streams.map((stream) => (
          <li key={stream.id} className="snap-start lg:pointer-events-auto">
            <PipTile stream={stream} onPromote={onPromote} onClose={onClose} />
          </li>
        ))}
      </ul>
    </section>
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
    <div className="group relative aspect-video w-44 overflow-hidden rounded-lg bg-black shadow-xl shadow-black/70 ring-1 ring-white/15 transition hover:ring-white/40 sm:w-52 lg:w-60">
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
