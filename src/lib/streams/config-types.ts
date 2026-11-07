// Types for the per-provider stream config files in src/config/streams/*.ts.
// The resolved output shape (what the UI consumes) lives in ./types.ts — this file only
// describes the *input* side: what a maintainer writes in a provider config.

import type { EmbedSource, ProviderId } from "./types";

/** Params accepted by each server-side resolver, keyed by resolver name. */
export interface ResolverParamsMap {
  /** youtube.com/channel/<channelId>/live → current live video id (or live_stream embed). */
  "youtube-live": { channelId: string };
  /** NBC News embedded-video page → linear-stream playlist → HLS publicUrl for an MPX id. */
  "nbc-fast-playlist": {
    mpxId: string;
    /** Defaults to "mmlsnbc_subs_non_drm_linear_streams". */
    playlistId?: string;
    /** Defaults to https://www.nbcnews.com/news/embedded-video/mmvo248671301631 */
    pageUrl?: string;
  };
  /** NBC/Telemundo owned-station WordPress REST API → meta.m3u8_url (Xumo FAST HLS). */
  "nbc-station-wp": { domain: string; postId: string };
  /** cbsnews.com live-channels XHR collection → items[slug].items[0].video|video2. */
  "cbs-live-channels": { slug: string; field: "video" | "video2" };
  /** abcnews.com/video/itemfeed?id=<id> → media-content entry of type application/x-mpegURL. */
  "abc-itemfeed": {
    id: string;
    /** When true (default), GET the chosen manifest and skip it if it does not look like HLS. */
    validate?: boolean;
  };
}

export type ResolverName = keyof ResolverParamsMap;

export const RESOLVER_NAMES: readonly ResolverName[] = [
  "youtube-live",
  "nbc-fast-playlist",
  "nbc-station-wp",
  "cbs-live-channels",
  "abc-itemfeed",
];

/**
 * A source that is looked up server-side at request time. If the resolver fails (network
 * error, timeout, page changed shape, …) the `fallback` is used instead; if there is no
 * fallback the source is dropped.
 */
export type ResolverSourceConfig = {
  [K in ResolverName]: {
    type: "resolver";
    resolver: K;
    params: ResolverParamsMap[K];
    fallback?: EmbedSource;
  };
}[ResolverName];

/** A source in a config: either a static EmbedSource or a resolver source. */
export type SourceConfig = EmbedSource | ResolverSourceConfig;

export interface StreamConfig {
  /** Slug, unique within the provider. Final id is `${providerId}:${id}`. */
  id: string;
  name: string;
  /** Tab grouping, e.g. "National", "Local", "More". */
  group: string;
  /** Disabled streams are kept in the config for reference but never emitted. */
  enabled: boolean;
  /** Ordered primary-first. */
  sources: SourceConfig[];
  /** Free-form maintainer notes (not emitted). */
  notes?: string;
}

export interface ChangelogEntry {
  version: string;
  /** ISO date, e.g. "2026-11-07". */
  date: string;
  notes: string;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  /** "YYYY.MM.DD-N". Bump on every change to this file. */
  version: string;
  /** ISO date of the last change. */
  updatedAt: string;
  /** Newest first. The first entry's version must equal `version`. */
  changelog: ChangelogEntry[];
  streams: StreamConfig[];
}
