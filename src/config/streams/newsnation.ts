// NewsNation (Nexstar) stream config.
//
// CAVEAT: the embed endpoint below is unofficial and undocumented — read off the public
// newsnationnow.com/live page (last verified 2026-11-25 from a US IP). It can change or
// disappear without notice. The stream is the property of Nexstar Media Group; check the
// provider's Terms of Service and your rights before deploying this publicly. See
// docs/streams.md for how to update this file (bump `version`!).
//
// Notes:
// - There is no usable direct HLS. The live feed is an Anvato/Lura asset
//   (id adstP5LOdMYydk9w, anvack p5orxQwkbvmJWIqK91CmJt7X1EZQ9q8z) and
//   tkx.mp.lura.live rejects the manifest without a signed `anvstk` token the player mints
//   per session, so we cannot build a stable URL for our own <video>.
// - www.newsnationnow.com is behind PerimeterX and serves a px-captcha 403 to anything that
//   is not a real browser, so a scraping resolver for it would not survive. The /nxs-video/…
//   embed path is *not* protected and sends no X-Frame-Options / frame-ancestors, so the
//   iframe works. It is the provider's own player: ads, no mute/play API, no PiP.
// - The YouTube channel is official and controllable, but only live part of the time, so it
//   uses requireLive: when NewsNation is not streaming there, the source is dropped and the
//   embed below takes over.

import type { ProviderConfig } from "@/lib/streams/config-types";

export const newsNationConfig: ProviderConfig = {
  id: "newsnation",
  name: "NewsNation",
  version: "2026.11.25-1",
  updatedAt: "2026-11-25",
  changelog: [
    {
      version: "2026.11.25-1",
      date: "2026-11-25",
      notes: "Initial config: NewsNation Live (YouTube when live, else the nxs-video Anvato embed).",
    },
  ],
  streams: [
    {
      id: "live",
      name: "NewsNation Live",
      group: "National",
      enabled: true,
      sources: [
        {
          type: "resolver",
          resolver: "youtube-live",
          params: { channelId: "UCCjG8NtOig0USdrT5D1FpxQ", requireLive: true },
        },
        {
          type: "iframe",
          url: "https://www.newsnationnow.com/nxs-video/vid-anvato-adstP5LOdMYydk9w/embed/?autoplay=1&aspect_ratio=landscape",
        },
      ],
      notes:
        "Anvato live id adstP5LOdMYydk9w (has_auth: false). Rediscover from the player config on " +
        "the live page: data-nexstar-video='{\"id\":\"…\",\"attributes\":{\"type\":\"live\"}}'.",
    },
  ],
};
