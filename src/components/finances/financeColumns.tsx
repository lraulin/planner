"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { effectiveCategory, effectiveFlow } from "@/lib/finances/analytics";
import { flowLabel } from "@/lib/finances/flowLabels";
import { formatUsd } from "@/lib/finances/money";
import type { TransactionListRow } from "@/lib/finances/types";

export type FinanceColumnCtx = Record<string, never>;

export const FINANCE_COLUMN_IDS = [
  "date",
  "account",
  "description",
  "category",
  "flow",
  "sourceCategory",
  "amount",
  "posted",
  "balance",
  "oneOff",
  "event",
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
    // The **effective** category, so filtering and grouping reach the classifier's answer.
    // A column showing only the hand-typed value would be blank on 2,844 of 2,845 rows while
    // the dashboard reported categories for all of them, and the register is exactly where
    // you go to check whether the classifier got one right.
    filterKind: "enum",
    filterValue: (row) => effectiveCategory(row.node),
    sortValue: (row) => effectiveCategory(row.node).toLowerCase(),
    compact: "meta",
    render: (row) => (
      // Muted where the classifier supplied it, full ink where you did — the difference
      // matters, because only one of the two survives a reclassify by right.
      <Text value={effectiveCategory(row.node)} muted={!row.node.category?.trim()} />
    ),
  },
  {
    id: "flow",
    label: "Flow",
    width: "minmax(9rem,0.6fr)",
    filterKind: "enum",
    filterValue: (row) => flowLabel(effectiveFlow(row.node)),
    sortValue: (row) => flowLabel(effectiveFlow(row.node)),
    compact: "hidden",
    render: (row) => (
      <Text
        value={flowLabel(effectiveFlow(row.node))}
        muted={row.node.flowOverride === null}
      />
    ),
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
    // Not `strong` while pending: the figure is provisional, and rendering it with the same
    // weight as a settled amount invites it to be added up as though it were final.
    render: (row) => <Amount cents={row.node.amountCents} strong={!row.node.pending} />,
  },
  {
    id: "posted",
    label: "Posted",
    width: "7rem",
    filterKind: "date",
    // Pending rows filter and sort as "Pending" rather than as an empty cell, so the
    // register can be narrowed to them without a column of its own.
    filterValue: (row) => (row.node.pending ? "Pending" : row.node.postedDate),
    sortValue: (row) => (row.node.pending ? "\uffff" : row.node.postedDate),
    // Visible on a phone, unlike the posted date itself: on a small screen "has this landed
    // yet" is the question, and the exact posting day is not.
    compact: "meta",
    render: (row) =>
      row.node.pending ? (
        // This column is empty precisely *because* the row has not posted, so the caveat
        // belongs here rather than beside the date: the bank has authorised the charge but
        // not settled it, and the amount can still change or the row vanish.
        <span
          title="Authorised but not settled — the amount can still change."
          className="rounded border border-rule px-1 py-px text-[0.625rem] uppercase tracking-wide text-ink-faint"
        >
          Pending
        </span>
      ) : row.node.postedDate ? (
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
    id: "oneOff",
    label: "One-off",
    width: "5.5rem",
    // An enum rather than a boolean so the set-filter offers both sides by name: "show me
    // everything still in the baseline" is the more useful of the two questions.
    filterKind: "enum",
    filterValue: (row) => (row.node.excludeFromBaseline ? "One-off" : "Baseline"),
    sortValue: (row) => (row.node.excludeFromBaseline ? 1 : 0),
    compact: "hidden",
    render: (row) =>
      row.node.excludeFromBaseline ? <Text value="One-off" muted={false} /> : null,
  },
  {
    id: "event",
    label: "Event",
    width: "minmax(8rem,0.6fr)",
    filterKind: "enum",
    filterValue: (row) => row.node.eventLabel || null,
    sortValue: (row) => row.node.eventLabel.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.eventLabel} />,
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
