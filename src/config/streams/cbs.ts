// CBS News stream config.
//
// CAVEAT: the live-channels XHR collection and the HLS URLs below are unofficial and
// undocumented — scraped from public pages and player traffic. They can change or disappear
// without notice. Streams are the property of CBS News / Paramount; check the providers' Terms
// of Service and your rights before deploying this publicly. See docs/streams.md for how to
// update this file (bump `version`!).
//
// Notes:
// - CBS has no player-only embed; framing cbsnews.com/live shows the whole site, so there is
//   no iframe source here.
// - `video`  = Google DAI (server-side ads) — redirects to a per-session URL; fine for hls.js.
// - `video2` = origin HLS without ads. Only used as a static fallback where verified good;
//   the "More" channels' origins return 4xx/5xx, so they are DAI-only.

import type { ProviderConfig, SourceConfig, StreamConfig } from "@/lib/streams/config-types";

const dai = (daiId: string) => ({
  type: "hls" as const,
  url: `https://dai.google.com/linear/hls/event/${daiId}/master.m3u8`,
});

function channel(
  id: string,
  name: string,
  group: string,
  daiId: string,
  origin?: string,
  extra: SourceConfig[] = [],
): StreamConfig {
  const sources: SourceConfig[] = [
    { type: "resolver", resolver: "cbs-live-channels", params: { slug: id, field: "video" }, fallback: dai(daiId) },
  ];
  if (origin) {
    sources.push({
      type: "resolver",
      resolver: "cbs-live-channels",
      params: { slug: id, field: "video2" },
      fallback: { type: "hls", url: origin },
    });
  }
  return { id, name, group, enabled: true, sources: [...sources, ...extra] };
}

export const cbsConfig: ProviderConfig = {
  id: "cbs",
  name: "CBS",
  version: "2026.11.07-1",
  updatedAt: "2026-11-07",
  changelog: [
    {
      version: "2026.11.07-1",
      date: "2026-11-07",
      notes: "Initial config: CBS News 24/7, 14 local CBS News stations, 5 more national channels (DAI only).",
    },
  ],
  streams: [
    // ---------------------------------------------------------------- National
    channel("cbsnews", "CBS News 24/7", "National", "Sid4xiTQTkCT1SLu6rjUSQ", "https://news20e7hhcb.airspace-cdn.cbsivideo.com/index.m3u8", [
      {
        // Usually offline; last resort.
        type: "resolver",
        resolver: "youtube-live",
        params: { channelId: "UC8p1vwvWtl6T73JiExfWs1g" },
        fallback: { type: "youtube", channelId: "UC8p1vwvWtl6T73JiExfWs1g" },
      },
    ]),

    // ---------------------------------------------------------------- Local
    channel("newyork", "CBS News New York", "Local", "jeTDC610T-OSPdiWhcl0Pg", "https://newyo9h67ea3.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("baltimore", "CBS News Baltimore", "Local", "TMUt418sQMeu1QtneYJ9ag", "https://lineup.cbsivideo.com/playout/8877a7d5-b094-4ac8-bc72-75a5fed68e5b/index.m3u8"),
    channel("sanfrancisco", "CBS News Bay Area", "Local", "laLJwH1nS2KQAUQTF8z1Cg", "https://baya0f96heg.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("boston", "CBS News Boston", "Local", "dHA193vxQ_WqZNVoC-W5MA", "https://bostoahhb12d.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("chicago", "CBS News Chicago", "Local", "_xQBtL7ZSEClkNebaXzn8w", "https://chicad94bd07.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("colorado", "CBS News Colorado", "Local", "E9CkyheTSKeGiOiICU_JBQ", "https://colorf2fd001.airspace-cdn.cbsivideo.com/index.m3u8"),
    channel("detroit", "CBS News Detroit", "Local", "xnyAMOsfSV2J1b-A3nROFQ", "https://detro3a34841.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("losangeles", "CBS News Los Angeles", "Local", "K_2aA7OVRTacJJli1oSi8w", "https://losandd87138.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("miami", "CBS News Miami", "Local", "_yODrBHESGSzPe3dqW4gGg", "https://lineup.cbsivideo.com/playout/8796731e-7ce7-4bcf-bb04-41ef5a969c62/master.m3u8"),
    channel("minnesota", "CBS News Minnesota", "Local", "c0XucO32RNKG8oeQ351a4Q", "https://minne3h5cdh7.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("philadelphia", "CBS News Philadelphia", "Local", "R2Kw0uvnQIW7fUmOseurzA", "https://phila5bcfb03.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("pittsburgh", "CBS News Pittsburgh", "Local", "mir-uZYjTu6-8JLMHBTKhQ", "https://pittsda654d7.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),
    channel("sacramento", "CBS News Sacramento", "Local", "e7mp4YVGS7O_e7rqRNjKow", "https://lineup.cbsivideo.com/playout/c1ed69db-6b71-4581-a937-a70ab4089f8a/index.m3u8"),
    channel("texas", "CBS News Texas", "Local", "ogzLhRCkRbG3lFHHJwqaNw", "https://texas50816cg.airspace-cdn.cbsivideo.com/live/manifest.m3u8"),

    // ---------------------------------------------------------------- More (DAI only; origins 4xx/5xx)
    channel("cbs-sports-hq", "CBS Sports HQ", "More", "9Lq0ERvoSR-z9AwvFS-xYA"),
    channel("inside-edition", "Inside Edition 24/7", "More", "Y2DMgfclT3S2nNxANeIawA"),
    channel("mixible", "ET Live", "More", "xrVrJYTmTfitfXBQfeZByQ"),
    channel("48-hours", "48 Hours", "More", "JUr94WL2QAiVpGNHY5n5dA"),
    channel("60-minutes", "60 Minutes", "More", "nrb-l85CR7SIr-rGXqz4zA"),
  ],
};
