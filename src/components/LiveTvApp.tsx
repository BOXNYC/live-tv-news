"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { ProviderId, ResolvedStream, StreamCatalog } from "@/lib/streams/types";
import { MainStage } from "./MainStage";
import { PipStack } from "./PipStack";
import { initialPlayerState, loadSavedState, playerReducer, saveState } from "./player-state";
import { StreamSelector } from "./StreamSelector";
import { useStreamCatalog } from "./use-stream-catalog";

/** First stream of the first provider, preferring NBC News NOW when present. */
function defaultStreamId(catalog: StreamCatalog): string | null {
  const all = catalog.providers.flatMap((p) => p.streams);
  const newsNow = all.find((s) => s.providerId === "nbc" && /news\s*now/i.test(s.name));
  return newsNow?.id ?? all[0]?.id ?? null;
}

export function LiveTvApp() {
  const [player, dispatch] = useReducer(playerReducer, initialPlayerState);
  // Session-only: once the user unmutes, later main streams start with sound (all start muted first).
  const [audioOn, setAudioOn] = useState(false);
  const [tabOverride, setTabOverride] = useState<ProviderId | null>(null);

  const onCatalogLoaded = useCallback((catalog: StreamCatalog) => {
    dispatch({
      type: "hydrate",
      saved: loadSavedState(),
      validIds: catalog.providers.flatMap((p) => p.streams.map((s) => s.id)),
      fallbackActiveId: defaultStreamId(catalog),
    });
  }, []);
  const { state: catalogState, retry } = useStreamCatalog(onCatalogLoaded);
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;

  const streamsById = useMemo(() => {
    const map = new Map<string, ResolvedStream>();
    for (const p of catalog?.providers ?? []) for (const s of p.streams) map.set(s.id, s);
    return map;
  }, [catalog]);

  useEffect(() => {
    if (player.hydrated) saveState(player);
  }, [player]);

  const active = player.activeId ? (streamsById.get(player.activeId) ?? null) : null;
  const pipStreams = player.pip
    .map((id) => streamsById.get(id))
    .filter((s): s is ResolvedStream => !!s);
  const selectedProvider: ProviderId =
    tabOverride ?? active?.providerId ?? catalog?.providers[0]?.id ?? "nbc";
  const activeProvider = catalog?.providers.find((p) => p.id === active?.providerId) ?? null;

  const select = useCallback((id: string) => dispatch({ type: "select", id }), []);
  const promote = useCallback(
    (id: string) => {
      dispatch({ type: "promote", id });
      const s = streamsById.get(id);
      if (s) setTabOverride(s.providerId);
    },
    [streamsById],
  );
  const close = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const toggleMute = useCallback(() => setAudioOn((on) => !on), []);
  const onAutoplayBlocked = useCallback(() => setAudioOn(false), []);

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_10px] shadow-red-600" aria-hidden />
            <h1 className="text-lg font-black tracking-tight">Live TV News</h1>
          </div>
          {catalog && (
            <StreamSelector
              providers={catalog.providers}
              selectedProvider={selectedProvider}
              onSelectProvider={setTabOverride}
              activeId={player.activeId}
              pipIds={player.pip}
              onSelectStream={select}
            />
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 lg:pb-8">
        {catalogState.status === "loading" && (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-zinc-900 ring-1 ring-white/10">
            <span className="flex items-center gap-3 text-sm text-zinc-400" role="status">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              Loading streams…
            </span>
          </div>
        )}
        {catalogState.status === "error" && (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-zinc-900 p-6 text-center ring-1 ring-white/10" role="alert">
            <span className="text-lg font-semibold">Couldn’t load the channel list</span>
            <span className="max-w-md text-sm text-zinc-400">{catalogState.message}</span>
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            >
              Retry
            </button>
          </div>
        )}
        {catalog && (
          <>
            <MainStage
              stream={active}
              providerName={activeProvider?.name ?? null}
              muted={!audioOn}
              onToggleMute={toggleMute}
              onAutoplayBlocked={onAutoplayBlocked}
            />
            <PipStack streams={pipStreams} onPromote={promote} onClose={close} />
          </>
        )}
      </main>

      <footer className="border-t border-white/5 px-4 py-3 text-[11px] text-zinc-600">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-4 gap-y-1">
          {catalog?.providers.map((p) => (
            <span key={p.id}>
              {p.name} config {p.configVersion}
            </span>
          ))}
          {catalog && <span className="lg:mr-64">Updated {new Date(catalog.generatedAt).toLocaleTimeString()}</span>}
        </div>
      </footer>
    </div>
  );
}
