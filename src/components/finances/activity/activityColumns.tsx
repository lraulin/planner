"use client";

import type { ColumnDef } from "@/components/grid/columns";
import type { FinanceAuditEventSummary } from "@/lib/finances/audit/types";
import { financeAuditActionLabel } from "@/lib/finances/audit/labels";
import { formatUsd } from "@/lib/finances/money";

export { financeAuditActionLabel };

export type ActivityColumnCtx = Record<string, never>;

export const ACTIVITY_COLUMN_IDS = [
  "time",
  "action",
  "origin",
  "account",
  "budgetMonth",
  "impact",
] as const;

function accountLabel(row: FinanceAuditEventSummary): string {
  return row.scope.accountNames?.join(", ") ?? "";
}

function budgetMonthLabel(row: FinanceAuditEventSummary): string {
  return row.scope.budgetMonths?.map((month) => month.slice(0, 7)).join(", ") ?? "";
}

function timeLabel(value: Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Text({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={children || undefined}
    >
      {children || "—"}
    </span>
  );
}

export const activityColumns: ColumnDef<ActivityColumnCtx, FinanceAuditEventSummary>[] =
  [
    {
      id: "time",
      label: "Time",
      width: "11rem",
      hideable: false,
      filterKind: "date",
      filterValue: (row) => new Date(row.node.occurredAt).toISOString().slice(0, 10),
      sortValue: (row) => new Date(row.node.occurredAt).getTime(),
      compact: "meta",
      compactText: (row) => timeLabel(row.node.occurredAt),
      render: (row) => <Text>{timeLabel(row.node.occurredAt)}</Text>,
    },
    {
      id: "action",
      label: "Action",
      width: "minmax(12rem,1fr)",
      hideable: false,
      filterKind: "enum",
      filterValue: (row) => financeAuditActionLabel(row.node.kind),
      sortValue: (row) => financeAuditActionLabel(row.node.kind),
      compact: "primary",
      render: (row) => <Text>{financeAuditActionLabel(row.node.kind)}</Text>,
    },
    {
      id: "origin",
      label: "Origin",
      width: "10rem",
      filterKind: "enum",
      filterValue: (row) => row.node.origin,
      sortValue: (row) => row.node.origin,
      compact: "meta",
      render: (row) => <Text muted>{row.node.origin}</Text>,
    },
    {
      id: "account",
      label: "Account",
      width: "11rem",
      filterKind: "enum",
      filterValue: (row) => accountLabel(row.node),
      sortValue: (row) => accountLabel(row.node),
      render: (row) => <Text muted>{accountLabel(row.node)}</Text>,
    },
    {
      id: "budgetMonth",
      label: "Budget month",
      width: "8rem",
      filterKind: "enum",
      filterValue: (row) => budgetMonthLabel(row.node),
      sortValue: (row) => budgetMonthLabel(row.node),
      render: (row) => <Text muted>{budgetMonthLabel(row.node)}</Text>,
    },
    {
      id: "impact",
      label: "Headline impact",
      width: "9rem",
      align: "right",
      filterKind: "number",
      filterValue: (row) => String(row.node.headlineImpactCents ?? 0),
      sortValue: (row) => row.node.headlineImpactCents ?? 0,
      render: (row) => (
        <span
          className={`tabular text-[0.8125rem] ${
            row.node.headlineImpactCents === null || row.node.headlineImpactCents === 0
              ? "text-ink-muted"
              : "text-ink"
          }`}
        >
          {row.node.headlineImpactCents === null
            ? "—"
            : formatUsd(row.node.headlineImpactCents)}
        </span>
      ),
    },
  ];
