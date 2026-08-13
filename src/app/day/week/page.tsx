import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ week?: string }>;

/** `/day/week` is `/schedule/week-plan` now. See `../page.tsx`. */
export default async function WeekPlanRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { week } = await searchParams;
  redirect(
    week
      ? `/schedule/week-plan?week=${encodeURIComponent(week)}`
      : "/schedule/week-plan",
  );
}
