"use client";

import { useEffect, useRef } from "react";
import type Hls from "hls.js";

const STALL_TIMEOUT_MS = 15_000;
/** How far behind the live edge "Go live" lands when hls.js has no sync position (native HLS). */
const LIVE_EDGE_OFFSET_S = 3;

const isCaptionTrack = (t: TextTrack) => t.kind === "captions" || t.kind === "subtitles";

/**
 * Show the first caption/subtitle track or hide them all. Captions come from hls.js (CEA-608,
 * created hidden) or, with native HLS (Safari), the browser, which may apply the system caption
 * setting; either way the browser's text-track modes decide what is drawn. Returns whether any
 * caption track exists.
 */
function applyCaptions(video: HTMLVideoElement, on: boolean): boolean {
  const tracks = Array.from(video.textTracks).filter(isCaptionTrack);
  tracks.forEach((track, i) => {
    const mode: TextTrackMode = on && i === 0 ? "showing" : "hidden";
    if (track.mode !== mode) track.mode = mode;
  });
  return tracks.length > 0;
}
const WATCHDOG_INTERVAL_MS = 3_000;

interface HlsPlayerProps {
  url: string;
  muted: boolean;
  /** User paused playback (tap on the main player). */
  paused?: boolean;
  /** Show closed captions when the stream carries them. */
  captions?: boolean;
  /** Incremented to jump to the live edge ("Go live"). */
  liveSeq?: number;
  /** Whether the stream carries caption tracks (tracks can appear after playback starts). */
  onCaptionsAvailable?: (available: boolean) => void;
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
export function HlsPlayer({
  url,
  muted,
  paused = false,
  captions = false,
  liveSeq = 0,
  onCaptionsAvailable,
  onFatal,
  onPlaying,
  onAutoplayBlocked,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  // Latest callbacks/mute/pause/captions without restarting the pipeline when they change.
  const cb = useRef({ onFatal, onPlaying, onAutoplayBlocked, onCaptionsAvailable, muted, paused, captions });
  useEffect(() => {
    cb.current = { onFatal, onPlaying, onAutoplayBlocked, onCaptionsAvailable, muted, paused, captions };
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
      if (cb.current.paused) return;
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
      if (cb.current.paused) {
        lastProgressAt = Date.now();
        return;
      }
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

    // Caption tracks arrive asynchronously, and the browser or hls.js may change their modes:
    // re-apply the user's choice whenever the track list changes.
    let captionsReported: boolean | null = null;
    const syncCaptions = () => {
      const available = applyCaptions(video, cb.current.captions);
      if (available !== captionsReported) {
        captionsReported = available;
        cb.current.onCaptionsAvailable?.(available);
      }
    };
    video.textTracks.addEventListener("addtrack", syncCaptions);
    video.textTracks.addEventListener("removetrack", syncCaptions);
    video.textTracks.addEventListener("change", syncCaptions);

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
          hlsRef.current = instance;
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
      video.textTracks.removeEventListener("addtrack", syncCaptions);
      video.textTracks.removeEventListener("removetrack", syncCaptions);
      video.textTracks.removeEventListener("change", syncCaptions);
      hls?.destroy();
      hls = null;
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);

  // Apply mute changes to the live element (the `muted` attribute is only read on mount).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (!muted && video.paused && !cb.current.paused) video.play().catch(() => {});
  }, [muted]);

  // Pause/resume. A live stream paused past its DVR window resumes at the live edge.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) {
      video.pause();
      return;
    }
    const { seekable } = video;
    if (seekable.length > 0 && video.currentTime < seekable.start(0)) {
      video.currentTime = Math.max(seekable.start(0), seekable.end(seekable.length - 1) - 3);
    }
    if (video.paused && video.readyState > HTMLMediaElement.HAVE_NOTHING) video.play().catch(() => {});
  }, [paused]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) applyCaptions(video, captions);
  }, [captions]);

  // "Go live": jump to the live edge. The first run (mount) is skipped.
  const lastLiveSeq = useRef(liveSeq);
  useEffect(() => {
    if (liveSeq === lastLiveSeq.current) return;
    lastLiveSeq.current = liveSeq;
    const video = videoRef.current;
    if (!video) return;
    const { seekable } = video;
    const edge =
      hlsRef.current?.liveSyncPosition ??
      (seekable.length > 0 ? seekable.end(seekable.length - 1) - LIVE_EDGE_OFFSET_S : null);
    if (edge !== null && Number.isFinite(edge)) video.currentTime = edge;
    video.play().catch(() => {});
  }, [liveSeq]);

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
