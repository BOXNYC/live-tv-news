// Builds the StreamCatalog served by GET /api/streams from the provider configs.
//
//   getStreamCatalog()  – resolves resolver sources over the network (server only).
//   getStaticCatalog()  – no network: resolver sources are replaced by their static fallback.

import { providerConfigs } from "@/config/streams";
import type { ProviderConfig, SourceConfig, StreamConfig } from "./config-types";
import { errorMessage } from "./http";
import { resolvers } from "./resolvers";
import type { ResolverDefinition } from "./resolvers";
import type { EmbedSource, ProviderCatalog, ResolvedStream, StreamCatalog } from "./types";
import { validateProviderConfig } from "./validate";
import { isEmbedSource } from "./validate-primitives";

/** Hard cap for a single resolver source (it may make more than one request). */
const SOURCE_TIMEOUT_MS = 7_000;

const LOG_PREFIX = "[streams]";

// ---------------------------------------------------------------------------------------------
// Config validation (configs are static, so validate once per process)
// ---------------------------------------------------------------------------------------------

let validProviders: ProviderConfig[] | null = null;

export function getValidProviderConfigs(): ProviderConfig[] {
  if (validProviders) return validProviders;
  const out: ProviderConfig[] = [];
  const seen = new Set<string>();
  for (const raw of providerConfigs as unknown[]) {
    const { provider, errors, warnings } = validateProviderConfig(raw);
    for (const w of warnings) console.warn(`${LOG_PREFIX} config warning: ${w}`);
    for (const e of errors) console.error(`${LOG_PREFIX} config error: ${e}`);
    if (!provider) {
      console.error(`${LOG_PREFIX} provider skipped due to config errors`);
      continue;
    }
    if (seen.has(provider.id)) {
      console.error(`${LOG_PREFIX} duplicate provider ${provider.id} skipped`);
      continue;
    }
    seen.add(provider.id);
    out.push(provider);
  }
  validProviders = out;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------

export type SourceOutcome = "static" | "resolved" | "fallback" | "skipped";

export interface ResolveStats {
  /** Per provider id: counts of source outcomes and emitted streams. */
  [providerId: string]: Record<SourceOutcome, number> & { streams: number; droppedStreams: number };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function resolveSource(
  src: SourceConfig,
  streamLabel: string,
  offline: boolean,
): Promise<{ source: EmbedSource | null; outcome: SourceOutcome }> {
  if (src.type !== "resolver") return { source: src, outcome: "static" };
  const fallback = src.fallback ?? null;
  if (offline) return { source: fallback, outcome: fallback ? "fallback" : "skipped" };

  try {
    const resolver = resolvers[src.resolver] as ResolverDefinition;
    const result = await withTimeout(resolver.resolve(src.params), SOURCE_TIMEOUT_MS, src.resolver);
    if (result && isEmbedSource(result)) return { source: result, outcome: "resolved" };
    console.warn(`${LOG_PREFIX} ${streamLabel}: ${src.resolver} found nothing${fallback ? ", using fallback" : ""}`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} ${streamLabel}: ${src.resolver} failed (${errorMessage(err)})${fallback ? ", using fallback" : ""}`);
  }
  return { source: fallback, outcome: fallback ? "fallback" : "skipped" };
}

function sourceKey(s: EmbedSource): string {
  return s.type === "youtube" ? `youtube:${s.channelId}:${s.videoId ?? ""}` : `${s.type}:${s.url}`;
}

async function resolveStream(
  provider: ProviderConfig,
  stream: StreamConfig,
  offline: boolean,
  stats: ResolveStats[string],
): Promise<ResolvedStream | null> {
  const id = `${provider.id}:${stream.id}`;
  const settled = await Promise.allSettled(stream.sources.map((s) => resolveSource(s, id, offline)));
  const sources: EmbedSource[] = [];
  const keys = new Set<string>();
  for (const r of settled) {
    // resolveSource never rejects, but be defensive.
    if (r.status !== "fulfilled") {
      stats.skipped++;
      continue;
    }
    stats[r.value.outcome]++;
    const src = r.value.source;
    if (!src) continue;
    const key = sourceKey(src);
    if (keys.has(key)) continue;
    keys.add(key);
    sources.push(src);
  }
  if (sources.length === 0) {
    console.warn(`${LOG_PREFIX} ${id}: no playable sources, stream dropped`);
    return null;
  }
  return { id, providerId: provider.id, name: stream.name, group: stream.group, sources };
}

async function buildCatalog(offline: boolean): Promise<{ catalog: StreamCatalog; stats: ResolveStats }> {
  const stats: ResolveStats = {};
  const providers = await Promise.all(
    getValidProviderConfigs().map(async (provider): Promise<ProviderCatalog> => {
      const pStats = (stats[provider.id] = { static: 0, resolved: 0, fallback: 0, skipped: 0, streams: 0, droppedStreams: 0 });
      const enabled = provider.streams.filter((s) => s.enabled);
      const settled = await Promise.allSettled(enabled.map((s) => resolveStream(provider, s, offline, pStats)));
      const streams: ResolvedStream[] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value) streams.push(r.value);
        else {
          pStats.droppedStreams++;
          if (r.status === "rejected")
            console.error(`${LOG_PREFIX} ${provider.id}:${enabled[i].id} failed: ${errorMessage(r.reason)}`);
        }
      });
      pStats.streams = streams.length;
      return { id: provider.id, name: provider.name, configVersion: provider.version, streams };
    }),
  );
  return { catalog: { generatedAt: new Date().toISOString(), providers }, stats };
}

/** Full catalog with resolver sources looked up live (cached in memory per resolver TTL). */
export async function getStreamCatalog(): Promise<StreamCatalog> {
  return (await buildCatalog(false)).catalog;
}

/** Same as getStreamCatalog, plus per-provider counts of how each source was produced. */
export function getStreamCatalogWithStats(): Promise<{ catalog: StreamCatalog; stats: ResolveStats }> {
  return buildCatalog(false);
}

/** Catalog from static sources and resolver fallbacks only. Never touches the network. */
export async function getStaticCatalog(): Promise<StreamCatalog> {
  return (await buildCatalog(true)).catalog;
}
