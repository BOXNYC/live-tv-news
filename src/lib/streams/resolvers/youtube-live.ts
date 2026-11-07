// youtube-live: https://www.youtube.com/channel/<channelId>/live
//
// When a channel is live, YouTube serves the watch page for the live video and its
// <link rel="canonical"> points at https://www.youtube.com/watch?v=<id>. When it is not live,
// the canonical points back at the channel. We return the video id when we find one that is
// live now, else the channel-only source (the UI then uses the live_stream?channel= embed).

import { cached, fetchText, isRecord, TTL } from "../http";
import { isYouTubeChannelId } from "../validate-primitives";
import type { ResolverDefinition } from "./types";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeLivePage(html: string): string | null {
  // Attribute order varies; scan every <link> tag for rel=canonical.
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  let videoId: string | null = null;
  for (const tag of linkTags) {
    if (!/\brel\s*=\s*["']?canonical["']?/i.test(tag)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      const u = new URL(href.replace(/&amp;/g, "&"), "https://www.youtube.com");
      if (!/(^|\.)youtube\.com$/i.test(u.hostname) || u.pathname !== "/watch") continue;
      const v = u.searchParams.get("v");
      if (v && VIDEO_ID_RE.test(v)) {
        videoId = v;
        break;
      }
    } catch {
      // ignore malformed href
    }
  }
  if (!videoId) return null;

  // /live sometimes redirects to an upcoming or just-ended stream. If the page explicitly says
  // it is not live now (and never says it is), prefer the channel-level live_stream embed.
  const saysLive = /"isLiveNow"\s*:\s*true/.test(html);
  const saysNotLive = /"isLiveNow"\s*:\s*false/.test(html);
  if (saysNotLive && !saysLive) return null;
  return videoId;
}

export const youtubeLive: ResolverDefinition<"youtube-live"> = {
  name: "youtube-live",
  validateParams(raw) {
    if (!isRecord(raw)) return ["params must be an object"];
    return isYouTubeChannelId(raw.channelId) ? [] : ["params.channelId must be a YouTube channel id (UC…)"];
  },
  async resolve({ channelId }) {
    const videoId = await cached(`youtube-live:${channelId}`, TTL.youtube, async () => {
      const html = await fetchText(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`, {
        // Skip the EU consent interstitial if the server happens to be geolocated there.
        headers: { Cookie: "CONSENT=YES+cb; SOCS=CAI" },
      });
      // Cache "not live" as a successful lookup (empty string) so it gets the normal TTL.
      return parseYouTubeLivePage(html) ?? "";
    });
    return videoId ? { type: "youtube", channelId, videoId } : { type: "youtube", channelId };
  },
};
