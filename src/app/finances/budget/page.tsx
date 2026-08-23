import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { BudgetSetup } from "@/components/finances/budget/BudgetSetup";
import { BudgetView } from "@/components/finances/budget/BudgetView";
import { monthKeyFromParam } from "@/lib/finances/budget/envelope";
import { loadBudget } from "@/lib/finances/budget/queries";

export const dynamic = "force-dynamic";

/**
 * The envelope budget: assign the money you have, one month at a time.
 *
 * Runs **beside** Available to Spend rather than replacing it. That headline is correct and
 * has stopped being useful — it collapses "four annual bills are each underfunded" and "you
 * are short this week" into one number, and only one of those has a move attached to it.
 * Which of the two survives is a decision to be made from use
 * (`agent-os/specs/2026-08-22-1948-zero-based-budget/`).
 */
export default async function FinancesBudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await getCurrentUserId();
  const { month } = await searchParams;
  const data = await loadBudget(userId, monthKeyFromParam(month ?? null));

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        {data.configured ? (
          <BudgetView data={data} />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <BudgetSetup
              todayKey={data.todayKey}
              positionCents={data.onBudgetPositionCents}
            />
          </div>
        )}
      </Suspense>
    </AppShell>
  );
}
