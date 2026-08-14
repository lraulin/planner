import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listResidences } from "@/lib/residences/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ResidencesView } from "@/components/residences/ResidencesView";

export const dynamic = "force-dynamic";

export default async function ResidencesPage() {
  const userId = await getCurrentUserId();
  const residences = await listResidences(userId);

  return (
    <AppShell active="library">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ResidencesView initialResidences={residences} />
      </Suspense>
    </AppShell>
  );
}
