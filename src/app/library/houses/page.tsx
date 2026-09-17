import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listHouses } from "@/lib/houses/queries";
import { AppShell } from "@/components/shell/AppShell";
import { HousesView } from "@/components/houses/HousesView";

export const dynamic = "force-dynamic";

export default async function HousesPage() {
  const userId = await getCurrentUserId();
  const houses = await listHouses(userId);

  return (
    <AppShell active="library">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <HousesView initialHouses={houses} />
      </Suspense>
    </AppShell>
  );
}
