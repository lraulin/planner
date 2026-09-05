"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { accountKindLabel } from "@/lib/finances/accountKind";
import { formatUsd } from "@/lib/finances/money";
import type { OperationalAccount } from "@/lib/finances/accountOperations";
import Link from "next/link";
import { UrlLink } from "@/components/url/UrlLink";
import { toDateKey } from "@/lib/schedule/geometry";

import { type PendingRow } from "@/lib/finances/workingBalance";
export type AccountColumnCtx = {
  pending: readonly PendingRow[];
  staleIds: ReadonlySet<string>;
  onSnapshot: () => void;
};

export const ACCOUNT_COLUMN_IDS = [
  "name",
  "balance",
  "posted",
  "pending",
  "asOf",
  "freshness",
  "source",
  "budget",
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
 * The account name, linked to the bank site when one is stored. The link is the fast way
 * into online banking from the row you are already looking at.
 */
function NameCell({ name, url }: { name: string; url: string }) {
  return (
    <UrlLink value={url} className="text-[0.8125rem] font-medium text-ink">
      {name}
    </UrlLink>
  );
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export const accountColumns: ColumnDef<AccountColumnCtx, OperationalAccount>[] = [
  {
    id: "name",
    label: "Account",
    width: "18rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name || null,
    sortValue: (row) => row.node.name.toLowerCase(),
    compact: "primary",
    render: (row) => <NameCell name={row.node.name} url={row.node.url} />,
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
    width: "13rem",
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
    width: "16rem",
    filterKind: "text",
    filterValue: (row) => row.node.url || null,
    sortValue: (row) => row.node.url,
    render: (row) => (
      <UrlLink value={row.node.url} className="text-[0.8125rem] text-ink-muted" />
    ),
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
    id: "budget",
    label: "Budget",
    width: "7rem",
    // Says which side of the budget an account is on, because "why is savings not in Ready
    // to Assign" is otherwise a question with no visible answer.
    filterKind: "enum",
    filterValue: (row) => (row.node.offBudget ? "Off budget" : "On budget"),
    sortValue: (row) => (row.node.offBudget ? 1 : 0),
    compact: "meta",
    render: (row) => <Text value={row.node.offBudget ? "Off budget" : "On budget"} />,
  },
  {
    id: "balance",
    label: "Working balance",
    compactText: (row) => `Working ${formatUsd(row.node.workingCents)}`,
    width: "8rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) => formatUsd(row.node.workingCents),
    sortValue: (row) => row.node.workingCents,
    compact: "meta",
    render: (row) => (
      <span
        className={`tabular text-[0.8125rem] ${
          row.node.workingCents < 0 ? "text-priority-a" : "text-ink"
        }`}
      >
        {formatUsd(row.node.workingCents)}
      </span>
    ),
  },
  ...(["posted", "pending"] as const).map(
    (id): ColumnDef<AccountColumnCtx, OperationalAccount> => ({
      id,
      label: id === "posted" ? "Posted / headline" : "Pending added",
      width: "9rem",
      align: "right",
      compact: "hidden",
      filterKind: "number",
      filterValue: (row) =>
        formatUsd(row.node[id === "posted" ? "postedCents" : "pendingCents"]),
      sortValue: (row) => row.node[id === "posted" ? "postedCents" : "pendingCents"],
      render: (row) => (
        <span className="tabular text-xs text-ink-muted">
          {formatUsd(row.node[id === "posted" ? "postedCents" : "pendingCents"])}
        </span>
      ),
    }),
  ),
  {
    id: "asOf",
    label: "Balance as of",
    compactText: (row) => row.node.balanceSourceLabel,
    width: "12rem",
    compact: "meta",
    sortValue: (row) =>
      row.node.syncedBalanceAsOf?.toISOString() ?? row.node.statementPeriodEnd,
    render: (row) => (
      <Text
        value={
          row.node.syncedBalanceAsOf
            ? new Date(row.node.syncedBalanceAsOf).toLocaleString()
            : row.node.statementPeriodEnd
              ? `Statement ${row.node.statementPeriodEnd}`
              : "Imported history"
        }
      />
    ),
  },
  {
    id: "freshness",
    label: "Freshness",
    compactText: (row) => row.node.freshness,
    width: "13rem",
    compact: "meta",
    filterKind: "enum",
    filterValue: (row) => row.node.freshness,
    sortValue: (row) => row.node.freshness,
    render: (row, ctx) =>
      row.node.needsConnection ? (
        <Link href="/settings" className="text-xs text-priority-a underline">
          Reconnect bank
        </Link>
      ) : ctx.staleIds.has(row.id) ? (
        <button
          type="button"
          onClick={ctx.onSnapshot}
          className="text-xs text-priority-a underline"
        >
          Paste fresh snapshot
        </button>
      ) : (
        <Text value={row.node.freshness} />
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
    width: "13rem",
    filterKind: "enum",
    filterValue: (row) => row.node.balanceSourceLabel,
    sortValue: (row) => row.node.balanceSourceLabel,
    render: (row) => <Text value={row.node.balanceSourceLabel} />,
  },
];
