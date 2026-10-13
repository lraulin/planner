import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { ProjectsGrid } from "@/components/tabs/ProjectsGrid";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <Suspense fallback={<div className="min-h-0 flex-1" />}>
      <ProjectsGrid initialNodes={nodes} />
    </Suspense>
  );
}
