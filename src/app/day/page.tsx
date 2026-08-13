import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ date?: string }>;

/**
 * Day used to be its own module. It is two pages of Schedule now — the Task Chooser covers the
 * daily-pick job better, and folding an unfinished surface in beside Calendar and Agenda is
 * what lets it stay visible without reading as a broken top-level destination.
 *
 * This route stays behind as a redirect because `/day?date=` is in bookmarks and in the
 * `?date=` links Day's own pager wrote for months.
 */
export default async function DayRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { date } = await searchParams;
  redirect(date ? `/schedule/day?date=${encodeURIComponent(date)}` : "/schedule/day");
}
