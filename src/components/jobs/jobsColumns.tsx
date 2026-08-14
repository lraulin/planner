"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import type { JobGridRow } from "@/lib/jobs/types";

export type JobsColumnCtx = Record<string, never>;

export const JOBS_COLUMN_IDS = [
  "employer",
  "title",
  "start",
  "end",
  "duration",
  "type",
  "location",
  "supervisor",
  "reason",
] as const;

function Text({ value, muted = true }: { value: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

/** Jobs are read-only in the grid; twenty-five fields belong in the drawer. */
export const jobsColumns: ColumnDef<JobsColumnCtx, JobGridRow>[] = [
  {
    id: "employer",
    label: "Employer",
    width: "minmax(11rem,1fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.employer || null,
    sortValue: (row) => row.node.employer.toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span className="truncate text-[0.8125rem] font-medium text-ink">
        {row.node.employer}
      </span>
    ),
  },
  {
    id: "title",
    label: "Title",
    width: "minmax(10rem,0.9fr)",
    filterKind: "text",
    filterValue: (row) => row.node.jobTitle || null,
    sortValue: (row) => row.node.jobTitle.toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.jobTitle} />,
  },
  {
    id: "start",
    label: "Started",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.startDate,
    sortValue: (row) => row.node.startDate,
    compact: "meta",
    render: (row) => (
      <DateText
        dateKey={row.node.startDate ?? ""}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
  {
    id: "end",
    label: "Ended",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.endDate,
    sortValue: (row) => row.node.endDate,
    compact: "hidden",
    // A blank end date on a dated job is not missing data — it is the job you still hold, and
    // saying so beats an empty cell the reader has to interpret.
    render: (row) =>
      row.node.endDate ? (
        <DateText
          dateKey={row.node.endDate}
          className="tabular text-[0.8125rem] text-ink-muted"
        />
      ) : row.node.duration.ongoing ? (
        <span className="text-[0.8125rem] text-ink-faint">Current</span>
      ) : null,
  },
  {
    id: "duration",
    label: "Lasted",
    width: "7rem",
    align: "right",
    // Sorts on the day count the view derived, not on a date: a one-year job in 2000 and a
    // ten-year job in 2010 would come out the wrong way round ordered by start date.
    sortValue: (row) => row.node.duration.days,
    compact: "hidden",
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.duration.text ?? ""}
      </span>
    ),
  },
  {
    id: "type",
    label: "Type",
    width: "7.5rem",
    filterKind: "text",
    filterValue: (row) => row.node.employmentType || null,
    sortValue: (row) => row.node.employmentType.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.employmentType} />,
  },
  {
    id: "location",
    label: "Location",
    width: "minmax(9rem,0.9fr)",
    filterKind: "text",
    filterValue: (row) => row.node.location || null,
    sortValue: (row) => row.node.location.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.location} />,
  },
  {
    id: "supervisor",
    label: "Supervisor",
    width: "minmax(9rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => row.node.supervisorName || null,
    sortValue: (row) => row.node.supervisorName.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.supervisorName} />,
  },
  {
    id: "reason",
    label: "Reason for leaving",
    width: "minmax(10rem,1fr)",
    filterKind: "text",
    filterValue: (row) => row.node.reasonForLeaving || null,
    sortValue: (row) => row.node.reasonForLeaving.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.reasonForLeaving} />,
  },
];
