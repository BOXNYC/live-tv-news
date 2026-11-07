// NBC / NBCUniversal stream config.
//
// CAVEAT: every endpoint below is unofficial and undocumented — scraped from public pages and
// player traffic. They can change or disappear without notice. Streams are the property of
// NBCUniversal and their partners; check the providers' Terms of Service and your rights before
// deploying this publicly. See docs/streams.md for how to update this file (bump `version`!).
//
// Notes:
// - nbcnews.com/watch itself is NOT frameable (CSP frame-ancestors), but the
//   /news/embedded-video/mmvo<id> player page is (no frame blocking observed; not controllable).
// - National FAST channels: HLS URLs come from the NBC News linear-stream playlist.
// - Local stations: 24/7 Xumo FAST channels published via each station's WordPress API.

import type { ProviderConfig, SourceConfig, StreamConfig } from "@/lib/streams/config-types";

const nbcEmbed = (mpxId: string, host = "https://www.nbcnews.com/news"): SourceConfig => ({
  type: "iframe",
  url: `${host}/embedded-video/mmvo${mpxId}?autoplay=true&muted=true`,
});

function national(
  id: string,
  name: string,
  mpxId: string,
  hls: string,
  extra: { embedHost?: string; youtubeChannelId?: string; notes?: string } = {},
): StreamConfig {
  const sources: SourceConfig[] = [
    { type: "resolver", resolver: "nbc-fast-playlist", params: { mpxId }, fallback: { type: "hls", url: hls } },
    nbcEmbed(mpxId, extra.embedHost),
  ];
  if (extra.youtubeChannelId) {
    sources.push({
      type: "resolver",
      resolver: "youtube-live",
      params: { channelId: extra.youtubeChannelId },
      fallback: { type: "youtube", channelId: extra.youtubeChannelId },
    });
  }
  return { id, name, group: "National", enabled: true, sources, notes: extra.notes };
}

/** Static Xumo FAST URL. The ads.xumo_channelId & ads.caid params are required (400 without). */
const xumoHls = (xumoId: string, caid: string) => ({
  type: "hls" as const,
  url: `https://d2kowtvrzzi7ps.cloudfront.net/11602/${xumoId}/hls/master.m3u8?ads.xumo_channelId=${xumoId}a&ads.caid=${caid}`,
});

function station(
  id: string,
  name: string,
  domain: string,
  postId: string,
  xumoId: string,
  caid: string,
  extraSources: SourceConfig[] = [],
): StreamConfig {
  return {
    id,
    name,
    group: "Local",
    enabled: true,
    sources: [
      { type: "resolver", resolver: "nbc-station-wp", params: { domain, postId }, fallback: xumoHls(xumoId, caid) },
      ...extraSources,
    ],
  };
}

export const nbcConfig: ProviderConfig = {
  id: "nbc",
  name: "NBC",
  version: "2026.11.07-1",
  updatedAt: "2026-11-07",
  changelog: [
    {
      version: "2026.11.07-1",
      date: "2026-11-07",
      notes:
        "Initial config: 7 national FAST channels via the NBC News linear-stream playlist, 15 NBC/Telemundo " +
        "owned-station Xumo channels via station WordPress API; MS NOW and CNBC disabled.",
    },
  ],
  streams: [
    // ---------------------------------------------------------------- National
    national("news-now", "NBC News NOW", "248671301631", "https://nnaa-nbcnn-lzaj01.fast.nbcuni.com/live/master.m3u8", {
      youtubeChannelId: "UCeY0bbntWzzVIaj2z3QigXg",
    }),
    national("today-all-day", "TODAY All Day", "248670277645", "https://nnaa-ch1020-zln13.fast.nbcuni.com/live/master.m3u8", {
      embedHost: "https://www.today.com/today",
    }),
    national("dateline", "Dateline 24/7", "248670277649", "https://nnaa-ch1012-1mcn7.fast.nbcuni.com/live/master.m3u8"),
    national("sky-news", "Sky News", "248671301664", "https://nnaa-skynews-61cza.fast.nbcuni.com/live/master.m3u8", {
      youtubeChannelId: "UCoMdktPbSTixAyNGwb-UYkQ",
    }),
    national("sports-now", "NBC Sports NOW", "248672325694", "https://nnaa-ch1022-27fcx.fast.nbcuni.com/live/master.m3u8", {
      notes: "Static fallback URL unverified (seen in playlist only).",
    }),
    national(
      "noticias-telemundo-ahora",
      "Noticias Telemundo AHORA",
      "248672325771",
      "https://nnaa-ch827-dh1ac.fast.nbcuni.com/live/master.m3u8",
      { notes: "Static fallback URL unverified (seen in playlist only)." },
    ),
    national(
      "telemundo-deportes-ahora",
      "Telemundo Deportes AHORA",
      "248672837934",
      "https://tda-nnaa-drct-pa6dy.fast.nbcuni.com/live/master.m3u8",
      { notes: "Static fallback URL unverified (seen in playlist only)." },
    ),
    // Disabled: the MS NOW network feed requires a TV-provider login; its YouTube channel is
    // only occasionally live. Enable if you are fine with it often showing an offline embed.
    {
      id: "ms-now",
      name: "MS NOW",
      group: "National",
      enabled: false,
      sources: [
        {
          type: "resolver",
          resolver: "youtube-live",
          params: { channelId: "UCaXkIU1QidjPwiAYu6GcHjg" },
          fallback: { type: "youtube", channelId: "UCaXkIU1QidjPwiAYu6GcHjg" },
        },
      ],
    },
    // Disabled: CNBC's network feed requires a TV-provider login; YouTube is often not live.
    {
      id: "cnbc",
      name: "CNBC",
      group: "National",
      enabled: false,
      sources: [
        {
          type: "resolver",
          resolver: "youtube-live",
          params: { channelId: "UCrp_UI8XtuYfpiqluWLD7Lw" },
          fallback: { type: "youtube", channelId: "UCrp_UI8XtuYfpiqluWLD7Lw" },
        },
      ],
    },

    // ---------------------------------------------------------------- Local (owned stations)
    station("new-york", "NBC New York", "nbcnewyork.com", "5351877", "88889709", "NBCNNY", [
      {
        type: "iframe",
        url: "https://www.nbcnewyork.com/video-layout/amp_video/?CID=1:2:5351877&videoID=&origin=nbcnewyork.com&fullWidth=y&autoplay=true&lp=5&callletters=wnbc&embedded=true",
      },
    ]),
    station("los-angeles", "NBC4 Los Angeles", "nbclosangeles.com", "3396742", "88889710", "NBCNLA"),
    station("chicago", "NBC Chicago", "nbcchicago.com", "3010684", "88889704", "NBCNCHI"),
    station("dfw", "NBC DFW", "nbcdfw.com", "3523824", "88889706", "NBCNDAL"),
    station("philadelphia", "NBC10 Philadelphia", "nbcphiladelphia.com", "3841075", "88889705", "NBCNPHI"),
    station("washington", "NBC Washington", "nbcwashington.com", "3600727", "88889708", "NBCNWAS"),
    station("boston", "NBC Boston", "nbcboston.com", "3349031", "88889713", "NBCNBOS"),
    station("bay-area", "NBC Bay Area", "nbcbayarea.com", "3519840", "88889711", "NBCNBA"),
    station("south-florida", "NBC 6 South Florida", "nbcmiami.com", "3294236", "88889702", "NBCSouthFloridaNews"),
    station("san-diego", "NBC 7 San Diego", "nbcsandiego.com", "3497501", "88889712", "NBCNSD"),
    station("connecticut", "NBC Connecticut", "nbcconnecticut.com", "3274515", "88889707", "NBCNCT"),
    station("telemundo-noreste", "Telemundo Noreste", "telemundo47.com", "2469836", "88889716", "TelemundoNoticiasNoreste"),
    station("telemundo-florida", "Telemundo Florida", "telemundo51.com", "2525424", "88889703", "TelemundoNoticiasFL"),
    station("telemundo-california", "Telemundo California", "telemundo52.com", "2641429", "88889714", "TelemundoNoticiasCA"),
    station("telemundo-texas", "Telemundo Texas", "telemundodallas.com", "2422881", "88889715", "TelemundoNoticiasTX"),
  ],
};
