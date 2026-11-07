// Hand-written runtime type guards shared by the config validator and the resolvers.

import { isRecord, toHttpsUrl } from "./http";
import type { EmbedSource } from "./types";

export function isNonEmptyString(v: unknown, maxLen = 500): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

/** Lowercase slug: letters, digits, dashes. */
export function isSlug(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 64;
}

export function isYouTubeChannelId(v: unknown): v is string {
  return typeof v === "string" && /^UC[A-Za-z0-9_-]{22}$/.test(v);
}

export function isYouTubeVideoId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{11}$/.test(v);
}

/** Returns problems with a would-be EmbedSource (empty array = valid). */
export function embedSourceErrors(v: unknown): string[] {
  if (!isRecord(v)) return ["source must be an object"];
  switch (v.type) {
    case "hls":
    case "iframe":
      return toHttpsUrl(v.url) ? [] : [`${v.type} source needs an https url (got ${JSON.stringify(v.url)})`];
    case "youtube": {
      const errs: string[] = [];
      if (!isYouTubeChannelId(v.channelId)) errs.push("youtube source needs a channelId (UC…)");
      if (v.videoId !== undefined && !isYouTubeVideoId(v.videoId)) errs.push("youtube videoId must be 11 chars");
      return errs;
    }
    default:
      return [`unknown source type ${JSON.stringify(v.type)}`];
  }
}

export function isEmbedSource(v: unknown): v is EmbedSource {
  return embedSourceErrors(v).length === 0;
}
