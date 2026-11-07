// ABC News stream config.
//
// CAVEAT: the itemfeed and embed endpoints below are unofficial and undocumented — scraped from
// public pages and player traffic. They can change or disappear without notice. Streams are the
// property of ABC News / Disney; check the providers' Terms of Service and your rights before
// deploying this publicly. See docs/streams.md for how to update this file (bump `version`!).
//
// Notes:
// - abcnews-streams.akamaized.net HLS is unsigned and sends Access-Control-Allow-Origin: *, so it
//   is the best source (full control for PiP/mute). YouTube is official and controllable.
// - abcnews.com/video/embed has no X-Frame-Options/CSP but shows ads/consent; not controllable.
// - Special-event slots (abc_live<N>) rotate; a dynamic resolver for them is out of scope.

import type { ProviderConfig } from "@/lib/streams/config-types";

export const abcConfig: ProviderConfig = {
  id: "abc",
  name: "ABC",
  version: "2026.11.07-1",
  updatedAt: "2026-11-07",
  changelog: [
    {
      version: "2026.11.07-1",
      date: "2026-11-07",
      notes: "Initial config: ABC News Live (itemfeed HLS, YouTube, embed); special coverage and ABC7 NY disabled.",
    },
  ],
  streams: [
    {
      id: "abc-news-live",
      name: "ABC News Live",
      group: "National",
      enabled: true,
      sources: [
        {
          type: "resolver",
          resolver: "abc-itemfeed",
          params: { id: "41463246" },
          fallback: {
            type: "hls",
            url: "https://abcnews-streams.akamaized.net/hls/live/2023570/abcnewslive_applenews/master.m3u8",
          },
        },
        {
          type: "resolver",
          resolver: "youtube-live",
          params: { channelId: "UCBi2mrWuNuyYy4gbM6fU18Q" },
          fallback: { type: "youtube", channelId: "UCBi2mrWuNuyYy4gbM6fU18Q" },
        },
        { type: "iframe", url: "https://abcnews.com/video/embed?id=41463246" },
      ],
    },
    // Disabled: abc_live<N> special-event slots rotate and are usually idle. Enable (and pick
    // the right slot number) during major breaking-news coverage.
    {
      id: "special-coverage",
      name: "ABC News Special Coverage",
      group: "National",
      enabled: false,
      sources: [
        { type: "resolver", resolver: "abc-itemfeed", params: { id: "abc_live10" } },
        { type: "iframe", url: "https://abcnews.com/video/embed?id=abc_live10" },
      ],
    },
    // Disabled: unverified playback (station embed may be geo/ads gated).
    {
      id: "abc7-new-york",
      name: "ABC7 New York",
      group: "Local",
      enabled: false,
      sources: [{ type: "iframe", url: "https://abc7ny.com/video/embed?pid=11064922" }],
    },
  ],
};
