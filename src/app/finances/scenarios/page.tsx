import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { ScenariosView } from "@/components/finances/scenarios/ScenariosView";
import { listBudgetEnvelopeOptions } from "@/lib/finances/budget/queries";
import { loadScenarioWorkspace } from "@/lib/finances/scenarios/workspace";

export const dynamic = "force-dynamic";

/**
 * Will my income cover the month I am about to live?
 *
 * Budget answers "what should the money I have do?" and cannot answer this, because it only
 * deals in money that exists. A scenario is one steady-state month built from the live bills
 * and Regular income plus lines of its own; it never writes the budget
 * (`agent-os/specs/2026-10-04-1937-finance-scenarios/`).
 *
 * `?scenario=` picks which one opens; an id that is not the caller's falls back to their first.
 */
export default async function FinancesScenariosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const userId = await getCurrentUserId();
  const requested = (await searchParams).scenario;
  const [initial, catalog] = await Promise.all([
    loadScenarioWorkspace(userId, typeof requested === "string" ? requested : null),
    listBudgetEnvelopeOptions(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ScenariosView initial={initial} catalog={catalog} />
      </Suspense>
    </AppShell>
  );
}
