import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { AppShell } from "@/components/shell/AppShell";
import { SuppliesView } from "@/components/finances/supplies/SuppliesView";
import { listBudgetEnvelopeOptions } from "@/lib/finances/budget/queries";
import { listSupplyItems } from "@/lib/finances/supplies/queries";

export const dynamic = "force-dynamic";

/**
 * What do the things I rebuy actually cost me a year, and am I buying them in the right
 * place?
 *
 * The register answers neither: it knows a $38.97 charge at Walmart, not that it was 42 cans
 * of cat food lasting ten and a half days. This page holds the consumption rate the receipt
 * never carries, and prices offers against each other without any of them counting twice.
 *
 * Read-only where it touches the budget (`agent-os/specs/2026-08-26-0910-supplies-worksheet/`).
 */
export default async function FinancesSuppliesPage() {
  const userId = await getCurrentUserId();
  const [items, catalog] = await Promise.all([
    listSupplyItems(userId),
    listBudgetEnvelopeOptions(userId),
  ]);

  return (
    <AppShell active="finances">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <SuppliesView initialItems={items} catalog={catalog} />
      </Suspense>
    </AppShell>
  );
}
