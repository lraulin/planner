import { legacyRedirect } from "@/components/shell/legacyRedirect";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/day/week` is `/schedule/week-plan` now. See `../page.tsx`. */
export default async function WeekPlanRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await legacyRedirect("/schedule/week-plan", searchParams);
}
