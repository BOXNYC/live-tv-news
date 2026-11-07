// cbs-live-channels: the XHR collection that powers cbsnews.com/live channel switcher.
//   GET https://www.cbsnews.com/video/xhr/collection/component/live-channels/
//   → { items: [ { slug: "newyork", title, items: [ { slug, video: "<Google DAI HLS>", video2: "<origin HLS>", … } ] } ] }
//
// `video`  = https://dai.google.com/linear/hls/event/<id>/master.m3u8 (server-side ad insertion;
//            redirects to a per-session URL, which hls.js handles).
// `video2` = origin HLS (airspace-cdn / lineup.cbsivideo.com). Some origins 4xx/5xx.

import { cached, fetchJson, isRecord, looksLikeHlsUrl, toHttpsUrl, TTL } from "../http";
import { isSlug } from "../validate-primitives";
import type { ResolverDefinition } from "./types";

export const CBS_LIVE_CHANNELS_URL = "https://www.cbsnews.com/video/xhr/collection/component/live-channels/";

export interface CbsChannelUrls {
  video?: string;
  video2?: string;
}

export function parseCbsLiveChannels(json: unknown): Map<string, CbsChannelUrls> {
  const out = new Map<string, CbsChannelUrls>();
  if (!isRecord(json) || !Array.isArray(json.items)) return out;
  for (const channel of json.items) {
    if (!isRecord(channel)) continue;
    const inner = Array.isArray(channel.items) ? channel.items.find(isRecord) : undefined;
    const slug =
      typeof channel.slug === "string" ? channel.slug : inner && typeof inner.slug === "string" ? inner.slug : undefined;
    if (!slug || !inner) continue;
    const urls: CbsChannelUrls = {};
    for (const field of ["video", "video2"] as const) {
      const url = toHttpsUrl(inner[field]);
      if (url && looksLikeHlsUrl(url)) urls[field] = url;
    }
    if (urls.video || urls.video2) out.set(slug, urls);
  }
  return out;
}

export const cbsLiveChannels: ResolverDefinition<"cbs-live-channels"> = {
  name: "cbs-live-channels",
  validateParams(raw) {
    if (!isRecord(raw)) return ["params must be an object"];
    const errs: string[] = [];
    if (!isSlug(raw.slug)) errs.push("params.slug must be a slug");
    if (raw.field !== "video" && raw.field !== "video2") errs.push('params.field must be "video" or "video2"');
    return errs;
  },
  async resolve({ slug, field }) {
    // One fetch serves every CBS stream.
    const map = await cached(`cbs-live-channels`, TTL.manifest, async () => {
      const parsed = parseCbsLiveChannels(await fetchJson(CBS_LIVE_CHANNELS_URL));
      if (parsed.size === 0) throw new Error("live-channels collection empty or changed shape");
      return parsed;
    });
    const url = map.get(slug)?.[field];
    return url ? { type: "hls", url } : null;
  },
};
