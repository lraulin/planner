import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadDashboard, loadUpcomingBills } from "@/lib/finances/dashboardQueries";
import { UPCOMING_HORIZON_DAYS } from "@/lib/finances/commitments";
import { loadBudget } from "@/lib/finances/budget/queries";
import { monthKeyOf, findMonth, categoryMonth } from "@/lib/finances/budget/envelope";
import { toDateKey } from "@/lib/schedule/geometry";
import { AppShell } from "@/components/shell/AppShell";
import { DashboardView } from "@/components/finances/dashboard/DashboardView";

export const dynamic = "force-dynamic";

/**
 * The Finances dashboard: where the money is right now, and what is left before payday.
 *
 * The one finance page that answers a forward-looking question. Register, Insights and
 * Statements all read the past; this one exists because the question that actually changes
 * behaviour on a Tuesday is "can I spend this", and until the bank feed landed there was no
 * data fresh enough to answer it honestly.
 *
 * **The spendable figure is Ready to Assign**, read straight from the envelope budget —
 * `agent-os/specs/2026-08-23-2313-one-budget/` D5 retired the separate Available to Spend
 * accrual. A bill's own envelope Balance says whether it is funded, which is a per-bill
 * answer instead of one collapsed number, so the panel below it lists underfunded bills
 * rather than a claims bar over one pile.
 *
 * One read, because every panel is a different slice of the same position. The day count is
 * deliberately **not** computed here: it depends on the reader's local day, and a server that
 * decides what "today" is makes the headline depend on the deploy region
 * (`agent-os/standards/development/dates.md`).
 */
export default async function FinancesDashboardPage() {
  const userId = await getCurrentUserId();
  const todayKey = toDateKey(new Date());
  const [data, budget, upcoming] = await Promise.all([
    loadDashboard(userId),
    loadBudget(userId, monthKeyOf(todayKey)),
    loadUpcomingBills(userId, todayKey, UPCOMING_HORIZON_DAYS),
  ]);

  const month = findMonth(budget.months, monthKeyOf(todayKey));
  const readyToAssignCents = month?.readyToAssignCents ?? 0;
  const underfundedBills = budget.categories
    .filter(
      (category) =>
        category.kind === "bill" &&
        category.bill?.status === "active" &&
        category.bill.expectedCents !== null,
    )
    .map((category) => {
      const cell = month ? categoryMonth(month, category.id) : null;
      return {
        name: category.name,
        balanceCents: cell?.balanceCents ?? 0,
        expectedCents: category.bill!.expectedCents!,
      };
    })
    .filter((row) => row.balanceCents < row.expectedCents);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <DashboardView
          accounts={data.accounts}
          pending={data.pending}
          bills={data.bills}
          paydays={data.paydays}
          billCharges={data.billCharges}
          connections={data.connections}
          readyToAssignCents={readyToAssignCents}
          budgetConfigured={budget.configured}
          underfundedBills={underfundedBills}
          upcoming={upcoming}
        />
      </Suspense>
    </AppShell>
  );
}
