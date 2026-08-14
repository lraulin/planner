"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { formatUsd } from "@/lib/finances/money";
import type { StatementViewRow } from "@/lib/finances/types";

export type StatementColumnCtx = Record<string, never>;

export const STATEMENT_COLUMN_IDS = [
  "account",
  "periodEnd",
  "periodStart",
  "opening",
  "closing",
  "register",
  "delta",
  "rows",
  "payments",
  "purchases",
  "interest",
  "fees",
  "due",
] as const;

function Text({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

function Amount({ cents, warn = false }: { cents: number | null; warn?: boolean }) {
  if (cents === null) return <span className="text-[0.8125rem] text-ink-muted">—</span>;
  return (
    <span
      className={`tabular text-[0.8125rem] ${
        warn ? "text-priority-a" : cents < 0 ? "text-priority-a" : "text-ink"
      }`}
    >
      {formatUsd(cents)}
    </span>
  );
}

export const statementColumns: ColumnDef<StatementColumnCtx, StatementViewRow>[] = [
  {
    id: "account",
    label: "Account",
    width: "11rem",
    hideable: false,
    filterKind: "enum",
    filterValue: (row) => row.node.accountName,
    sortValue: (row) => row.node.accountName,
    compact: "primary",
    render: (row) => <Text value={row.node.accountName} />,
  },
  {
    id: "periodEnd",
    label: "Closes",
    width: "7rem",
    hideable: false,
    filterKind: "date",
    filterValue: (row) => row.node.periodEnd,
    sortValue: (row) => row.node.periodEnd,
    compact: "meta",
    render: (row) => <DateText dateKey={row.node.periodEnd} />,
  },
  {
    id: "periodStart",
    label: "Opens",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.periodStart,
    sortValue: (row) => row.node.periodStart,
    render: (row) => <DateText dateKey={row.node.periodStart} />,
  },
  {
    id: "opening",
    label: "Opening",
    width: "7rem",
    sortValue: (row) => row.node.openingBalanceCents,
    render: (row) => <Amount cents={row.node.openingBalanceCents} />,
  },
  {
    id: "closing",
    label: "Closing",
    width: "7rem",
    sortValue: (row) => row.node.closingBalanceCents,
    render: (row) => <Amount cents={row.node.closingBalanceCents} />,
  },
  {
    id: "register",
    label: "Register",
    width: "7rem",
    sortValue: (row) => row.node.registerSumCents,
    render: (row) => <Amount cents={row.node.registerSumCents} />,
  },
  {
    id: "delta",
    label: "Delta",
    width: "6rem",
    sortValue: (row) => row.node.registerDeltaCents,
    render: (row) => (
      <Amount
        cents={row.node.registerDeltaCents}
        warn={row.node.registerDeltaCents !== 0}
      />
    ),
  },
  {
    id: "rows",
    label: "Rows",
    width: "4.5rem",
    sortValue: (row) => row.node.rowCount,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.rowCount}
      </span>
    ),
  },
  {
    id: "payments",
    label: "Payments",
    width: "7rem",
    sortValue: (row) => row.node.paymentsCreditsCents ?? 0,
    render: (row) => <Amount cents={row.node.paymentsCreditsCents} />,
  },
  {
    id: "purchases",
    label: "Purchases",
    width: "7rem",
    sortValue: (row) => row.node.purchasesCents ?? 0,
    render: (row) => <Amount cents={row.node.purchasesCents} />,
  },
  {
    id: "interest",
    label: "Interest",
    width: "6rem",
    sortValue: (row) => row.node.interestChargedCents ?? 0,
    render: (row) => <Amount cents={row.node.interestChargedCents} />,
  },
  {
    id: "fees",
    label: "Fees",
    width: "6rem",
    sortValue: (row) => row.node.feesChargedCents ?? 0,
    render: (row) => <Amount cents={row.node.feesChargedCents} />,
  },
  {
    id: "due",
    label: "Due",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.paymentDueDate ?? "",
    sortValue: (row) => row.node.paymentDueDate ?? "",
    render: (row) =>
      row.node.paymentDueDate ? (
        <DateText dateKey={row.node.paymentDueDate} />
      ) : (
        <Text value="" muted />
      ),
  },
];
