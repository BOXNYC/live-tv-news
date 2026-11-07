// Shared contract between the stream config/resolver layer (src/lib/streams, src/config/streams,
// src/app/api/streams) and the player UI (src/components, src/app/page.tsx).

export type ProviderId = "nbc" | "abc" | "cbs";

/** A single, fully resolved way to play a stream. */
export type EmbedSource =
  /** Direct HLS manifest played in our own <video> (hls.js, or native on Safari). Fully controllable. */
  | { type: "hls"; url: string }
  /** YouTube embed. `videoId` is used when known, otherwise the channel's live_stream embed. */
  | { type: "youtube"; channelId: string; videoId?: string }
  /** Provider's own embed page in an iframe. Not controllable (no mute/play API). */
  | { type: "iframe"; url: string };

export type EmbedType = EmbedSource["type"];

export interface ResolvedStream {
  /** Globally unique, stable id, e.g. "nbc:news-now", "cbs:newyork". */
  id: string;
  providerId: ProviderId;
  name: string;
  /** Grouping for the tab UI, e.g. "National", "Local". */
  group: string;
  /** Ordered playback candidates, primary first. The player falls back down the list on error. */
  sources: EmbedSource[];
}

export interface ProviderCatalog {
  id: ProviderId;
  name: string;
  /** Version of the provider config that produced these streams, e.g. "2026.11.07-1". */
  configVersion: string;
  streams: ResolvedStream[];
}

/** Response body of GET /api/streams. */
export interface StreamCatalog {
  generatedAt: string;
  providers: ProviderCatalog[];
}
