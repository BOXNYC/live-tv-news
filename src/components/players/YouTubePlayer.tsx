"use client";

import { useCallback, useEffect, useRef } from "react";

interface YouTubePlayerProps {
  channelId: string;
  videoId?: string;
  muted: boolean;
  /** User paused playback (tap on the main player). */
  paused?: boolean;
  /** Show closed captions (toggles the player's captions module). */
  captions?: boolean;
  /** Incremented to jump to the live edge ("Go live"). */
  liveSeq?: number;
  title: string;
  onFatal: (reason: string) => void;
  onPlaying?: () => void;
  /** PiP tiles are not interactive: taps go to the tile's overlay button. */
  interactive: boolean;
}

const NOCOOKIE_ORIGIN = "https://www.youtube-nocookie.com";
const YOUTUBE_ORIGIN = "https://www.youtube.com";

export function youTubeEmbedUrl(channelId: string, videoId?: string): { src: string; origin: string } {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    enablejsapi: "1",
    controls: "0",
    rel: "0",
    modestbranding: "1",
  });
  if (typeof window !== "undefined") params.set("origin", window.location.origin);
  if (videoId) {
    return {
      src: `${NOCOOKIE_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params}`,
      origin: NOCOOKIE_ORIGIN,
    };
  }
  // youtube-nocookie doesn't reliably support the channel live_stream form; use www.youtube.com.
  params.set("channel", channelId);
  return { src: `${YOUTUBE_ORIGIN}/embed/live_stream?${params}`, origin: YOUTUBE_ORIGIN };
}

/**
 * YouTube iframe embed controlled through the IFrame API's postMessage protocol
 * (no script tag needed): we send mute/unMute commands and listen for onError.
 */
export function YouTubePlayer({
  channelId,
  videoId,
  muted,
  paused = false,
  captions = false,
  liveSeq = 0,
  title,
  onFatal,
  onPlaying,
  interactive,
}: YouTubePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { src, origin } = youTubeEmbedUrl(channelId, videoId);
  const cb = useRef({ onFatal, onPlaying, muted, paused, captions });
  useEffect(() => {
    cb.current = { onFatal, onPlaying, muted, paused, captions };
  });
  // Latest DVR length reported by the player; seeking to it lands on the live edge.
  const durationRef = useRef<number | null>(null);

  const post = useCallback(
    (message: object) => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), origin);
    },
    [origin],
  );

  const applyMute = useCallback(
    (isMuted: boolean) => {
      post({ event: "command", func: isMuted ? "mute" : "unMute", args: [] });
      if (!isMuted && !cb.current.paused) post({ event: "command", func: "playVideo", args: [] });
    },
    [post],
  );

  // loadModule/unloadModule("captions") is the IFrame API's (unofficial but long-standing) way to
  // show or hide captions without reloading the embed.
  const applyCaptions = useCallback(
    (on: boolean) => post({ event: "command", func: on ? "loadModule" : "unloadModule", args: ["captions"] }),
    [post],
  );

  // Listen for player events (errors, state changes) from this iframe only.
  useEffect(() => {
    let failed = false;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== iframeRef.current?.contentWindow) return;
      if (typeof e.data !== "string") return;
      let data: { event?: string; info?: unknown };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event === "onError" && !failed) {
        failed = true;
        cb.current.onFatal(`YouTube error ${String(data.info)}`);
      } else if (data.event === "onStateChange" && data.info === 1) {
        cb.current.onPlaying?.();
      } else if (data.event === "infoDelivery" || data.event === "initialDelivery") {
        const info = data.info as { playerState?: number; duration?: number } | undefined;
        if (info?.playerState === 1) cb.current.onPlaying?.();
        if (typeof info?.duration === "number" && info.duration > 0) durationRef.current = info.duration;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  // The player may not be ready right at onLoad, so (re)send the handshake + mute state a few times.
  const handleLoad = useCallback(() => {
    // Timers are short-lived and harmless after unmount (post() no-ops once the ref is null).
    for (const delay of [0, 800, 2500, 5000]) {
      window.setTimeout(() => {
        post({ event: "listening", id: title, channel: "widget" });
        applyMute(cb.current.muted);
        applyCaptions(cb.current.captions);
        if (cb.current.paused) post({ event: "command", func: "pauseVideo", args: [] });
      }, delay);
    }
  }, [post, applyMute, applyCaptions, title]);

  useEffect(() => {
    applyMute(muted);
  }, [muted, applyMute]);

  useEffect(() => {
    post({ event: "command", func: paused ? "pauseVideo" : "playVideo", args: [] });
  }, [paused, post]);

  useEffect(() => {
    applyCaptions(captions);
  }, [captions, applyCaptions]);

  // "Go live": seek to the end of the DVR window. The first run (mount) is skipped.
  const lastLiveSeq = useRef(liveSeq);
  useEffect(() => {
    if (liveSeq === lastLiveSeq.current) return;
    lastLiveSeq.current = liveSeq;
    if (durationRef.current !== null) {
      post({ event: "command", func: "seekTo", args: [durationRef.current, true] });
    }
    post({ event: "command", func: "playVideo", args: [] });
  }, [liveSeq, post]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      className={`h-full w-full border-0 bg-black ${interactive ? "" : "pointer-events-none"}`}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={interactive ? undefined : -1}
      onLoad={handleLoad}
    />
  );
}
