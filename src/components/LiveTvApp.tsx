"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { ProviderId, ResolvedStream, StreamCatalog } from "@/lib/streams/types";
import { AppHeader } from "./AppHeader";
import { MainStage } from "./MainStage";
import { PipStack } from "./PipStack";
import { initialPlayerState, loadSavedState, playerReducer, saveState } from "./player-state";
import { StreamSelector } from "./StreamSelector";
import { useIdle } from "./use-idle";
import { useStreamCatalog } from "./use-stream-catalog";

const IDLE_MS = 3000;

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
  const minimizedSet = new Set(player.minimized);
  const tileStreams = pipStreams.filter((s) => !minimizedSet.has(s.id));
  const minimizedStreams = pipStreams.filter((s) => minimizedSet.has(s.id));
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
  const minimize = useCallback((id: string) => dispatch({ type: "minimize", id }), []);
  const restore = useCallback((id: string) => dispatch({ type: "restore", id }), []);
  const toggleMute = useCallback(() => setAudioOn((on) => !on), []);
  const onAutoplayBlocked = useCallback(() => setAudioOn(false), []);

  // Channel panel: null until the user toggles it; until then it is open only when nothing plays.
  const [panelChoice, setPanelChoice] = useState<boolean | null>(null);
  const panelOpen = panelChoice ?? (!!catalog && player.hydrated && !active);
  const setPanelOpen = useCallback((open: boolean) => setPanelChoice(open), []);
  const selectFromPanel = useCallback(
    (id: string) => {
      select(id);
      setPanelChoice(false);
    },
    [select],
  );

  // Clean video: chrome fades after a few idle seconds while a stream plays and the panel is shut.
  const idle = useIdle(IDLE_MS, !!active && !panelOpen);

  return (
    <div className={`fixed top-0 left-0 h-dvh w-dvw overflow-hidden bg-black text-zinc-100 ${idle ? "cursor-none" : ""}`}>
      {catalogState.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
          <span className="flex items-center gap-3 text-sm text-zinc-400" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            Loading streams…
          </span>
        </div>
      )}
      {catalogState.status === "error" && (
        <div
          className="safe-px absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-center"
          role="alert"
        >
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
        <MainStage
          stream={active}
          providerName={activeProvider?.name ?? null}
          muted={!audioOn}
          onToggleMute={toggleMute}
          onAutoplayBlocked={onAutoplayBlocked}
          controlsHidden={idle}
          hasPip={tileStreams.length > 0}
          hasPipTab={minimizedStreams.length > 0}
        />
      )}

      {/* While idle, the first touch or mouse move over the video (even a cross-origin iframe) wakes the UI. */}
      {idle && <div className="absolute inset-0 z-20" aria-hidden />}

      <AppHeader open={panelOpen} onOpenChange={setPanelOpen} hidden={idle} nowPlaying={active}>
        {catalog ? (
          <div className="flex flex-col gap-4">
            <StreamSelector
              providers={catalog.providers}
              selectedProvider={selectedProvider}
              onSelectProvider={setTabOverride}
              activeId={player.activeId}
              pipIds={player.pip}
              onSelectStream={selectFromPanel}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-[11px] text-zinc-500">
              {catalog.providers.map((p) => (
                <span key={p.id}>
                  {p.name} config {p.configVersion}
                </span>
              ))}
              <span>Updated {new Date(catalog.generatedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ) : (
          <p className="py-2 text-sm text-zinc-400">
            {catalogState.status === "error" ? "Channel list unavailable." : "Loading channels…"}
          </p>
        )}
      </AppHeader>

      {catalog && (
        <PipStack
          streams={tileStreams}
          minimized={minimizedStreams}
          onPromote={promote}
          onClose={close}
          onMinimize={minimize}
          onRestore={restore}
        />
      )}
    </div>
  );
}
