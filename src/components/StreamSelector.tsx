"use client";

import type { ProviderCatalog, ProviderId } from "@/lib/streams/types";

interface StreamSelectorProps {
  providers: ProviderCatalog[];
  selectedProvider: ProviderId;
  onSelectProvider: (id: ProviderId) => void;
  activeId: string | null;
  pipIds: readonly string[];
  onSelectStream: (id: string) => void;
}

/** Provider tabs (NBC / ABC / CBS) with the chosen provider's streams as chips grouped by `group`. */
export function StreamSelector({
  providers,
  selectedProvider,
  onSelectProvider,
  activeId,
  pipIds,
  onSelectStream,
}: StreamSelectorProps) {
  const provider = providers.find((p) => p.id === selectedProvider) ?? providers[0];
  const groups = new Map<string, ProviderCatalog["streams"]>();
  for (const s of provider?.streams ?? []) {
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Networks" className="flex gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
        {providers.map((p) => {
          const selected = p.id === provider?.id;
          const live = p.streams.some((s) => s.id === activeId);
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={selected}
              aria-controls={`panel-${p.id}`}
              onClick={() => onSelectProvider(p.id)}
              className={`relative flex-1 rounded-lg px-4 py-2 text-sm font-bold tracking-wide transition focus-visible:outline-2 focus-visible:outline-red-500 sm:flex-none sm:px-6 ${
                selected ? "bg-white text-zinc-950 shadow" : "text-zinc-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {p.name}
              {live && (
                <span
                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500"
                  aria-label="(now playing)"
                />
              )}
            </button>
          );
        })}
      </div>

      {provider && (
        <div
          role="tabpanel"
          id={`panel-${provider.id}`}
          aria-labelledby={`tab-${provider.id}`}
          className="flex flex-col gap-2"
        >
          {provider.streams.length === 0 && (
            <p className="text-sm text-zinc-500">No streams available for {provider.name} right now.</p>
          )}
          {[...groups].map(([group, streams]) => (
            <div key={group} className="flex items-start gap-3">
              <span className="w-16 shrink-0 pt-1.5 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
                {group}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {streams.map((s) => {
                  const active = s.id === activeId;
                  const inPip = pipIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectStream(s.id)}
                      aria-pressed={active}
                      className={`rounded-full px-3 py-1 text-sm transition focus-visible:outline-2 focus-visible:outline-red-500 ${
                        active
                          ? "bg-red-600 font-semibold text-white"
                          : inPip
                            ? "bg-white/10 text-zinc-100 ring-1 ring-white/30 hover:bg-white/20"
                            : "bg-white/5 text-zinc-300 ring-1 ring-white/10 hover:bg-white/15 hover:text-white"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
