import { legacyRedirect } from "@/components/shell/legacyRedirect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/time-charts` is `/schedule/time-charts` now. See `legacyRedirect`. */
export default async function TimeChartsRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await legacyRedirect("/schedule/time-charts", searchParams);
}
