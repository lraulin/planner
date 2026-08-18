import {
  DEFAULT_FIELD_CLASSES,
  DEFAULT_SOURCES,
  normalizeFieldClasses,
  normalizeSources,
} from "@/lib/find/sources";
import {
  DEFAULT_INCLUDE_OPTIONS,
  DEFAULT_MATCH_OPTIONS,
  type FindFieldClass,
  type FindIncludeOptions,
  type FindMatchOptions,
  type FindSourceId,
} from "@/lib/find/types";
import { asBoolean, asRecord } from "./parse";

/**
 * What Advanced Find remembers between searches, under the `find` scope.
 *
 * The query itself is not here — it lives in `?q=` so Back and reload reproduce a search
 * (`url/viewState.ts`). Everything on this page that behaves like a filter behaves like every
 * other filter in the app: stored, not addressable.
 */

export type FindSettings = {
  sources: FindSourceId[];
  fieldClasses: FindFieldClass[];
  match: FindMatchOptions;
  include: FindIncludeOptions;
};

export const DEFAULT_FIND_SETTINGS: FindSettings = {
  sources: [...DEFAULT_SOURCES],
  fieldClasses: [...DEFAULT_FIELD_CLASSES],
  match: DEFAULT_MATCH_OPTIONS,
  include: DEFAULT_INCLUDE_OPTIONS,
};

/**
 * Read a stored blob, degrading to defaults rather than throwing.
 *
 * An **empty** stored list falls back to everything, which is the one place this differs from
 * the grid's filters: there, an empty selection means "nothing is being excluded"; here it
 * would mean "search nothing", and a Find page that can never match anything looks broken
 * rather than filtered. The UI refuses to untick the last box for the same reason.
 */
export function parseFindSettings(value: unknown): FindSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_FIND_SETTINGS;

  const sources = normalizeSources(asArray(record.sources));
  const fieldClasses = normalizeFieldClasses(asArray(record.fieldClasses));
  const match = asRecord(record.match) ?? {};
  const include = asRecord(record.include) ?? {};

  return {
    sources: sources.length ? sources : [...DEFAULT_SOURCES],
    fieldClasses: fieldClasses.length ? fieldClasses : [...DEFAULT_FIELD_CLASSES],
    match: {
      matchCase: asBoolean(match.matchCase, DEFAULT_MATCH_OPTIONS.matchCase),
      wholeWord: asBoolean(match.wholeWord, DEFAULT_MATCH_OPTIONS.wholeWord),
      regex: asBoolean(match.regex, DEFAULT_MATCH_OPTIONS.regex),
    },
    include: {
      completed: asBoolean(include.completed, DEFAULT_INCLUDE_OPTIONS.completed),
      shelved: asBoolean(include.shelved, DEFAULT_INCLUDE_OPTIONS.shelved),
    },
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
