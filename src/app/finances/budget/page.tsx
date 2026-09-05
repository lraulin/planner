import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { BudgetSetup } from "@/components/finances/budget/BudgetSetup";
import { BudgetView } from "@/components/finances/budget/BudgetView";
import { monthKeyFromParam } from "@/lib/finances/budget/envelope";
import { loadBudget, loadBillAnchors } from "@/lib/finances/budget/queries";
import { loadInsightsRows } from "@/lib/finances/dashboardQueries";
import { paydaysFrom } from "@/lib/finances/analytics";
import { listPayees } from "@/lib/finances/payees/queries";

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
  const [data, payees, incomeRows] = await Promise.all([
    loadBudget(userId, monthKeyFromParam(month ?? null)),
    listPayees(userId),
    loadInsightsRows(userId),
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
            nextDueKeys={anchors.nextDueKeys}
            expectedKeys={anchors.expectedKeys}
            payees={payees.map(({ id, name, claim }) => ({
              id,
              name,
              budgetCategoryId: claim?.id ?? null,
            }))}
            paydays={paydaysFrom(incomeRows)}
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
