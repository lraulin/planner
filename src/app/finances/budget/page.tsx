import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { BudgetSetup } from "@/components/finances/budget/BudgetSetup";
import { BudgetView } from "@/components/finances/budget/BudgetView";
import { monthKeyFromParam } from "@/lib/finances/budget/envelope";
import { loadBudget, loadBillAnchors } from "@/lib/finances/budget/queries";
import {
  loadBillForecast,
  loadReviewCandidates,
} from "@/lib/finances/dashboardQueries";
import { listPayees } from "@/lib/finances/payees/queries";
import { localDateKey } from "@/lib/schedule/geometry";

export const dynamic = "force-dynamic";

/**
 * The envelope budget: assign the money you have, one month at a time.
 *
 * The only budgeting page (`agent-os/specs/2026-08-23-2313-one-budget/`) — Schedules and
 * Commitments collapsed into it, and bills are `kind: 'bill'` rows in the same grid as
 * every other envelope.
 */
export default async function FinancesBudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await getCurrentUserId();
  const { month } = await searchParams;
  const todayKey = localDateKey(new Date());
  const [data, review, payees, forecast] = await Promise.all([
    loadBudget(userId, monthKeyFromParam(month ?? null)),
    loadReviewCandidates(userId),
    listPayees(userId),
    loadBillForecast(userId, todayKey),
  ]);
  const anchors = data.configured
    ? await loadBillAnchors(userId, data.categories, data.todayKey)
    : {
        nextDueKeys: new Map<string, string>(),
        expectedKeys: new Map<string, string>(),
      };

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        {data.configured ? (
          <BudgetView
            data={data}
            review={review}
            nextDueKeys={anchors.nextDueKeys}
            expectedKeys={anchors.expectedKeys}
            payees={payees.map(({ id, name, claim }) => ({
              id,
              name,
              budgetCategoryId: claim?.id ?? null,
            }))}
            forecast={forecast}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <BudgetSetup
              todayKey={data.todayKey}
              positionCents={data.prospectiveOpeningCents}
            />
          </div>
        )}
      </Suspense>
    </AppShell>
  );
}
