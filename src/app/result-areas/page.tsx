import { legacyRedirect } from "@/components/shell/legacyRedirect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/result-areas` is `/plan/result-areas` now. See `legacyRedirect`. */
export default async function ResultAreasRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await legacyRedirect("/plan/result-areas", searchParams);
}
