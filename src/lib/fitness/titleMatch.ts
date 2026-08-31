/** Repeatable workout names: trim + case-insensitive. Empty is a one-off, not a title. */

export function normalisedTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function titlesMatch(a: string, b: string): boolean {
  return normalisedTitle(a) === normalisedTitle(b);
}

export function isRepeatableTitle(title: string): boolean {
  return title.trim() !== "";
}
