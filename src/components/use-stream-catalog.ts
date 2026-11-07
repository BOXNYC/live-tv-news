"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamCatalog } from "@/lib/streams/types";

export type CatalogState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; catalog: StreamCatalog };

function isCatalog(data: unknown): data is StreamCatalog {
  return !!data && typeof data === "object" && Array.isArray((data as StreamCatalog).providers);
}

/**
 * Fetches GET /api/streams on mount; `retry` refetches after an error.
 * `onLoaded` runs once per successful load, before the ready state renders.
 */
export function useStreamCatalog(onLoaded?: (catalog: StreamCatalog) => void) {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/streams", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Stream list unavailable (HTTP ${res.status})`);
        const data: unknown = await res.json();
        if (!isCatalog(data)) throw new Error("Stream list was malformed");
        if (controller.signal.aborted) return;
        onLoadedRef.current?.(data);
        setState({ status: "ready", catalog: data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load streams",
        });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
