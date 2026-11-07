// Resolver registry. To add a resolver: create a file exporting a ResolverDefinition, add its
// params type to ResolverParamsMap (../config-types.ts), and register it here.

import type { ResolverName } from "../config-types";
import { abcItemFeed } from "./abc-itemfeed";
import { cbsLiveChannels } from "./cbs-live-channels";
import { nbcFastPlaylist } from "./nbc-fast-playlist";
import { nbcStationWp } from "./nbc-station-wp";
import type { ResolverDefinition } from "./types";
import { youtubeLive } from "./youtube-live";

export const resolvers: { [K in ResolverName]: ResolverDefinition<K> } = {
  "youtube-live": youtubeLive,
  "nbc-fast-playlist": nbcFastPlaylist,
  "nbc-station-wp": nbcStationWp,
  "cbs-live-channels": cbsLiveChannels,
  "abc-itemfeed": abcItemFeed,
};

export function isResolverName(v: unknown): v is ResolverName {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(resolvers, v);
}

export type { ResolverDefinition } from "./types";
