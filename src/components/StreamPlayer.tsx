"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { EmbedSource, ResolvedStream } from "@/lib/streams/types";
import { HlsPlayer } from "./players/HlsPlayer";
import { YouTubePlayer } from "./players/YouTubePlayer";
import { ProviderBadge } from "./ProviderBadge";

export type PlayerVariant = "main" | "pip";

interface StreamPlayerProps {
  stream: ResolvedStream;
  /** Ordered candidates, primary first. Defaults to stream.sources. */
  sources?: EmbedSource[];
  muted: boolean;
  variant: PlayerVariant;
  /** HLS only: the browser refused unmuted autoplay, playback continued muted. */
  onAutoplayBlocked?: () => void;
  /** Chrome drawn above the video (main player overlay). Receives the source currently in use. */
  renderOverlay?: (source: EmbedSource | null) => ReactNode;
}

export const SOURCE_LABEL: Record<EmbedSource["type"], string> = {
  hls: "HLS",
  youtube: "YouTube",
  iframe: "Embed",
};

/**
 * Renders a stream with the first working source, falling back down `sources` on fatal errors.
 * Parents key this component by stream id so fallback state never leaks between streams.
 */
export function StreamPlayer({
  stream,
  sources = stream.sources,
  muted,
  variant,
  onAutoplayBlocked,
  renderOverlay,
}: StreamPlayerProps) {
  const [index, setIndex] = useState(0);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const source: EmbedSource | undefined = sources[index];
  const isPip = variant === "pip";

  const handleFatal = useCallback(
    (reason: string) => {
      setLastError(reason);
      setIndex((i) => (i === index ? i + 1 : i));
    },
    [index],
  );
  const handlePlaying = useCallback(() => setPlayingIndex(index), [index]);
  const retry = useCallback(() => {
    setLastError(null);
    setPlayingIndex(null);
    setIndex(0);
  }, []);

  let body: ReactNode;
  if (!source) {
    body = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-950 p-4 text-center">
        <span className={`font-semibold text-zinc-200 ${isPip ? "text-xs" : "text-lg"}`}>
          Stream unavailable
        </span>
        {!isPip && (
          <>
            <span className="max-w-sm text-sm text-zinc-500">
              {sources.length === 0
                ? "No playable sources are configured for this stream."
                : `All ${sources.length} source${sources.length > 1 ? "s" : ""} failed${lastError ? ` (${lastError})` : ""}.`}
            </span>
            {sources.length > 0 && (
              <button
                type="button"
                onClick={retry}
                className="pointer-events-auto mt-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-red-500"
              >
                Try again
              </button>
            )}
          </>
        )}
      </div>
    );
  } else if (source.type === "hls") {
    body = (
      <HlsPlayer
        key={`${stream.id}:${index}`}
        url={source.url}
        muted={muted}
        onFatal={handleFatal}
        onPlaying={handlePlaying}
        onAutoplayBlocked={onAutoplayBlocked}
      />
    );
  } else if (source.type === "youtube") {
    body = (
      <YouTubePlayer
        key={`${stream.id}:${index}`}
        channelId={source.channelId}
        videoId={source.videoId}
        muted={muted}
        title={stream.name}
        onFatal={handleFatal}
        onPlaying={handlePlaying}
        interactive={!isPip}
      />
    );
  } else if (isPip) {
    // Provider embed pages expose no mute API, so a live iframe in PiP would play audio on top of
    // the main stream (and we can't stop it). Instead show a static "paused" card; tapping the
    // tile promotes it to the main player, where it plays with its own audio controls.
    body = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-zinc-800 to-zinc-950 p-2 text-center">
        <ProviderBadge providerId={stream.providerId} size="sm" />
        <span className="line-clamp-1 text-xs font-semibold text-zinc-100">{stream.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Paused · tap to resume</span>
      </div>
    );
  } else {
    // Provider embed: not controllable (no mute/play API, no error events), so no fallback here.
    body = (
      <iframe
        key={`${stream.id}:${index}`}
        src={source.url}
        title={stream.name}
        className="h-full w-full border-0 bg-black"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }

  const tracksPlayback = source?.type === "hls";
  const showConnecting = tracksPlayback && playingIndex !== index && index === 0;
  const showBackup = !!source && index > 0 && playingIndex !== index;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {body}
      {showConnecting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className={`animate-spin rounded-full border-2 border-white/20 border-t-white/80 ${isPip ? "h-5 w-5" : "h-10 w-10"}`}
            aria-label="Connecting"
            role="status"
          />
        </div>
      )}
      {showBackup && (
        <div
          role="status"
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-amber-500/90 font-medium text-black ${
            isPip ? "bottom-1 px-2 py-0.5 text-[10px]" : "bottom-16 px-3 py-1 text-xs"
          } ${tracksPlayback ? "" : "animate-fade-out-late"}`}
        >
          Trying backup source…
        </div>
      )}
      {renderOverlay?.(source ?? null)}
    </div>
  );
}
