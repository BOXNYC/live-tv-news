// Runtime validation of provider configs. Configs are TypeScript, so most mistakes are caught
// at compile time — this catches the rest (bad URLs, ids, duplicate slugs, resolver params,
// edits made with `as any`, …). A bad stream is skipped; a bad provider header skips the
// whole provider. Problems are returned as human-readable strings for logging.

import type { ProviderConfig, SourceConfig, StreamConfig } from "./config-types";
import { isRecord } from "./http";
import { isResolverName, resolvers } from "./resolvers";
import type { ProviderId } from "./types";
import { embedSourceErrors, isNonEmptyString, isSlug } from "./validate-primitives";

const PROVIDER_IDS: readonly ProviderId[] = ["nbc", "abc", "cbs"];
const VERSION_RE = /^\d{4}\.\d{2}\.\d{2}-\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/;

export interface ValidationResult {
  /** The provider with only valid streams, or null if the provider itself is invalid. */
  provider: ProviderConfig | null;
  errors: string[];
  warnings: string[];
}

export function sourceConfigErrors(src: unknown): string[] {
  if (!isRecord(src)) return ["source must be an object"];
  if (src.type !== "resolver") return embedSourceErrors(src);
  if (!isResolverName(src.resolver)) return [`unknown resolver ${JSON.stringify(src.resolver)}`];
  const errs = resolvers[src.resolver].validateParams(src.params).map((e) => `${src.resolver}: ${e}`);
  if (src.fallback !== undefined) errs.push(...embedSourceErrors(src.fallback).map((e) => `fallback: ${e}`));
  return errs;
}

function streamErrors(s: unknown): string[] {
  if (!isRecord(s)) return ["stream must be an object"];
  const errs: string[] = [];
  if (!isSlug(s.id)) errs.push(`id ${JSON.stringify(s.id)} must be a lowercase slug`);
  if (!isNonEmptyString(s.name, 120)) errs.push("name must be a non-empty string");
  if (!isNonEmptyString(s.group, 60)) errs.push("group must be a non-empty string");
  if (typeof s.enabled !== "boolean") errs.push("enabled must be a boolean");
  if (!Array.isArray(s.sources) || s.sources.length === 0) {
    errs.push("sources must be a non-empty array");
  } else {
    s.sources.forEach((src, i) => errs.push(...sourceConfigErrors(src).map((e) => `sources[${i}]: ${e}`)));
  }
  return errs;
}

export function validateProviderConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = isRecord(raw) && typeof raw.id === "string" ? raw.id : "<unknown provider>";

  if (!isRecord(raw)) return { provider: null, errors: [`${label}: config must be an object`], warnings };
  if (!PROVIDER_IDS.includes(raw.id as ProviderId)) errors.push(`${label}: id must be one of ${PROVIDER_IDS.join(", ")}`);
  if (!isNonEmptyString(raw.name, 120)) errors.push(`${label}: name must be a non-empty string`);
  if (typeof raw.version !== "string" || !VERSION_RE.test(raw.version))
    errors.push(`${label}: version ${JSON.stringify(raw.version)} must look like YYYY.MM.DD-N`);
  if (typeof raw.updatedAt !== "string" || !DATE_RE.test(raw.updatedAt))
    errors.push(`${label}: updatedAt must be an ISO date`);
  if (!Array.isArray(raw.changelog)) {
    errors.push(`${label}: changelog must be an array`);
  } else {
    raw.changelog.forEach((c, i) => {
      if (!isRecord(c) || typeof c.version !== "string" || typeof c.date !== "string" || typeof c.notes !== "string")
        errors.push(`${label}: changelog[${i}] must be {version, date, notes}`);
    });
    const head = raw.changelog[0];
    if (isRecord(head) && head.version !== raw.version)
      warnings.push(`${label}: changelog[0].version (${String(head.version)}) does not match version (${String(raw.version)})`);
  }
  if (!Array.isArray(raw.streams)) errors.push(`${label}: streams must be an array`);
  if (errors.length > 0) return { provider: null, errors, warnings };

  const seen = new Set<string>();
  const streams: StreamConfig[] = [];
  (raw.streams as unknown[]).forEach((s, i) => {
    const sLabel = `${label}.streams[${i}]${isRecord(s) && typeof s.id === "string" ? ` (${s.id})` : ""}`;
    const errs = streamErrors(s);
    if (errs.length > 0) {
      errors.push(...errs.map((e) => `${sLabel}: ${e} — stream skipped`));
      return;
    }
    const stream = s as unknown as StreamConfig;
    if (seen.has(stream.id)) {
      errors.push(`${sLabel}: duplicate id — stream skipped`);
      return;
    }
    seen.add(stream.id);
    streams.push({ ...stream, sources: stream.sources as SourceConfig[] });
  });

  return { provider: { ...(raw as unknown as ProviderConfig), streams }, errors, warnings };
}
