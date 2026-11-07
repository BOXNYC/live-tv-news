// abc-itemfeed: abcnews.com/video/itemfeed?id=<id> returns an MRSS-as-JSON document:
//   { channel: { item: { "media-group": { "media-content": [
//       { "@attributes": { url: "https://…/manifest.f4m", type: "video/f4m" } },          ← dead HDS
//       { "@attributes": { url: "https://…/master.m3u8",  type: "application/x-mpegURL" } } ] } } } }
//
// `item` and `media-content` may be an object or an array. Some listed HLS URLs are dead
// (e.g. abclive2-lh.akamaihd.net "Invalid URL"), so by default each candidate is validated with a
// cheap GET and the first one that returns an #EXTM3U playlist wins.

import { cached, fetchJson, fetchText, isRecord, looksLikeHlsUrl, toHttpsUrl, TTL } from "../http";
import type { ResolverDefinition } from "./types";

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

/** All HLS candidates in feed order. */
export function parseAbcItemFeed(json: unknown): string[] {
  const urls: string[] = [];
  if (!isRecord(json) || !isRecord(json.channel)) return urls;
  for (const item of toArray(json.channel.item)) {
    if (!isRecord(item) || !isRecord(item["media-group"])) continue;
    for (const content of toArray(item["media-group"]["media-content"])) {
      if (!isRecord(content) || !isRecord(content["@attributes"])) continue;
      const attrs = content["@attributes"];
      const type = typeof attrs.type === "string" ? attrs.type.toLowerCase() : "";
      const url = toHttpsUrl(attrs.url);
      if (!url) continue;
      if (type === "application/x-mpegurl" || type === "application/vnd.apple.mpegurl" || looksLikeHlsUrl(url)) {
        if (!urls.includes(url)) urls.push(url);
      }
    }
  }
  return urls;
}

async function isLivePlaylist(url: string): Promise<boolean> {
  return cached(`hls-ok:${url}`, TTL.manifest, async () => {
    try {
      const body = await fetchText(url, { accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.5" });
      return body.trimStart().startsWith("#EXTM3U");
    } catch {
      return false;
    }
  });
}

export const abcItemFeed: ResolverDefinition<"abc-itemfeed"> = {
  name: "abc-itemfeed",
  validateParams(raw) {
    if (!isRecord(raw)) return ["params must be an object"];
    const errs: string[] = [];
    if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) errs.push("params.id must be an itemfeed id like 41463246 or abc_live10");
    if (raw.validate !== undefined && typeof raw.validate !== "boolean") errs.push("params.validate must be boolean");
    return errs;
  },
  async resolve({ id, validate = true }) {
    const feedUrl = `https://abcnews.com/video/itemfeed?id=${encodeURIComponent(id)}`;
    const candidates = await cached(`abc-itemfeed:${id}`, TTL.manifest, async () => parseAbcItemFeed(await fetchJson(feedUrl)));
    for (const url of candidates) {
      if (!validate || (await isLivePlaylist(url))) return { type: "hls", url };
    }
    return null;
  },
};
