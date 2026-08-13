import { legacyRedirect } from "@/components/shell/legacyRedirect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/overview` is `/plan/overview` now. See `legacyRedirect`. */
export default async function OverviewRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await legacyRedirect("/plan/overview", searchParams);
}
