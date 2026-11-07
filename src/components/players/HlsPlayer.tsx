"use client";

import { useEffect, useRef } from "react";
import type Hls from "hls.js";

const STALL_TIMEOUT_MS = 15_000;
const WATCHDOG_INTERVAL_MS = 3_000;

interface HlsPlayerProps {
  url: string;
  muted: boolean;
  /** Unrecoverable failure: the parent should try the next source. */
  onFatal: (reason: string) => void;
  /** Playback is progressing (used to clear "connecting" UI). */
  onPlaying?: () => void;
  /** Browser refused to start playback with sound; we fell back to muted playback. */
  onAutoplayBlocked?: () => void;
}

/**
 * Plays an HLS manifest in our own <video>. Uses native HLS where supported (Safari/iOS),
 * otherwise lazy-loads hls.js. Remounted by the parent (via key) whenever the source changes.
 */
export function HlsPlayer({ url, muted, onFatal, onPlaying, onAutoplayBlocked }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Latest callbacks/mute without restarting the pipeline when they change.
  const cb = useRef({ onFatal, onPlaying, onAutoplayBlocked, muted });
  useEffect(() => {
    cb.current = { onFatal, onPlaying, onAutoplayBlocked, muted };
  });

  // Attach the source (native or hls.js), plus a stall watchdog.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let failed = false;
    let hls: Hls | null = null;

    const fail = (reason: string) => {
      if (disposed || failed) return;
      failed = true;
      cb.current.onFatal(reason);
    };

    const tryPlay = () => {
      video.muted = cb.current.muted;
      video.play().catch((err: unknown) => {
        if (disposed) return;
        if (err instanceof DOMException && err.name === "NotAllowedError" && !video.muted) {
          // Autoplay with sound blocked: keep the stream running muted and tell the parent.
          video.muted = true;
          cb.current.onAutoplayBlocked?.();
          video.play().catch(() => {});
        }
      });
    };

    // --- Stall watchdog: no playback progress for STALL_TIMEOUT_MS → fall back. ---
    let lastTime = -1;
    let lastProgressAt = Date.now();
    let reportedPlaying = false;
    const watchdog = window.setInterval(() => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastProgressAt = Date.now();
        return;
      }
      // A paused, fully-buffered video (e.g. autoplay refused) isn't a stall.
      const waitingForData = !video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
      if (!waitingForData) {
        lastProgressAt = Date.now();
        return;
      }
      if (Date.now() - lastProgressAt > STALL_TIMEOUT_MS) fail("Stream stalled");
    }, WATCHDOG_INTERVAL_MS);

    const handlePlaying = () => {
      if (reportedPlaying) return;
      reportedPlaying = true;
      cb.current.onPlaying?.();
    };
    video.addEventListener("playing", handlePlaying);

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    const handleNativeError = () => fail("Video element error");

    if (nativeHls) {
      video.addEventListener("error", handleNativeError);
      video.src = url;
      tryPlay();
    } else {
      import("hls.js")
        .then(({ default: HlsCtor }) => {
          if (disposed) return;
          if (!HlsCtor.isSupported()) {
            fail("HLS not supported in this browser");
            return;
          }
          const retry = { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 8000 };
          const instance = new HlsCtor({
            lowLatencyMode: false,
            // Important for PiP tiles: don't pull 1080p renditions into a 200px tile.
            capLevelToPlayerSize: true,
            manifestLoadPolicy: {
              default: {
                maxTimeToFirstByteMs: 10_000,
                maxLoadTimeMs: 20_000,
                timeoutRetry: retry,
                errorRetry: retry,
              },
            },
            playlistLoadPolicy: {
              default: {
                maxTimeToFirstByteMs: 10_000,
                maxLoadTimeMs: 20_000,
                timeoutRetry: retry,
                errorRetry: retry,
              },
            },
          });
          hls = instance;
          let recoveredMedia = false;
          instance.on(HlsCtor.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
              recoveredMedia = true;
              instance.recoverMediaError();
              return;
            }
            fail(`HLS ${data.type}: ${data.details}`);
          });
          instance.on(HlsCtor.Events.MANIFEST_PARSED, tryPlay);
          instance.loadSource(url);
          instance.attachMedia(video);
        })
        .catch(() => fail("Could not load the HLS player"));
    }

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleNativeError);
      hls?.destroy();
      hls = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);

  // Apply mute changes to the live element (the `muted` attribute is only read on mount).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (!muted && video.paused) video.play().catch(() => {});
  }, [muted]);

  return (
    <video
      ref={videoRef}
      className="h-full w-full bg-black object-contain"
      playsInline
      muted
      autoPlay
      // No native controls: this is a live feed; mute/fullscreen live in our overlay.
      disablePictureInPicture
    />
  );
}
