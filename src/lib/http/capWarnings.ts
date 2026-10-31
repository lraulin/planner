const DEFAULT_CAP = 50;

/**
 * Cap a warning list for an API response so a chatty import cannot balloon the JSON.
 */
export function capWarnings(warnings: readonly string[], cap = DEFAULT_CAP): string[] {
  if (warnings.length <= cap) return [...warnings];
  return [...warnings.slice(0, cap), `…and ${warnings.length - cap} more warnings`];
}
