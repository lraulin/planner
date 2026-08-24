"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { effectiveFlow, effectiveMerchant } from "@/lib/finances/analytics";
import { flowLabel } from "@/lib/finances/flowLabels";
import { formatUsd } from "@/lib/finances/money";
import type { TransactionListRow } from "@/lib/finances/types";
import { envelopeAssignmentRefusal } from "@/lib/finances/budget/autoMap";
import type { EnvelopePickerOption } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";
import { CategorySelect } from "./CategorySelect";

/**
 * What the Envelope column needs. Every other column is pure presentation, which is why this
 * was `Record<string, never>` until the budget arrived.
 */
export type FinanceColumnCtx = {
  /** Every envelope, in budget order. Empty until a budget is set up. */
  envelopes: readonly EnvelopePickerOption[];
  budgetStartMonth: string | null;
  offBudgetAccountIds: ReadonlySet<string>;
  onSetEnvelope: (transactionId: string, categoryId: string | null) => void;
  onCreateEnvelope: (transactionId: string, kind: EnvelopeKind) => void;
  tagColors: Readonly<Record<string, string | null>>;
};

export const FINANCE_COLUMN_IDS = [
  "date",
  "account",
  "description",
  "category",
  "tags",
  "flow",
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
    id: "payee",
    label: "Payee",
    width: "minmax(8rem,0.8fr)",
    // The merchant behind the bank's line — one identity across every spelling of it, which is
    // what the description column cannot give you: `WM SUPERCENTER #1981` and `WAL-MART #2201`
    // are the same shop and sort nowhere near each other.
    //
    // Falls back to the recomputed name while a freshly imported row has no payee yet, exactly
    // as `effectiveMerchant` does, so this column is never blank on a row that has a merchant.
    filterKind: "enum",
    filterValue: (row) => effectiveMerchant(row.node) || null,
    sortValue: (row) => effectiveMerchant(row.node).toLowerCase(),
    compact: "meta",
    render: (row) => (
      <Text value={effectiveMerchant(row.node)} muted={row.node.payeeId === null} />
    ),
  },
  {
    id: "category",
    label: "Category",
    width: "minmax(8rem,0.6fr)",
    filterKind: "enum",
    // "Unassigned" rather than blank, so the backlog is a value you can filter *to*. It is
    // the set the Budget page counts, and finding it is the whole workflow.
    filterValue: (row) => row.node.budgetCategoryName ?? "Uncategorized",
    sortValue: (row) => (row.node.budgetCategoryName ?? "").toLowerCase(),
    compact: "meta",
    compactTextWithCtx: (row, ctx) =>
      envelopeAssignmentRefusal({
        transactionDate: row.node.transactionDate,
        budgetStartMonth: ctx.budgetStartMonth,
        accountOffBudget: ctx.offBudgetAccountIds.has(row.node.accountId),
      })
        ? "Not budgeted"
        : (row.node.budgetCategoryName ?? "Categorize"),
    // Editable in place rather than behind a row-menu command: the envelope for a row is a
    // one-keystroke decision made while reading the description next to it, and a menu of
    // twenty envelopes is not a menu (`components/ux-principles`).
    render: (row, ctx) => {
      const refusal = envelopeAssignmentRefusal({
        transactionDate: row.node.transactionDate,
        budgetStartMonth: ctx.budgetStartMonth,
        accountOffBudget: ctx.offBudgetAccountIds.has(row.node.accountId),
      });
      if (refusal) {
        return (
          <span className="truncate text-[0.8125rem] text-ink-faint" title={refusal}>
            Not budgeted
          </span>
        );
      }
      return (
        <CategorySelect
          envelopes={ctx.envelopes}
          value={row.node.budgetCategoryId}
          ariaLabel={`Category for ${row.node.description}`}
          onChange={(categoryId) => ctx.onSetEnvelope(row.node.id, categoryId)}
          onCreate={(kind) => ctx.onCreateEnvelope(row.node.id, kind)}
          className={`w-full min-w-0 truncate rounded border border-transparent bg-transparent px-1 text-base hover:border-rule md:text-[0.8125rem] ${
            row.node.budgetCategoryId ? "text-ink" : "text-ink-faint"
          }`}
        />
      );
    },
  },
  {
    id: "tags",
    label: "Tags",
    width: "minmax(10rem,0.8fr)",
    filterKind: "tags",
    filterValues: (row) => row.node.tags ?? [],
    sortValue: (row) => (row.node.tags ?? []).join("\u0000"),
    compact: "meta",
    compactText: (row) => (row.node.tags ?? []).map((tag) => `#${tag}`).join(" "),
    render: (row, ctx) => (
      <span className="flex min-w-0 flex-wrap gap-1">
        {(row.node.tags ?? []).map((tag) => (
          <a
            key={tag}
            href={`/finances/register?view=tag&tag=${encodeURIComponent(tag)}`}
            className="rounded px-1.5 py-px text-[0.75rem] text-ink"
            style={{ backgroundColor: ctx.tagColors[tag] ?? "var(--surface-raised)" }}
          >
            #{tag}
          </a>
        ))}
      </span>
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
