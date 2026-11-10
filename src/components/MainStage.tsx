"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EmbedSource, ResolvedStream } from "@/lib/streams/types";
import { SOURCE_LABEL, StreamPlayer, type OverlayInfo } from "./StreamPlayer";
import { ExpandIcon, PlayIcon, ShrinkIcon, SpeakerIcon, SpeakerOffIcon } from "./icons";

export type SwipeDirection = "left" | "right";

const SWIPE_MIN_PX = 50;
const TAP_MAX_PX = 10;
const TAP_MAX_MS = 500;

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
  /** The PiP show/hide toggle sits in the bottom-right corner: keep the controls clear of it. */
  hasPipTab: boolean;
  paused: boolean;
  /** Resumed after a pause: playing behind the live edge until the user goes live. */
  behindLive: boolean;
  /** Jump to the live edge (and resume). */
  onGoLive: () => void;
  /** Incremented by the parent on "Go live"; players seek to the live edge when it changes. */
  liveSeq: number;
  captions: boolean;
  onToggleCaptions: () => void;
  /** Tap on the video. */
  onTogglePause: () => void;
  /** Horizontal swipe on the video. */
  onSwipe: (direction: SwipeDirection) => void;
}

/**
 * Transparent layer over a controllable video: a tap toggles pause, a horizontal swipe (touch or
 * mouse drag) reports its direction. Sits under the overlay controls so they stay clickable.
 */
function GestureLayer({ onTap, onSwipe }: { onTap: () => void; onSwipe: (d: SwipeDirection) => void }) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  return (
    <div
      aria-hidden
      className="pointer-events-auto absolute inset-0 touch-none select-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        start.current = {
          x: e.clientX,
          y: e.clientY,
          t: e.timeStamp,
          id: e.pointerId,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
          onSwipe(dx > 0 ? "right" : "left");
        } else if (Math.hypot(dx, dy) <= TAP_MAX_PX && e.timeStamp - s.t <= TAP_MAX_MS) {
          onTap();
        }
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    />
  );
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
  paused,
  behindLive,
  onGoLive,
  liveSeq,
  captions,
  onToggleCaptions,
  onTogglePause,
  onSwipe,
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
    (source: EmbedSource | null, { captionsAvailable }: OverlayInfo) => {
      if (!stream || !overlayHost) return null;
      const controllable = source?.type === "hls" || source?.type === "youtube";
      const interactive = controlsHidden ? "pointer-events-none" : "pointer-events-auto";
      // Portaled to a full-viewport layer so the controls sit in the screen corners (clear of
      // notches) rather than inside the letterboxed 16:9 frame.
      return createPortal(
        <>
          {controllable ? (
            <GestureLayer onTap={onTogglePause} onSwipe={onSwipe} />
          ) : (
            // Provider embeds keep their own controls, so no gestures here. While idle, a layer
            // over the cross-origin iframe catches the first touch or mouse move to wake the UI.
            controlsHidden && <div aria-hidden className="pointer-events-auto absolute inset-0" />
          )}
          {controllable && paused && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex flex-col items-center gap-2" role="status">
                <span className="rounded-full bg-black/60 p-5 text-white ring-1 ring-white/25 backdrop-blur">
                  <PlayIcon className="h-10 w-10 translate-x-0.5" />
                </span>
                <span className="rounded bg-black/60 px-2 py-0.5 text-xs font-semibold text-zinc-200">
                  Paused · tap to resume
                </span>
              </span>
            </div>
          )}
          {controllable && paused && (
            // Separate from the indicator so only the button is clickable; taps elsewhere resume.
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex translate-y-24 justify-center">
              <button
                type="button"
                onClick={onGoLive}
                className="pointer-events-auto flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                Go live
              </button>
            </div>
          )}
          <div
            data-pip={hasPip}
            data-pip-tab={hasPipTab}
            className={`stage-bottom absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 via-black/35 to-transparent pt-20 transition-opacity duration-500 ease-out motion-reduce:transition-none ${
              controlsHidden ? "opacity-0" : "opacity-100"
            }`}
          >
            <div className="flex min-w-0 flex-col items-start gap-2">
              <div className="flex max-w-full min-w-0 items-center gap-2">
                {controllable && behindLive ? (
                  <button
                    type="button"
                    onClick={onGoLive}
                    title="Playing behind live. Jump to live"
                    className={`${interactive} flex shrink-0 items-center gap-1 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase ring-1 ring-white/20 transition hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-red-500`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" aria-hidden />
                    Go live
                  </button>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                    LIVE
                  </span>
                )}
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
              {captionsAvailable && (
                <button
                  type="button"
                  onClick={onToggleCaptions}
                  aria-pressed={captions}
                  aria-label="Closed captions"
                  title={captions ? "Turn captions off" : "Turn captions on"}
                  className={`${interactive} rounded-full px-2.5 py-2 text-xs leading-5 font-bold ring-1 transition focus-visible:outline-2 focus-visible:outline-red-500 ${
                    captions
                      ? "bg-white text-black ring-white hover:bg-zinc-200"
                      : "bg-black/50 text-white ring-white/20 hover:bg-black/70"
                  }`}
                >
                  CC
                </button>
              )}
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
          </div>
        </>,
        overlayHost,
      );
    },
    [
      stream,
      overlayHost,
      controlsHidden,
      hasPip,
      hasPipTab,
      providerName,
      muted,
      onToggleMute,
      toggleFullscreen,
      isFullscreen,
      paused,
      behindLive,
      onGoLive,
      captions,
      onToggleCaptions,
      onTogglePause,
      onSwipe,
    ],
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
              paused={paused}
              captions={captions}
              liveSeq={liveSeq}
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
