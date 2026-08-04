/**
 * The grid's quick search: one box that matches across every filterable column at once.
 *
 * This is the cheapest rung of the filter ladder — quick search, then the column funnel,
 * then the cross-column builder in `crossFilter.ts`. It exists because most narrowing
 * starts as "I know a word that's in it", and making that require a column choice and an
 * operator is the kind of ceremony that stops people filtering at all.
 *
 * Deliberately dumb: case-insensitive substring, no operators, no field syntax, no regex.
 * Anything more expressive belongs in the builder, where the expression stays visible.
 */

/** Whether the query narrows anything. Whitespace alone does not. */
export function searchActive(query: string): boolean {
  return query.trim() !== "";
}

/**
 * Whether a row matches the query.
 *
 * `values` is keyed by column id and carries an entry for every filterable column the tab
 * **defines** — so a hit in a column Show Fields has hidden still counts. That is the same
 * reach the column filters and the advanced filter have, and inconsistency between them
 * would be impossible to reason about: a word would find a row from one control and not
 * another.
 *
 * Multiple whitespace-separated terms must **all** match, though each may match a different
 * column — "health report" finds a row whose Purpose is Health and whose Name mentions a
 * report. That is what people expect from a search box, and it is what makes a second word
 * narrow rather than widen.
 */
export function rowMatchesSearch(
  values: Record<string, string | null>,
  query: string,
): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = Object.values(values)
    .filter((value): value is string => value !== null && value !== "")
    .map((value) => value.toLocaleLowerCase());

  return terms.every((term) => haystack.some((value) => value.includes(term)));
}
