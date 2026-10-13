import { redirect } from "next/navigation";
import { fitnessLogPath, fitnessSessionPath } from "@/lib/fitness/routes";
import { moduleEntryRedirect } from "@/components/shell/moduleEntry";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  log?: string;
  exercise?: string;
  session?: string;
}>;

/**
 * The Fitness entry point. Renders nothing — Sessions and Exercises are the pages.
 *
 * Two generations of deep link land here and both still work: the query-based ones from before
 * the editors became routes (`?session=`, `?log=1`), and every bookmark of `/fitness` itself
 * from when this file *was* the Sessions list.
 */
export default async function FitnessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  if (params.session) {
    redirect(fitnessSessionPath(params.session));
  }
  if (params.log === "1" || params.log === "true") {
    redirect(fitnessLogPath({ exercise: params.exercise ?? null }));
  }

  await moduleEntryRedirect("fitness");
}
