"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { formatUsd } from "@/lib/finances/money";
import type { ScheduleListRow } from "@/lib/finances/schedules/queries";
import type { ScheduleStatus } from "@/lib/finances/schedules/status";

export type ScheduleColumnCtx = Record<string, never>;

export const SCHEDULE_COLUMN_IDS = [
  "name",
  "payee",
  "account",
  "amount",
  "nextDate",
  "status",
  "source",
] as const;

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  completed: "Completed",
  paid: "Paid",
  due: "Due",
  upcoming: "Upcoming",
  missed: "Missed",
  scheduled: "Scheduled",
};

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

function StatusChip({ status }: { status: ScheduleStatus }) {
  const tone =
    status === "missed"
      ? "text-priority-a"
      : status === "due"
        ? "text-priority-b"
        : status === "paid" || status === "completed"
          ? "text-ink-muted"
          : "text-ink";
  return <span className={`text-[0.8125rem] ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function sourceLabel(row: ScheduleListRow): string {
  if (!row.sourceBillName) return "";
  if (!row.drift) return row.sourceBillName;
  const drifted = [
    row.drift.cadence && "cadence",
    row.drift.amount && "amount",
    row.drift.nextDue && "next due",
  ]
    .filter(Boolean)
    .join(", ");
  return drifted ? `${row.sourceBillName} (drift: ${drifted})` : row.sourceBillName;
}

export const scheduleColumns: ColumnDef<ScheduleColumnCtx, ScheduleListRow>[] = [
  {
    id: "name",
    label: "Schedule",
    width: "minmax(11rem,1.2fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name || null,
    sortValue: (row) => row.node.name.toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span className="truncate text-[0.8125rem] font-medium text-ink">
        {row.node.name}
      </span>
    ),
  },
  {
    id: "payee",
    label: "Payee",
    width: "minmax(8rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => row.node.payeeLabel || null,
    sortValue: (row) => row.node.payeeLabel.toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.payeeLabel} />,
  },
  {
    id: "account",
    label: "Account",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) => row.node.accountName,
    sortValue: (row) => (row.node.accountName ?? "").toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.accountName ?? ""} />,
  },
  {
    id: "amount",
    label: "Amount",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => formatUsd(row.node.amountCents),
    sortValue: (row) => row.node.amountCents,
    compact: "meta",
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.amountCents)}
      </span>
    ),
  },
  {
    id: "nextDate",
    label: "Next date",
    width: "8rem",
    filterKind: "date",
    filterValue: (row) => row.node.nextDate,
    sortValue: (row) => row.node.nextDate,
    compact: "meta",
    render: (row) => <DateText dateKey={row.node.nextDate} />,
  },
  {
    id: "status",
    label: "Status",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => STATUS_LABEL[row.node.status],
    sortValue: (row) => row.node.status,
    compact: "meta",
    render: (row) => <StatusChip status={row.node.status} />,
  },
  {
    id: "source",
    label: "Source bill",
    width: "minmax(8rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => sourceLabel(row.node) || null,
    sortValue: (row) => sourceLabel(row.node).toLowerCase(),
    compact: "meta",
    render: (row) => {
      const label = sourceLabel(row.node);
      const drifted = Boolean(
        row.node.drift &&
        (row.node.drift.cadence || row.node.drift.amount || row.node.drift.nextDue),
      );
      return <Text value={label} muted={!drifted} />;
    },
  },
];
