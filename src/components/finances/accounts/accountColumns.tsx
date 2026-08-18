"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { accountKindLabel, accountSourceLabel } from "@/lib/finances/accountKind";
import { formatUsd } from "@/lib/finances/money";
import type { FinanceAccountRow } from "@/lib/finances/types";
import { toDateKey } from "@/lib/schedule/geometry";

export type AccountColumnCtx = Record<string, never>;

export const ACCOUNT_COLUMN_IDS = [
  "name",
  "kind",
  "institution",
  "lastFour",
  "url",
  "closed",
  "balance",
  "transactions",
  "source",
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

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export const accountColumns: ColumnDef<AccountColumnCtx, FinanceAccountRow>[] = [
  {
    id: "name",
    label: "Account",
    width: "minmax(11rem,1.2fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name || null,
    sortValue: (row) => row.node.name.toLowerCase(),
    compact: "primary",
    render: (row) =>
      row.node.url ? (
        <a
          href={row.node.url}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate text-[0.8125rem] font-medium text-ink underline-offset-2 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.node.name}
        </a>
      ) : (
        <span className="truncate text-[0.8125rem] font-medium text-ink">
          {row.node.name}
        </span>
      ),
  },
  {
    id: "kind",
    label: "Kind",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) => accountKindLabel(row.node.kind),
    sortValue: (row) => accountKindLabel(row.node.kind),
    compact: "meta",
    render: (row) => <Text value={accountKindLabel(row.node.kind)} />,
  },
  {
    id: "institution",
    label: "Institution",
    width: "minmax(8rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => row.node.institution || null,
    sortValue: (row) => row.node.institution.toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.institution} />,
  },
  {
    id: "lastFour",
    label: "Last four",
    width: "6rem",
    filterKind: "text",
    filterValue: (row) => row.node.externalKey || null,
    sortValue: (row) => row.node.externalKey,
    compact: "meta",
    render: (row) => <Text value={row.node.externalKey} />,
  },
  {
    id: "url",
    label: "URL",
    width: "minmax(10rem,1fr)",
    filterKind: "text",
    filterValue: (row) => row.node.url || null,
    sortValue: (row) => row.node.url,
    render: (row) => <Text value={row.node.url} />,
  },
  {
    id: "closed",
    label: "Closed",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) =>
      row.node.closedAt ? toDateKey(asDate(row.node.closedAt)) : null,
    sortValue: (row) =>
      row.node.closedAt ? toDateKey(asDate(row.node.closedAt)) : null,
    compact: "meta",
    render: (row) => (
      <DateText
        dateKey={row.node.closedAt ? toDateKey(asDate(row.node.closedAt)) : null}
      />
    ),
  },
  {
    id: "balance",
    label: "Balance",
    width: "8rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.balanceCents),
    sortValue: (row) => row.node.balanceCents,
    compact: "meta",
    render: (row) => (
      <span
        className={`tabular text-[0.8125rem] ${
          row.node.balanceCents < 0 ? "text-priority-a" : "text-ink"
        }`}
      >
        {formatUsd(row.node.balanceCents)}
      </span>
    ),
  },
  {
    id: "transactions",
    label: "Transactions",
    width: "7rem",
    align: "right",
    filterValue: (row) => String(row.node.transactionCount),
    sortValue: (row) => row.node.transactionCount,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.transactionCount}
      </span>
    ),
  },
  {
    id: "source",
    label: "Source",
    width: "minmax(8rem,0.8fr)",
    filterKind: "enum",
    filterValue: (row) => accountSourceLabel(row.node.externalSource),
    sortValue: (row) => accountSourceLabel(row.node.externalSource),
    render: (row) => <Text value={accountSourceLabel(row.node.externalSource)} />,
  },
];
