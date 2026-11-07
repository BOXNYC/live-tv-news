# Stream configs — maintainer guide

The player UI gets its channel list from `GET /api/streams`, which returns a `StreamCatalog`
(see `src/lib/streams/types.ts`, the frozen UI contract). That catalog is built from one
config file per provider plus a set of server-side **resolvers** that discover current stream
URLs at request time.

> **Caveat.** Every provider endpoint used here is unofficial and undocumented — found by
> inspecting public pages and player traffic (last verified 2026-11-07 from a US IP). They can
> change or disappear without notice, and the streams belong to the networks. Check each
> provider's Terms of Service and your rights before deploying publicly.

## Layout

| Path | What it is |
| --- | --- |
| `src/config/streams/{nbc,abc,cbs}.ts` | One `ProviderConfig` per provider — **this is what you edit** |
| `src/config/streams/index.ts` | Provider list, in tab order |
| `src/lib/streams/config-types.ts` | Types for configs (`ProviderConfig`, `StreamConfig`, `SourceConfig`, resolver params) |
| `src/lib/streams/validate.ts` | Runtime validator (hand-written type guards) |
| `src/lib/streams/resolvers/*.ts` | One file per resolver + `index.ts` registry |
| `src/lib/streams/http.ts` | fetch with 4 s timeout + browser User-Agent, in-memory TTL cache, parsing helpers |
| `src/lib/streams/catalog.ts` | `getStreamCatalog()` / `getStaticCatalog()` |
| `src/app/api/streams/route.ts` | `GET /api/streams` |

## How a config works

```ts
export const cbsConfig: ProviderConfig = {
  id: "cbs",                 // ProviderId from types.ts
  name: "CBS",
  version: "2026.11.07-1",   // emitted as configVersion
  updatedAt: "2026-11-07",
  changelog: [{ version: "2026.11.07-1", date: "2026-11-07", notes: "…" }], // newest first
  streams: [
    {
      id: "newyork",          // slug → final id "cbs:newyork"
      name: "CBS News New York",
      group: "Local",         // tab group
      enabled: true,
      sources: [              // primary first; the player falls back down the list
        { type: "resolver", resolver: "cbs-live-channels",
          params: { slug: "newyork", field: "video" },
          fallback: { type: "hls", url: "https://dai.google.com/linear/hls/event/…/master.m3u8" } },
        { type: "hls", url: "https://…/manifest.m3u8" },   // static source
      ],
    },
  ],
};
```

A source is either:

- a **static** `EmbedSource` — `{type:"hls",url}`, `{type:"youtube",channelId,videoId?}`, `{type:"iframe",url}` — emitted as-is; or
- a **resolver source** — `{type:"resolver", resolver, params, fallback?}` — looked up at request time.
  If the resolver throws, times out (4 s per request, 7 s per source) or finds nothing, the
  `fallback` is emitted instead; with no fallback the source is dropped. A stream left with zero
  sources is dropped. Nothing a resolver does can fail the route.

Duplicate sources within a stream (e.g. a resolver returning the same URL as a later static
source) are de-duplicated.

### Validation

TypeScript catches most mistakes (resolver params are typed per resolver). At runtime
`validate.ts` re-checks everything once per server process: https URLs, YouTube ids, slugs,
resolver names and params, duplicate stream ids, version format. Problems are logged as
`[streams] config error: …`; a bad **stream** is skipped, a bad **provider header** (id, name,
version, updatedAt, changelog, streams) skips the whole provider. Check the server log after editing.

### Caching

- Resolver lookups are cached in memory per server instance: **5 min** for manifest discovery
  (NBC playlist page, station WP API, CBS collection, ABC itemfeed + manifest check), **2 min**
  for YouTube live video ids, **30 s** for failures. Concurrent requests share one in-flight fetch,
  and pages that serve many streams (NBC playlist, CBS collection) are fetched once.
- The route is dynamic (`await connection()`, because `cacheComponents` is on) and sends
  `Cache-Control: public, max-age=30, s-maxage=120, stale-while-revalidate=600`.
- Response header `X-Stream-Resolve-Stats` shows per provider how many sources were `resolved`
  / `fallback` / `static` / `skipped` — the quickest health check.
- `STREAMS_OFFLINE=1 npm run dev` serves `getStaticCatalog()` (fallbacks only, no network).

## Versioning — when a provider changes something

`version` is `YYYY.MM.DD-N` (N = 1, 2, … for multiple changes on one day). It reaches the UI as
`configVersion`, so a bump is how you tell a cached client / a bug report which config it ran.

When a provider moves a stream, renames a channel, kills an endpoint, etc.:

1. Find the new value (see "Rediscovering" below) and edit the provider file — update the
   static `fallback` URLs too, not just resolver params, because fallbacks are what users get
   when the resolver breaks.
2. Bump `version` (e.g. `2026.11.07-1` → `2026.11.07-2`, or a new date `2026.12.01-1`) and set `updatedAt`.
3. Add a changelog entry **at the top** with the same version and a one-line note of what the
   provider changed and what you did. (`changelog[0].version` ≠ `version` logs a warning.)
4. `npx tsc --noEmit && npm run lint`, then `npm run dev` and `curl -sD- localhost:3000/api/streams -o /dev/null`
   and check `X-Stream-Resolve-Stats` — `fallback`/`skipped` counts should be 0 for the provider.

Bump per provider: an NBC fix doesn't touch the ABC/CBS versions.

## Adding a stream

1. Pick the provider file and add a `StreamConfig` with a new lowercase slug `id` (never reuse
   or rename an existing slug — the UI persists stream ids).
2. Order sources best-first: our own HLS (fully controllable, PiP-friendly) → YouTube
   (controllable via the iframe API) → provider iframe (not controllable; last resort).
3. Prefer a resolver source with a static `fallback`. Give a stream at least one source that
   works without the network lookup.
4. Use `enabled: false` (with a comment why) for streams you want to keep documented but not shown.
5. Bump the provider `version` + changelog as above.

## Adding a resolver

Create `src/lib/streams/resolvers/<name>.ts` exporting a `ResolverDefinition` (`validateParams`
+ `resolve(params) => Promise<EmbedSource | null>`), add its params to `ResolverParamsMap` and
`RESOLVER_NAMES` in `config-types.ts`, and register it in `resolvers/index.ts`. Use `fetchText` /
`fetchJson` (timeout + UA) and `cached()` from `http.ts`. Treat every response as untrusted:
never assume shape, validate URLs with `toHttpsUrl`, return `null` rather than guessing.

## Providers

### NBC (`nbc.ts`)

`nbcnews.com/watch` is **not** frameable (CSP `frame-ancestors`); the `/news/embedded-video/mmvo<id>` player page is.

| Streams | Method (primary → fallbacks) | Known fragility |
| --- | --- | --- |
| National FAST: News NOW, TODAY All Day, Dateline 24/7, Sky News, Sports NOW, Noticias Telemundo AHORA, Telemundo Deportes AHORA | `nbc-fast-playlist`: fetch `nbcnews.com/news/embedded-video/mmvo248671301631`, parse `__NEXT_DATA__`, find playlist `mmlsnbc_subs_non_drm_linear_streams`, match `mpxMetadata.id`, take `videoAssets[assetType=liveHls].publicUrl` (`*.fast.nbcuni.com/live/master.m3u8`) → static HLS → embedded-video iframe (TODAY uses `today.com/today/embedded-video/…`) → YouTube for News NOW / Sky News | Next.js page structure can change; the playlist id or the anchor video id can be retired. Sports NOW / Telemundo static URLs unverified. |
| MS NOW, CNBC (**disabled**) | `youtube-live` only | Network feeds need a TV-provider login; YouTube rarely live. |
| Local owned stations (NBC NY, LA, Chicago, DFW, Philadelphia, Washington, Boston, Bay Area, South Florida, San Diego, Connecticut; Telemundo Noreste/47, Florida/51, California/52, Texas/Dallas) | `nbc-station-wp`: `https://www.<domain>/wp-json/wp/v2/videos/<postId>` → `meta.m3u8_url` (Xumo FAST on CloudFront) → static Xumo URL; NBC New York also has the `amp_video` iframe | WP post ids can be replaced. The Xumo URL **400s without** `ads.xumo_channelId=<id>a&ads.caid=<CAID>`; the published URL contains unexpanded ad macros, which the CDN currently accepts. |

### ABC (`abc.ts`)

| Streams | Method | Known fragility |
| --- | --- | --- |
| ABC News Live | `abc-itemfeed` id `41463246`: `abcnews.com/video/itemfeed?id=…` → `channel.item["media-group"]["media-content"][]` with `@attributes.type = application/x-mpegURL`; each candidate is GET-checked for `#EXTM3U` → static `abcnews-streams.akamaized.net` HLS (unsigned, `ACAO: *`) → `youtube-live` UCBi2mrWuNuyYy4gbM6fU18Q (official) → `abcnews.com/video/embed?id=41463246` iframe (ads/consent, not controllable) | Feed lists some dead URLs (HDS `.f4m`, old `akamaihd.net`) — handled by the manifest check. |
| ABC News Special Coverage (**disabled**) | `abc-itemfeed` id `abc_live10` + embed iframe | `abc_live<N>` slots rotate and are usually idle; pick the right slot during breaking news. |
| ABC7 New York (**disabled**) | `abc7ny.com/video/embed?pid=11064922` iframe | Unverified playback. |

### CBS (`cbs.ts`)

No player-only embed exists (framing `cbsnews.com/live` shows the whole site), so there are no iframe sources.

| Streams | Method | Known fragility |
| --- | --- | --- |
| CBS News 24/7 + 14 local stations (New York, Baltimore, Bay Area, Boston, Chicago, Colorado, Detroit, Los Angeles, Miami, Minnesota, Philadelphia, Pittsburgh, Sacramento, Texas) | `cbs-live-channels` (`cbsnews.com/video/xhr/collection/component/live-channels/` → `items[slug].items[0]`): field `video` (Google DAI HLS) → static DAI URL; then field `video2` (origin HLS) → static origin URL. 24/7 also has `youtube-live` UC8p1vwvWtl6T73JiExfWs1g last | DAI URLs redirect to per-session URLs (fine for hls.js) and insert ads. Origin hostnames rotate. YouTube is usually offline. |
| More: CBS Sports HQ, Inside Edition, ET Live (`mixible`), 48 Hours, 60 Minutes | `cbs-live-channels` field `video` → static DAI only | Their `video2` origins returned 4xx/5xx, so they are not used. |

## Rediscovering endpoints

- **NBC national:** open the embedded-video page, view source, search for `mmlsnbc_subs_non_drm_linear_streams`; MPX ids are in `mpxMetadata.id`.
- **NBC stations:** on the station's live page, find the FAST stream video post id (URL `/video/…/xumo_…_fast_stream/<postId>/`), then `curl https://www.<domain>/wp-json/wp/v2/videos/<postId>`.
- **CBS:** `curl -s https://www.cbsnews.com/video/xhr/collection/component/live-channels/ | jq '.items[] | {slug, v: .items[0].video, v2: .items[0].video2}'`.
- **ABC:** `curl -s 'https://abcnews.com/video/itemfeed?id=41463246'` and look at `media-content`.
- **YouTube:** `https://www.youtube.com/channel/<UC…>/live` — canonical `watch?v=` when live.
