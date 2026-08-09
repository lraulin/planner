/**
 * Achieve-style short date for dense, scan-oriented UI (`m/d/yy`).
 *
 * The input is a calendar-day key, not an instant. Read its written components directly:
 * parsing through `Date` would let the browser timezone move a stored day backwards.
 */
export function formatShortDate(dateKey: string | null | undefined): string {
  if (!dateKey) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return "";

  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return "";
  }

  return `${monthNumber}/${dayNumber}/${year.slice(2)}`;
}
