/**
 * One Find, end to end: validate the query, read what it needs, match it.
 *
 * Thin on purpose — the three interesting parts each live in their own module and are tested
 * there. This exists so the server action is one line and the order of operations is stated
 * once.
 */

import { makeMatcher } from "./matcher";
import { loadFindCorpus } from "./queries";
import { searchCorpus } from "./searchable";
import { FIND_MIN_QUERY_LENGTH, type FindOutcome, type FindRequest } from "./types";

/**
 * Run a search for one user.
 *
 * Throws with a sentence for two reasons — a too-short query and an unparseable regex —
 * because `actionResult.ts` passes deliberate throws through to the UI as inline validation,
 * which is exactly what both are. The client validates the pattern too, so the common case
 * never makes the round trip; this is the half that cannot be skipped.
 *
 * `today` is the **reader's** local day, which the server does not know. It decides whether a
 * shelf has expired and whether an appointment is in the past, so it is passed in rather than
 * computed here (`development/dates.md`). Null never expires a shelf.
 */
export async function runFind(
  userId: string,
  request: FindRequest,
  today: string | null,
): Promise<FindOutcome> {
  if (request.query.trim().length < FIND_MIN_QUERY_LENGTH) {
    throw new Error(`Type at least ${FIND_MIN_QUERY_LENGTH} characters to search.`);
  }

  const matcher = makeMatcher(request.query, request.match);
  if (!matcher.ok) throw new Error(matcher.error);

  const corpus = await loadFindCorpus(userId, request.sources, request.fieldClasses);

  return searchCorpus(corpus, matcher.match, {
    sources: request.sources,
    fieldClasses: request.fieldClasses,
    include: request.include,
    today,
  });
}
