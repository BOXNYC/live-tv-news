// nbc-station-wp: NBC / Telemundo owned-station sites are WordPress. Each station's 24/7 FAST
// stream is a "video" post whose REST representation carries the Xumo HLS URL:
//   GET https://www.<domain>/wp-json/wp/v2/videos/<postId>  →  { meta: { m3u8_url: "https://…/master.m3u8?ads.…" } }
//
// The URL contains Xumo/FreeWheel ad macros (APP_NAME, IFA, …) left unexpanded; the CDN accepts
// it as-is (verified 2026-11-07). The bare URL without ads.xumo_channelId/ads.caid returns 400,
// so we return the URL exactly as published.

import { cached, fetchJson, isRecord, looksLikeHlsUrl, toHttpsUrl, TTL } from "../http";
import type { ResolverDefinition } from "./types";

/** Station domains we are willing to call (owned NBC/Telemundo station sites). */
const DOMAIN_RE = /^(?:www\.)?((?:nbc|telemundo)[a-z0-9-]*\.com)$/i;

export function parseStationVideoPost(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const meta = isRecord(json.meta) ? json.meta : {};
  for (const candidate of [meta.m3u8_url, json.m3u8_url]) {
    const url = toHttpsUrl(candidate);
    if (url && looksLikeHlsUrl(url)) return url;
  }
  return null;
}

export const nbcStationWp: ResolverDefinition<"nbc-station-wp"> = {
  name: "nbc-station-wp",
  validateParams(raw) {
    if (!isRecord(raw)) return ["params must be an object"];
    const errs: string[] = [];
    if (typeof raw.domain !== "string" || !DOMAIN_RE.test(raw.domain))
      errs.push("params.domain must be an NBC/Telemundo station domain like nbcnewyork.com");
    if (typeof raw.postId !== "string" || !/^\d{1,12}$/.test(raw.postId)) errs.push("params.postId must be a numeric string");
    return errs;
  },
  async resolve({ domain, postId }) {
    const host = DOMAIN_RE.exec(domain)?.[1]?.toLowerCase();
    if (!host) return null;
    const apiUrl = `https://www.${host}/wp-json/wp/v2/videos/${postId}`;
    const url = await cached(`nbc-station-wp:${apiUrl}`, TTL.manifest, async () =>
      parseStationVideoPost(await fetchJson(apiUrl)),
    );
    return url ? { type: "hls", url } : null;
  },
};
