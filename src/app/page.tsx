import { redirect } from "next/navigation";
import { withQuery } from "@/lib/navigation/query";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Straight to Plan, which resolves to the page you were last on and to Overview when there is
 * no history. This pointed at `/overview` directly until Overview became one of Plan's pages —
 * a hub is the right landing for a first visit and the wrong one for the four-hundredth.
 *
 * The query rides along, as it does through `moduleEntryRedirect`: a tapped reminder opens
 * `/?reminders=open`, and the panel has to still be asked for when the page arrives.
 */
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  redirect(withQuery("/plan", await searchParams));
}
