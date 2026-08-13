import { moduleEntryRedirect } from "@/components/shell/moduleEntry";

export const dynamic = "force-dynamic";

/**
 * The Finances entry point.
 *
 * Register is the only built page today, so no page bar renders — the floor is two, and one
 * tab spends a row saying "you are in the only place there is". Insights is declared as
 * `reserved` in the page registry; flipping it to `built` is what makes the bar appear.
 */
export default async function FinancesPage(): Promise<never> {
  return moduleEntryRedirect("finances");
}
