/**
 * Read the import mode a request asked for, or null when it did not name one exactly.
 *
 * `replace` deletes the outline before writing the file, so it is never a default. The route
 * used to read anything that was not exactly `merge` — a missing field, `Merge`, `merge ` — as
 * `replace`. The Settings panel always sends one of the two, which is the only reason that
 * never bit; an explicit value is what makes it safe by construction rather than by caller.
 */
export function parseImportMode(raw: unknown): "merge" | "replace" | null {
  return raw === "merge" || raw === "replace" ? raw : null;
}
