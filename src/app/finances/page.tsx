import { moduleEntryRedirect } from "@/components/shell/moduleEntry";

export const dynamic = "force-dynamic";

/**
 * The Finances entry point.
 *
 * Five built pages now, so the bar renders. This redirects to the **remembered** page and only
 * falls back to the registry default, which is Dashboard — so a session that last sat on the
 * Register keeps landing there until Dashboard is visited once. That is the persisted-UI-state
 * contract rather than a bug, and it is written down here because it looks exactly like one.
 */
export default async function FinancesPage(): Promise<never> {
  return moduleEntryRedirect("finances");
}
