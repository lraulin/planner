import { moduleEntryRedirect } from "@/components/shell/moduleEntry";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The Plan entry point. Renders nothing — Overview, Outline, Projects, Tasks, Goals, Wish List
 * and Result Areas are the pages.
 *
 * `/` redirects here, so this is where a session with no history begins: `moduleEntryRedirect`
 * falls back to Overview, the hub. Everyone else lands on the page they were last on, which is
 * why `/` stopped pointing at Overview directly — living in Tasks and being returned to a hub
 * every morning is the cost that buys.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await moduleEntryRedirect("plan", await searchParams);
}
