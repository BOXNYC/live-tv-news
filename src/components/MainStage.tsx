"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EmbedSource, ResolvedStream } from "@/lib/streams/types";
import { ProviderBadge } from "./ProviderBadge";
import { SOURCE_LABEL, StreamPlayer } from "./StreamPlayer";
import { ExpandIcon, ShrinkIcon, SpeakerIcon, SpeakerOffIcon } from "./icons";

interface MainStageProps {
  stream: ResolvedStream | null;
  providerName: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onAutoplayBlocked: () => void;
}

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

export function MainStage({ stream, providerName, muted, onToggleMute, onAutoplayBlocked }: MainStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else {
      // iOS Safari: only <video> can go fullscreen.
      el.querySelector<WebkitVideo>("video")?.webkitEnterFullscreen?.();
    }
  }, []);

  const renderOverlay = useCallback(
    (source: EmbedSource | null) => {
      if (!stream) return null;
      const controllable = source?.type === "hls" || source?.type === "youtube";
      return (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2 bg-gradient-to-b from-black/75 to-transparent p-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-2">
              <ProviderBadge providerId={stream.providerId} />
              <span className="truncate text-sm font-semibold text-white drop-shadow sm:text-base">
                {stream.name}
              </span>
              <span className="flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                LIVE
              </span>
            </div>
            {source && (
              <span
                className="shrink-0 rounded border border-white/25 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300"
                title={`${providerName ?? stream.providerId.toUpperCase()} · source type`}
              >
                {SOURCE_LABEL[source.type]}
              </span>
            )}
          </div>

          <div className="flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 sm:p-4">
            <div>
              {controllable && muted && (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                >
                  <SpeakerOffIcon className="h-4 w-4" />
                  Tap to unmute
                </button>
              )}
              {source?.type === "iframe" && (
                <span className="rounded bg-black/60 px-2 py-1 text-[11px] text-zinc-300 ring-1 ring-white/15">
                  Audio controlled in player
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {controllable && !muted && (
                <button
                  type="button"
                  onClick={onToggleMute}
                  aria-label="Mute"
                  className="pointer-events-auto rounded-full bg-black/50 p-2 text-white ring-1 ring-white/20 transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-red-500"
                >
                  <SpeakerIcon className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="pointer-events-auto rounded-full bg-black/50 p-2 text-white ring-1 ring-white/20 transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-red-500"
              >
                {isFullscreen ? <ShrinkIcon className="h-5 w-5" /> : <ExpandIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      );
    },
    [stream, providerName, muted, onToggleMute, toggleFullscreen, isFullscreen],
  );

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl shadow-black/60 ring-1 ring-white/10 [&:fullscreen]:rounded-none"
    >
      {stream ? (
        <StreamPlayer
          key={stream.id}
          stream={stream}
          muted={muted}
          variant="main"
          onAutoplayBlocked={onAutoplayBlocked}
          renderOverlay={renderOverlay}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          Pick a stream to start watching
        </div>
      )}
    </div>
  );
}
