"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { formatUsd } from "@/lib/finances/money";
import type { TransactionListRow } from "@/lib/finances/types";

export type FinanceColumnCtx = Record<string, never>;

export const FINANCE_COLUMN_IDS = [
  "date",
  "account",
  "description",
  "category",
  "sourceCategory",
  "amount",
  "posted",
  "balance",
  "notes",
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

/**
 * Money, right-aligned and tabular so the decimal points line up down the column, with
 * money-out tinted. A register is read by scanning the amount column, and that only works
 * if the digits are in the same place on every row.
 */
function Amount({ cents, strong = false }: { cents: number | null; strong?: boolean }) {
  if (cents === null) return null;
  const negative = cents < 0;
  return (
    <span
      className={`tabular text-[0.8125rem] ${
        negative
          ? "text-priority-a"
          : strong
            ? "font-medium text-ink"
            : "text-ink-muted"
      }`}
    >
      {formatUsd(cents)}
    </span>
  );
}

/**
 * The register's columns.
 *
 * Both categories are here on purpose. `category` is yours and editable; `sourceCategory`
 * is what the bank said and is never written by anything but an import — keeping them as
 * separate columns is what lets a re-import leave your work alone, and it means you can
 * filter on either.
 *
 * Nothing here edits the date, description or amount. Those are the bank's record, and the
 * dedup fingerprint is derived from them.
 */
export const financeColumns: ColumnDef<FinanceColumnCtx, TransactionListRow>[] = [
  {
    id: "date",
    label: "Date",
    width: "7rem",
    hideable: false,
    filterKind: "date",
    filterValue: (row) => row.node.transactionDate,
    sortValue: (row) => row.node.transactionDate,
    compact: "meta",
    render: (row) => (
      <DateText
        dateKey={row.node.transactionDate}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
  {
    id: "account",
    label: "Account",
    width: "minmax(9rem,0.7fr)",
    filterKind: "enum",
    filterValue: (row) => row.node.accountName,
    sortValue: (row) => row.node.accountName.toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.accountName} />,
  },
  {
    id: "description",
    label: "Description",
    width: "minmax(14rem,1.6fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.description || null,
    sortValue: (row) => row.node.description.toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span
        className="truncate text-[0.8125rem] font-medium text-ink"
        title={row.node.description}
      >
        {row.node.description}
      </span>
    ),
  },
  {
    id: "category",
    label: "Category",
    width: "minmax(8rem,0.7fr)",
    filterKind: "enum",
    filterValue: (row) => row.node.category,
    sortValue: (row) => row.node.category?.toLowerCase() ?? null,
    compact: "meta",
    render: (row) => <Text value={row.node.category ?? ""} />,
  },
  {
    id: "sourceCategory",
    label: "Bank category",
    width: "minmax(8rem,0.6fr)",
    filterKind: "enum",
    filterValue: (row) => row.node.sourceCategory || null,
    sortValue: (row) => row.node.sourceCategory.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.sourceCategory} />,
  },
  {
    id: "amount",
    label: "Amount",
    width: "7.5rem",
    align: "right",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => formatUsd(row.node.amountCents),
    sortValue: (row) => row.node.amountCents,
    compact: "meta",
    render: (row) => <Amount cents={row.node.amountCents} strong />,
  },
  {
    id: "posted",
    label: "Posted",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.postedDate,
    sortValue: (row) => row.node.postedDate,
    compact: "hidden",
    render: (row) =>
      row.node.postedDate ? (
        <DateText
          dateKey={row.node.postedDate}
          className="tabular text-[0.8125rem] text-ink-muted"
        />
      ) : null,
  },
  {
    id: "balance",
    label: "Balance",
    width: "7.5rem",
    align: "right",
    // Only the bank feeds report this, so it is blank on every card row.
    filterKind: "text",
    filterValue: (row) =>
      row.node.balanceAfterCents === null
        ? null
        : formatUsd(row.node.balanceAfterCents),
    sortValue: (row) => row.node.balanceAfterCents,
    compact: "hidden",
    render: (row) => <Amount cents={row.node.balanceAfterCents} />,
  },
  {
    id: "notes",
    label: "Notes",
    width: "minmax(10rem,1fr)",
    filterKind: "text",
    filterValue: (row) => row.node.notes || null,
    sortValue: (row) => row.node.notes.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.notes} />,
  },
];
