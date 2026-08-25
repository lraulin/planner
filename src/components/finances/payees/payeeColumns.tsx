"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { formatUsd } from "@/lib/finances/money";
import { autoCategorySummary } from "@/lib/finances/payees/autoCategory";
import type { PayeeRow } from "@/lib/finances/payees/queries";

export type PayeeColumnCtx = {
  compact: boolean;
  pending: boolean;
  onRename: (payeeId: string, name: string) => void;
};

export const PAYEE_COLUMN_IDS = [
  "name",
  "aliases",
  "transactions",
  "total",
  "autoCategory",
  "envelope",
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

/** Every spelling this payee answers to, so a wrong grouping is visible without opening it. */
function aliasSummary(row: PayeeRow): string {
  return row.aliases.join(", ");
}

export const payeeColumns: ColumnDef<PayeeColumnCtx, PayeeRow>[] = [
  {
    id: "name",
    label: "Payee",
    width: "minmax(11rem,1.2fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name || null,
    sortValue: (row) => row.node.name.toLowerCase(),
    compact: "primary",
    render: (row, ctx) =>
      ctx.compact ? (
        <Text value={row.node.name} muted={false} />
      ) : (
        <input
          key={row.node.name}
          type="text"
          defaultValue={row.node.name}
          disabled={ctx.pending}
          aria-label={`Payee name for ${row.node.name}`}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next !== "" && next !== row.node.name) ctx.onRename(row.node.id, next);
          }}
          className="w-full truncate rounded border border-transparent bg-transparent px-1 text-[0.8125rem] font-medium text-ink hover:border-rule focus:border-rule"
        />
      ),
  },
  {
    id: "aliases",
    label: "Answers to",
    width: "minmax(12rem,1.6fr)",
    filterKind: "text",
    filterValue: (row) => aliasSummary(row.node) || null,
    sortValue: (row) => String(row.node.aliases.length).padStart(4, "0"),
    compact: "meta",
    render: (row) => {
      const summary = aliasSummary(row.node);
      // A payee with no alias claims nothing and will never be resolved onto a row. Saying so
      // here beats leaving a blank cell that reads as "no data".
      if (summary === "") return <Text value="no spellings claimed" />;
      return <Text value={summary} />;
    },
  },
  {
    id: "transactions",
    label: "Charges",
    width: "6rem",
    align: "right",
    sortValue: (row) => row.node.transactionCount,
    compact: "meta",
    render: (row) => (
      <span className="text-[0.8125rem] tabular-nums text-ink-muted">
        {row.node.transactionCount}
      </span>
    ),
  },
  {
    id: "total",
    label: "Total",
    width: "7rem",
    align: "right",
    sortValue: (row) => row.node.totalCents,
    compact: "meta",
    render: (row) => (
      <span className="text-[0.8125rem] tabular-nums text-ink">
        {formatUsd(row.node.totalCents)}
      </span>
    ),
  },
  {
    id: "autoCategory",
    label: "Auto Category",
    width: "minmax(9rem,0.9fr)",
    filterKind: "enum",
    filterValue: (row) => autoCategorySummary(row.node),
    sortValue: (row) => autoCategorySummary(row.node).toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={autoCategorySummary(row.node)} />,
  },
  {
    id: "envelope",
    label: "Envelope",
    width: "minmax(8rem,0.8fr)",
    filterKind: "enum",
    filterValue: (row) => row.node.claim?.name ?? null,
    sortValue: (row) => (row.node.claim?.name ?? "").toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.claim?.name ?? ""} />,
  },
];
