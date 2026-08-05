import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { loadContactOptions } from "@/lib/contacts/queries";
import { AppShell } from "@/components/shell/AppShell";
import { TasksGrid } from "@/components/tabs/TasksGrid";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const userId = await getCurrentUserId();
  const [nodes, contacts] = await Promise.all([
    loadOutline(userId),
    loadContactOptions(userId),
  ]);

  return (
    <AppShell active="tasks">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <TasksGrid initialNodes={nodes} contactOptions={contacts} />
      </Suspense>
    </AppShell>
  );
}
