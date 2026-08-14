import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { listJobs } from "@/lib/jobs/queries";
import { AppShell } from "@/components/shell/AppShell";
import { JobsView } from "@/components/jobs/JobsView";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const userId = await getCurrentUserId();
  const jobs = await listJobs(userId);

  return (
    <AppShell active="library">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <JobsView initialJobs={jobs} />
      </Suspense>
    </AppShell>
  );
}
