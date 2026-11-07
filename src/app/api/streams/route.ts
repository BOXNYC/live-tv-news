// GET /api/streams → StreamCatalog (see src/lib/streams/types.ts).
//
// Runs at request time (cacheComponents is on, so we opt out of prerendering with
// connection()); resolver lookups are cached in memory for 2–5 minutes, and the response is
// CDN-cacheable for 2 minutes with stale-while-revalidate.

import { connection } from "next/server";
import { getStaticCatalog, getStreamCatalogWithStats } from "@/lib/streams/catalog";
import { errorMessage } from "@/lib/streams/http";

export async function GET(): Promise<Response> {
  await connection();
  if (process.env.STREAMS_OFFLINE === "1") {
    // Offline/dev mode: static sources and resolver fallbacks only, no upstream requests.
    return Response.json(await getStaticCatalog(), { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const { catalog, stats } = await getStreamCatalogWithStats();
    const summary = Object.entries(stats)
      .map(([id, s]) => `${id};streams=${s.streams};resolved=${s.resolved};fallback=${s.fallback};static=${s.static};skipped=${s.skipped}`)
      .join(", ");
    return Response.json(catalog, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
        "X-Stream-Resolve-Stats": summary,
      },
    });
  } catch (err) {
    // Should be unreachable (every resolver failure is contained), but never 500 the UI.
    console.error(`[streams] catalog build failed, serving static catalog: ${errorMessage(err)}`);
    return Response.json(await getStaticCatalog(), {
      headers: { "Cache-Control": "public, max-age=10, s-maxage=30" },
    });
  }
}
