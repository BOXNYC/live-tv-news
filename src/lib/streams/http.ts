// Small server-side helpers shared by the resolvers: fetch with timeout + browser-like
// headers, an in-memory TTL cache with in-flight de-duplication, and defensive parsing helpers.
//
// Caching note: the app runs with `cacheComponents: true`, and these lookups are per-request
// data, so we deliberately use `cache: "no-store"` on fetch and keep our own small TTL cache
// in module memory. That keeps behaviour identical in dev, `next start` and serverless
// (where each warm instance has its own cache).

export const FETCH_TIMEOUT_MS = 4_000;

/** Upper bound for response bodies we are willing to read (YouTube pages are ~1.5–2 MB). */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const TTL = {
  /** Manifest discovery (playlist pages, WP API, CBS collection, ABC itemfeed). */
  manifest: 5 * 60_000,
  /** YouTube live video id. */
  youtube: 2 * 60_000,
  /** How long a failed lookup is remembered, so a dead endpoint isn't hammered. */
  failure: 30_000,
} as const;

export class FetchError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchTextOptions {
  accept?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** GET a URL as text with a timeout and browser-like headers. Throws FetchError on non-2xx. */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: opts.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...opts.headers,
      },
    });
  } catch (err) {
    throw new FetchError(`request failed: ${errorMessage(err)}`, url);
  }
  if (!res.ok) {
    // Drain/cancel the body so the connection can be reused.
    res.body?.cancel().catch(() => {});
    throw new FetchError(`HTTP ${res.status}`, url, res.status);
  }
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    res.body?.cancel().catch(() => {});
    throw new FetchError(`body too large (${len} bytes)`, url, res.status);
  }
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) throw new FetchError("body too large", url, res.status);
  return text;
}

/** GET a URL and JSON.parse it. Throws on network/HTTP/parse errors. */
export async function fetchJson(url: string, opts: FetchTextOptions = {}): Promise<unknown> {
  const text = await fetchText(url, { accept: "application/json,text/plain;q=0.9,*/*;q=0.5", ...opts });
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FetchError("invalid JSON", url);
  }
}

// ---------------------------------------------------------------------------------------------
// In-memory TTL cache
// ---------------------------------------------------------------------------------------------

interface CacheEntry {
  expires: number;
  value: Promise<unknown>;
}

const cacheStore: Map<string, CacheEntry> = ((globalThis as { __streamResolverCache?: Map<string, CacheEntry> })
  .__streamResolverCache ??= new Map());

const MAX_CACHE_ENTRIES = 500;

/**
 * Memoize `fn()` under `key` for `ttlMs`. Concurrent callers share one in-flight promise.
 * Rejections (and `null` results) are cached for `failureTtlMs` only.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  failureTtlMs: number = TTL.failure,
): Promise<T> {
  const now = Date.now();
  const hit = cacheStore.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;

  const entry: CacheEntry = { expires: now + ttlMs, value: Promise.resolve() };
  const promise = fn().then(
    (value) => {
      if (value === null || value === undefined) entry.expires = Date.now() + failureTtlMs;
      return value;
    },
    (err: unknown) => {
      entry.expires = Date.now() + failureTtlMs;
      throw err;
    },
  );
  // Avoid unhandled-rejection warnings for cached failures; callers still see the rejection.
  promise.catch(() => {});
  entry.value = promise;

  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    for (const [k, v] of cacheStore) if (v.expires <= now) cacheStore.delete(k);
    if (cacheStore.size >= MAX_CACHE_ENTRIES) cacheStore.clear();
  }
  cacheStore.set(key, entry);
  return promise;
}

// ---------------------------------------------------------------------------------------------
// Defensive parsing helpers
// ---------------------------------------------------------------------------------------------

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Returns the URL normalized if it is a syntactically valid https URL, else null. */
export function toHttpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 4096) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** True if the (https) URL path looks like an HLS manifest. */
export function looksLikeHlsUrl(url: string): boolean {
  try {
    return /\.m3u8$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Depth-first search through untrusted JSON with depth/node limits. */
export function findInJson(
  root: unknown,
  predicate: (node: Record<string, unknown>) => boolean,
  limits: { maxDepth?: number; maxNodes?: number } = {},
): Record<string, unknown> | null {
  const maxDepth = limits.maxDepth ?? 40;
  let budget = limits.maxNodes ?? 200_000;
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length > 0 && budget-- > 0) {
    const [node, depth] = stack.pop()!;
    if (depth > maxDepth) continue;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push([node[i], depth + 1]);
    } else if (isRecord(node)) {
      if (predicate(node)) return node;
      for (const v of Object.values(node)) if (typeof v === "object" && v !== null) stack.push([v, depth + 1]);
    }
  }
  return null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    return cause instanceof Error ? `${err.message} (${cause.message})` : err.message;
  }
  return String(err);
}
