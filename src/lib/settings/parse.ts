/**
 * Defensive readers for a stored settings blob.
 *
 * Every `user_settings.value` is user-editable in devtools, survives refactors of the types
 * it mirrors, and may have been written by an older build. So nothing read out of one is
 * trusted: a value that is not the expected shape falls back to the default rather than
 * poisoning a filter, a sort, or a column layout.
 *
 * The posture is lifted from `parseSettings` in the Task Chooser's settings hook, including
 * its one non-obvious rule — **an explicitly empty collection is honoured**. "Show me
 * nothing" is a legal, if odd, choice, and quietly replacing it with the default would make
 * the checkboxes lie about what is on screen.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Rejects `NaN` and the infinities, which `typeof x === "number"` alone lets through. */
export function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Clamped to `[min, max]` after the finite check, for widths and other bounded numbers. */
export function asClampedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = asFiniteNumber(value, fallback);
  return Math.min(max, Math.max(min, numeric));
}

/**
 * A non-array falls back; a present array keeps only its string entries and de-duplicates.
 * An empty array stays empty — see the note at the top of this file.
 */
export function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((entry): entry is string => typeof entry === "string");
  return [...new Set(strings)];
}

/** As `asStringArray`, then dropped to the values still known to the caller. */
export function asKnownStringArray(
  value: unknown,
  allowed: readonly string[],
  fallback: string[],
): string[] {
  if (!Array.isArray(value)) return fallback;
  const known = new Set(allowed);
  return asStringArray(value, fallback).filter((entry) => known.has(entry));
}

export function asOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * A `Record<string, T>` where each entry is read through `readEntry`. An entry whose value
 * comes back `null` is dropped rather than defaulted — for maps like column widths or
 * per-column filters, "this key is absent" is meaningful and a made-up default is not.
 */
export function asMap<T>(
  value: unknown,
  readEntry: (entry: unknown) => T | null,
): Record<string, T> {
  const record = asRecord(value);
  if (!record) return {};

  const out: Record<string, T> = {};
  for (const [key, raw] of Object.entries(record)) {
    const parsed = readEntry(raw);
    if (parsed !== null) out[key] = parsed;
  }
  return out;
}
