// nbc-fast-playlist: NBC News "embedded-video" page → __NEXT_DATA__ JSON → the
// "mmlsnbc_subs_non_drm_linear_streams" playlist → videos[] matched by MPX id →
// videoAssets[] (assetType "liveHls") publicUrl, e.g. https://nnaa-…fast.nbcuni.com/live/master.m3u8
//
// Observed structure (2026-11-07):
//   props.initialState.video.associatedPlaylists[] = {
//     id: "mmlsnbc_subs_non_drm_linear_streams",
//     videos: [{ id: "mmvo248671301631", mpxMetadata: { id: "248671301631" },
//                videoAssets: [{ assetType: "liveHls", format: "M3U", publicUrl: "https://…m3u8" }] }]
//   }
// We do not rely on that exact path: we search the JSON tree for the playlist by id.

import { cached, fetchText, findInJson, isRecord, looksLikeHlsUrl, toHttpsUrl, TTL } from "../http";
import { isNonEmptyString } from "../validate-primitives";
import type { ResolverDefinition } from "./types";

export const DEFAULT_NBC_PLAYLIST_ID = "mmlsnbc_subs_non_drm_linear_streams";
export const DEFAULT_NBC_PLAYLIST_PAGE = "https://www.nbcnews.com/news/embedded-video/mmvo248671301631";

const ALLOWED_PAGE_HOSTS = /^(www\.)?(nbcnews\.com|today\.com|msnbc\.com)$/i;

/** Extracts the JSON payload of <script id="__NEXT_DATA__">. */
export function extractNextData(html: string): unknown {
  const m = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as unknown;
  } catch {
    return null;
  }
}

/** Parses the page into a map of MPX id → HLS URL. */
export function parseNbcPlaylist(html: string, playlistId: string): Map<string, string> {
  const out = new Map<string, string>();
  const data = extractNextData(html);
  if (data === null) return out;
  const playlist = findInJson(data, (n) => n.id === playlistId && Array.isArray(n.videos));
  if (!playlist || !Array.isArray(playlist.videos)) return out;

  for (const video of playlist.videos) {
    if (!isRecord(video)) continue;
    const mpxMeta = isRecord(video.mpxMetadata) ? video.mpxMetadata : {};
    let mpxId = typeof mpxMeta.id === "string" ? mpxMeta.id : undefined;
    if (!mpxId && typeof video.id === "string") mpxId = video.id.replace(/^mmvo/, "");
    if (!mpxId) continue;

    const assets = Array.isArray(video.videoAssets) ? video.videoAssets.filter(isRecord) : [];
    // Prefer explicit live HLS assets, then anything whose URL is an .m3u8.
    const ranked = [
      ...assets.filter((a) => a.assetType === "liveHls"),
      ...assets.filter((a) => a.assetType !== "liveHls" && (a.format === "M3U" || typeof a.publicUrl === "string")),
    ];
    for (const a of ranked) {
      const url = toHttpsUrl(a.publicUrl);
      if (url && looksLikeHlsUrl(url)) {
        out.set(mpxId, url);
        break;
      }
    }
  }
  return out;
}

export const nbcFastPlaylist: ResolverDefinition<"nbc-fast-playlist"> = {
  name: "nbc-fast-playlist",
  validateParams(raw) {
    if (!isRecord(raw)) return ["params must be an object"];
    const errs: string[] = [];
    if (typeof raw.mpxId !== "string" || !/^\d{6,20}$/.test(raw.mpxId)) errs.push("params.mpxId must be a numeric string");
    if (raw.playlistId !== undefined && !isNonEmptyString(raw.playlistId, 200)) errs.push("params.playlistId must be a string");
    if (raw.pageUrl !== undefined) {
      const url = toHttpsUrl(raw.pageUrl);
      if (!url || !ALLOWED_PAGE_HOSTS.test(new URL(url).hostname)) errs.push("params.pageUrl must be an https nbcnews.com/today.com URL");
    }
    return errs;
  },
  async resolve({ mpxId, playlistId = DEFAULT_NBC_PLAYLIST_ID, pageUrl = DEFAULT_NBC_PLAYLIST_PAGE }) {
    // One fetch of the page serves every NBC national stream.
    const map = await cached(`nbc-fast-playlist:${pageUrl}#${playlistId}`, TTL.manifest, async () => {
      const parsed = parseNbcPlaylist(await fetchText(pageUrl), playlistId);
      if (parsed.size === 0) throw new Error(`playlist ${playlistId} not found or empty on ${pageUrl}`);
      return parsed;
    });
    const url = map.get(mpxId);
    return url ? { type: "hls", url } : null;
  },
};
