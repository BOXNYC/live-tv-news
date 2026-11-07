import type { ResolverName, ResolverParamsMap } from "../config-types";
import type { EmbedSource } from "../types";

export interface ResolverDefinition<K extends ResolverName = ResolverName> {
  name: K;
  /** Runtime check of untrusted config params. Returns a list of problems (empty = valid). */
  validateParams(raw: unknown): string[];
  /**
   * Look up a playable source. Returns null when the upstream data has no usable entry.
   * May throw on network/parse errors — the caller treats a throw the same as null.
   */
  resolve(params: ResolverParamsMap[K]): Promise<EmbedSource | null>;
}
