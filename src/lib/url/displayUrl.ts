/**
 * The part of a stored URL worth reading in a grid cell: the host, without the scheme,
 * `www.`, or the path.
 *
 * Falls back to the raw text when the value does not parse — the user typed something,
 * and showing it back beats showing an error or an empty cell.
 */
export function urlHostLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const host = new URL(candidate).hostname.replace(/^www\./, "");
    return host || trimmed;
  } catch {
    return trimmed;
  }
}
