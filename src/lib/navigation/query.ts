/**
 * Carrying a query string across a server-side redirect.
 *
 * Two callers need identical behaviour and must not drift: `moduleEntryRedirect`, which sends
 * `/schedule?block=<id>` on to the page you last used, and the ten legacy module paths left
 * behind by the module consolidation, which have `?detail=` and `?view=` written onto them by
 * `hrefWithViewState` and sit in bookmarks and on a phone home screen.
 *
 * Re-encoded rather than string-concatenated, because a date key or a node id with a reserved
 * character has to survive the hop, and Next hands repeated params as arrays.
 */
export function withQuery(
  href: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, entry);
    }
  }

  const search = query.toString();
  return search ? `${href}?${search}` : href;
}
