"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EmbedSource, ResolvedStream } from "@/lib/streams/types";
import { SOURCE_LABEL, StreamPlayer } from "./StreamPlayer";
import { ExpandIcon, ShrinkIcon, SpeakerIcon, SpeakerOffIcon } from "./icons";

interface MainStageProps {
  stream: ResolvedStream | null;
  providerName: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onAutoplayBlocked: () => void;
  /** Idle: fade the overlay controls so the video is clean. */
  controlsHidden: boolean;
  /** PiP tiles are docked at the bottom: keep the controls clear of them. */
  hasPip: boolean;
  /** Minimized PiPs are collapsed into a tab in the bottom-right corner: keep the controls clear of it. */
  hasPipTab: boolean;
}

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

export function MainStage({
  stream,
  providerName,
  muted,
  onToggleMute,
  onAutoplayBlocked,
  controlsHidden,
  hasPip,
  hasPipTab,
}: MainStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
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
      if (!stream || !overlayHost) return null;
      const controllable = source?.type === "hls" || source?.type === "youtube";
      const interactive = controlsHidden ? "pointer-events-none" : "pointer-events-auto";
      // Portaled to a full-viewport layer so the controls sit in the screen corners (clear of
      // notches) rather than inside the letterboxed 16:9 frame.
      return createPortal(
        <div
          data-pip={hasPip}
          data-pip-tab={hasPipTab}
          className={`stage-bottom absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 via-black/35 to-transparent pt-20 transition-opacity duration-500 ease-out motion-reduce:transition-none ${
            controlsHidden ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="flex min-w-0 flex-col items-start gap-2">
            <div className="flex max-w-full min-w-0 items-center gap-2">
              <span className="flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                LIVE
              </span>
              <span className="truncate text-sm font-semibold text-white drop-shadow sm:text-base">
                {stream.name}
              </span>
              {source && (
                <span
                  className="shrink-0 rounded border border-white/25 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-300"
                  title={`${providerName ?? stream.providerId.toUpperCase()} · source type`}
                >
                  {SOURCE_LABEL[source.type]}
                </span>
              )}
            </div>
            {controllable && muted && (
              <button
                type="button"
                onClick={onToggleMute}
                className={`${interactive} flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500`}
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
          <div className="flex shrink-0 gap-2">
            {controllable && !muted && (
              <button
                type="button"
                onClick={onToggleMute}
                aria-label="Mute"
                className={`${interactive} rounded-full bg-black/50 p-2 text-white ring-1 ring-white/20 transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-red-500`}
              >
                <SpeakerIcon className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className={`${interactive} rounded-full bg-black/50 p-2 text-white ring-1 ring-white/20 transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-red-500`}
            >
              {isFullscreen ? <ShrinkIcon className="h-5 w-5" /> : <ExpandIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>,
        overlayHost,
      );
    },
    [stream, overlayHost, controlsHidden, hasPip, hasPipTab, providerName, muted, onToggleMute, toggleFullscreen, isFullscreen],
  );

  return (
    <div ref={containerRef} className="stage absolute inset-0 overflow-hidden bg-black">
      {/* Letterboxed 16:9 frame, as large as fits and centered. */}
      <div className="absolute inset-0 flex items-center justify-center">
        {stream ? (
          <div className="stage-frame relative">
            <StreamPlayer
              key={stream.id}
              stream={stream}
              muted={muted}
              variant="main"
              onAutoplayBlocked={onAutoplayBlocked}
              renderOverlay={renderOverlay}
            />
          </div>
        ) : (
          <p className="px-6 text-center text-sm text-zinc-400">Pick a stream to start watching</p>
        )}
      </div>
      <div ref={setOverlayHost} data-keep-awake className="pointer-events-none absolute inset-0" />
    </div>
  );
}
