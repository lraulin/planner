import { legacyRedirect } from "@/components/shell/legacyRedirect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/goals` is `/plan/goals` now. See `legacyRedirect`. */
export default async function GoalsRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await legacyRedirect("/plan/goals", searchParams);
}
