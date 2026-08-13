import { redirect } from "next/navigation";
import { withQuery } from "@/lib/navigation/query";

/**
 * A path that used to be a module and is now a page somewhere else.
 *
 * Ten of these exist after the module consolidation — the seven Plan destinations, Contacts,
 * Resources and the Time Charts list — plus the two Day routes that Schedule absorbed a spec
 * earlier. They stay as routes rather than being deleted because these paths are in bookmarks,
 * on a phone home screen, and inside every link `hrefWithViewState` wrote: `/tasks?detail=<id>`
 * is how a drawer is shared, and dropping the query would open the grid with nothing selected.
 *
 * One helper rather than ten hand-rolled copies, since the interesting part — re-encoding a
 * repeated parameter instead of concatenating it — is exactly the part that is easy to get
 * subtly wrong in the tenth copy.
 */
export async function legacyRedirect(
  target: string,
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<never> {
  redirect(withQuery(target, searchParams ? await searchParams : {}));
}
