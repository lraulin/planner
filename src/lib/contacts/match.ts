import type { ContactOption } from "./types";

/**
 * Contacts whose display name matches a type-in query, best first.
 *
 * Empty query keeps the given order (callers already sort). Matching is case-insensitive
 * substring; a prefix ranks above a later hit so "ki" lists Kim before Ada King.
 * Multi-word queries require every token.
 */
export function matchContacts(
  contacts: readonly ContactOption[],
  query: string,
): ContactOption[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...contacts];

  const tokens = trimmed.split(/\s+/);
  const scored: { contact: ContactOption; score: number }[] = [];

  for (const contact of contacts) {
    const name = contact.displayName.toLowerCase();
    const score = scoreMatch(name, trimmed, tokens);
    if (score !== null) scored.push({ contact, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score || a.contact.displayName.localeCompare(b.contact.displayName),
  );
  return scored.map((row) => row.contact);
}

/**
 * What committing typed text should select. Exact display name (only if unique), then
 * the only remaining match. `null` means revert — a typo must not invent a person.
 */
export function resolveContactQuery(
  contacts: readonly ContactOption[],
  query: string,
): ContactOption | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;

  const exact = contacts.filter(
    (contact) => contact.displayName.toLowerCase() === trimmed,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const matches = matchContacts(contacts, query);
  return matches.length === 1 ? matches[0] : null;
}

function scoreMatch(name: string, query: string, tokens: string[]): number | null {
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  if (tokens.length > 1 && tokens.every((token) => name.includes(token))) {
    return 2;
  }
  return null;
}
