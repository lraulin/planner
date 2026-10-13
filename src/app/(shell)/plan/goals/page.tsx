import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { GoalsGrid } from "@/components/tabs/GoalsGrid";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <GoalsGrid initialNodes={nodes} />
    </Suspense>
  );
}
