"use server";

import { runFind } from "@/lib/find/run";
import { normalizeFieldClasses, normalizeSources } from "@/lib/find/sources";
import type { FindOutcome, FindRequest } from "@/lib/find/types";
import { asDateKey, asSearchQuery } from "@/lib/url/viewState";
import { runQuery, type QueryResult } from "@/app/actionResult";

/**
 * Run an Advanced Find.
 *
 * `runQuery`, not `run`: this reads and revalidates nothing, so a search must not invalidate
 * the router cache for every page in the app.
 *
 * The request crosses the server-action boundary, so nothing in it is trusted. Sources and
 * field classes are re-normalised against the live registries, the options are rebuilt field
 * by field from their defaults, and `today` goes through the same `asDateKey` the URL uses —
 * an unparseable day would otherwise become an Invalid Date inside the shelf comparison.
 */
export async function findAction(
  request: FindRequest,
  today: string | null,
): Promise<QueryResult<FindOutcome>> {
  const safe: FindRequest = {
    query: asSearchQuery(request.query) ?? "",
    sources: normalizeSources(request.sources),
    fieldClasses: normalizeFieldClasses(request.fieldClasses),
    match: {
      matchCase: request.match?.matchCase === true,
      wholeWord: request.match?.wholeWord === true,
      regex: request.match?.regex === true,
    },
    include: {
      completed: request.include?.completed === true,
      shelved: request.include?.shelved === true,
    },
  };

  return runQuery((userId) => runFind(userId, safe, asDateKey(today)));
}
