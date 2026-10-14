import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadOutline } from "@/lib/tree/queries";
import { packOutline } from "@/lib/tree/wire";
import { loadContactOptions } from "@/lib/contacts/queries";
import { TasksGrid } from "@/components/tabs/TasksGrid";
import { PageStamp } from "@/components/shell/PageStamp";

export const dynamic = "force-dynamic";
/**
 * The browser may show this payload again for 60 s. Must agree with `cachePolicy.ts`, which
 * says why this page qualifies; a test fails if the two drift.
 */
export const unstable_dynamicStaleTime = 60;

export default async function TasksPage() {
  const userId = await getCurrentUserId();
  const [nodes, contacts] = await Promise.all([
    loadOutline(userId),
    loadContactOptions(userId),
  ]);

  return (
    <>
      <PageStamp />
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <TasksGrid wire={packOutline(nodes)} contactOptions={contacts} />
      </Suspense>
    </>
  );
}
