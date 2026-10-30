"use client";

import type { JobListRow } from "@/lib/jobs/types";
import {
  createJobAction,
  deleteJobAction,
  listJobsAction,
} from "@/app/(shell)/library/jobs/actions";
import { CatalogGrid } from "@/components/grid/CatalogGrid";
import { useCatalogGrid } from "@/components/grid/useCatalogGrid";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useToday } from "@/components/grid/useToday";
import { spanDuration } from "@/lib/history/span";
import { JobDrawer } from "./JobDrawer";
import { JOBS_COLUMN_IDS, jobsColumns } from "./jobsColumns";

const JOB_VIEWS = [{ id: "all", label: "All Jobs" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...JOBS_COLUMN_IDS],
    sorts: [{ columnId: "start", direction: "desc" }],
  };
}

function nameOf(row: JobListRow): string {
  return row.employer || "Untitled job";
}

/** Employment history — a catalog you maintain, whose dates feed the Timeline chronology. */
export function JobsView({ initialJobs }: { initialJobs: JobListRow[] }) {
  const todayKey = useToday();
  const catalog = useCatalogGrid({
    moduleId: "jobs",
    builtIn: JOB_VIEWS,
    defaultsFor: viewDefaults,
    columns: jobsColumns,
    initialRows: initialJobs,
    // Duration is derived here rather than in the query: an ongoing job is measured against
    // today, and only the client knows what day that is. `useToday()` is null on the server.
    toNode: (row) => ({
      ...row,
      duration: spanDuration({ start: row.startDate, end: row.endDate }, todayKey),
    }),
    nameOf,
    noun: { one: "job", many: "jobs" },
    actions: { list: listJobsAction, create: createJobAction, remove: deleteJobAction },
  });

  return (
    <CatalogGrid
      catalog={catalog}
      emptyHint="Every job you add with dates shows up on the Timeline."
      deleteMessage={(subject, count) =>
        `${subject} will be removed, along with ${count === 1 ? "its" : "their"} dates on the Timeline.`
      }
      drawer={
        <JobDrawer
          jobId={catalog.openId}
          onClose={catalog.closeDrawer}
          onChanged={catalog.refresh}
        />
      }
    />
  );
}
