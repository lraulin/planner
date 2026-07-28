import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { TabStrip } from "@/components/shell/TabStrip";
import { ProjectsGrid } from "@/components/tabs/ProjectsGrid";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active="projects" />
      <ProjectsGrid initialNodes={nodes} />
    </div>
  );
}
