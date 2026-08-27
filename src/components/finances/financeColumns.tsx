"use client";

import type { ColumnDef, NodeGridRow } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { effectiveFlow, effectiveMerchant } from "@/lib/finances/analytics";
import { flowLabel } from "@/lib/finances/flowLabels";
import { formatUsd } from "@/lib/finances/money";
import type { RegisterTransactionRow } from "@/lib/finances/registerQuery";
import {
  REGISTER_VISIBLE_COLUMN_IDS,
  registerFields,
  type RegisterFieldId,
} from "@/lib/finances/registerFields";
import { categoryAssignmentRefusal } from "@/lib/finances/categoryEligibility";
import type { EnvelopeCatalog } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";
import { CategorySelect } from "./CategorySelect";

/**
 * What the Envelope column needs. Every other column is pure presentation, which is why this
 * was `Record<string, never>` until the budget arrived.
 */
export type FinanceColumnCtx = {
  /** Every envelope, in budget order. Empty until a budget is set up. */
  catalog: EnvelopeCatalog;
  offBudgetAccountIds: ReadonlySet<string>;
  onSetEnvelope: (transactionId: string, categoryId: string | null) => void;
  onCreateEnvelope: (transactionId: string, kind: EnvelopeKind) => void;
  tagColors: Readonly<Record<string, string | null>>;
  /** Split parents whose children are currently shown beneath them. */
  expandedSplitIds: ReadonlySet<string>;
  onToggleSplit: (transactionId: string) => void;
};

/** A row is a split child when it names a parent; the register indexes only parents. */
function isSplitChild(row: RegisterTransactionRow): boolean {
  return row.parentId !== null;
}

export const FINANCE_COLUMN_IDS = REGISTER_VISIBLE_COLUMN_IDS;

function accessors(id: RegisterFieldId) {
  const field = registerFields[id];
  return {
    filterKind: field.filterKind,
    filterValue: field.filterValue
      ? (row: NodeGridRow<RegisterTransactionRow>) => field.filterValue!(row.node)
      : undefined,
    filterValues: field.filterValues
      ? (row: NodeGridRow<RegisterTransactionRow>) => field.filterValues!(row.node)
      : undefined,
    sortValue: field.sortValue
      ? (row: NodeGridRow<RegisterTransactionRow>) => field.sortValue!(row.node)
      : undefined,
  };
}

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

/** What a split parent's Category cell says instead of an envelope. */
function splitLabel(row: RegisterTransactionRow): string {
  return row.splitImbalanceCents === 0
    ? `Split (${row.splitChildCount})`
    : `Split (${row.splitChildCount}) — off by ${formatUsd(row.splitImbalanceCents)}`;
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
export const financeColumns: ColumnDef<FinanceColumnCtx, RegisterTransactionRow>[] = [
  {
    id: "date",
    label: "Date",
    width: "7rem",
    hideable: false,
    ...accessors("date"),
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
    ...accessors("account"),
    compact: "meta",
    render: (row) => <Text value={row.node.accountName} />,
  },
  {
    id: "description",
    label: "Description",
    width: "minmax(14rem,1.6fr)",
    hideable: false,
    ...accessors("description"),
    compact: "primary",
    render: (row, ctx) => {
      // A child shows its own note where it has one — "Copilot: Track & Budget" is what
      // makes a split readable, since every child inherits the same bank description.
      if (isSplitChild(row.node)) {
        const label = row.node.notes.trim() || row.node.description;
        return (
          <span className="flex min-w-0 items-center gap-1 pl-5" title={label}>
            <span aria-hidden className="text-ink-faint">
              &#9492;
            </span>
            <span className="truncate text-[0.8125rem] text-ink-muted">{label}</span>
          </span>
        );
      }
      if (row.node.splitChildCount === 0) {
        return (
          <span
            className="truncate text-[0.8125rem] font-medium text-ink"
            title={row.node.description}
          >
            {row.node.description}
          </span>
        );
      }
      const expanded = ctx.expandedSplitIds.has(row.node.id);
      return (
        <span className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} the parts of ${row.node.description}`}
            onClick={(event) => {
              event.stopPropagation();
              ctx.onToggleSplit(row.node.id);
            }}
            className="rounded px-0.5 text-ink-faint hover:text-ink"
          >
            {expanded ? "\u25BE" : "\u25B8"}
          </button>
          <span
            className="truncate text-[0.8125rem] font-medium text-ink"
            title={row.node.description}
          >
            {row.node.description}
          </span>
        </span>
      );
    },
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
    ...accessors("payee"),
    compact: "meta",
    render: (row) => (
      <Text value={effectiveMerchant(row.node)} muted={row.node.payeeId === null} />
    ),
  },
  {
    id: "category",
    label: "Category",
    width: "minmax(8rem,0.6fr)",
    ...accessors("category"),
    compact: "meta",
    compactTextWithCtx: (row, ctx) =>
      row.node.splitChildCount > 0
        ? splitLabel(row.node)
        : categoryAssignmentRefusal({
              accountOffBudget: ctx.offBudgetAccountIds.has(row.node.accountId),
              categoryAssignable: row.node.categoryAssignable,
            })
          ? "Not budgeted"
          : (row.node.budgetCategoryName ?? "Categorize"),
    // Editable in place rather than behind a row-menu command: the envelope for a row is a
    // one-keystroke decision made while reading the description next to it, and a menu of
    // twenty envelopes is not a menu (`components/ux-principles`).
    render: (row, ctx) => {
      if (row.node.splitChildCount > 0) {
        // No picker on a parent: it holds no envelope by design, and its children are
        // where the Category lives. The drawer is the editor.
        const imbalance = row.node.splitImbalanceCents;
        return (
          <span
            className={`truncate text-[0.8125rem] ${imbalance === 0 ? "text-ink-muted" : "text-priority-a"}`}
            title={
              imbalance === 0
                ? undefined
                : `The bank's amount changed after this was split; ${formatUsd(imbalance)} is unallocated.`
            }
          >
            {splitLabel(row.node)}
          </span>
        );
      }
      const refusal = categoryAssignmentRefusal({
        accountOffBudget: ctx.offBudgetAccountIds.has(row.node.accountId),
        categoryAssignable: row.node.categoryAssignable,
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
          catalog={ctx.catalog}
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
    ...accessors("tags"),
    compact: "meta",
    compactText: (row) => (row.node.tags ?? []).map((tag) => `#${tag}`).join(" "),
    render: (row, ctx) => {
      const tags = row.node.tags ?? [];
      if (tags.length === 0) return null;
      return (
        <span
          className="flex min-w-0 gap-1 overflow-hidden"
          title={tags.map((tag) => `#${tag}`).join(" ")}
        >
          {tags.map((tag) => (
            <a
              key={tag}
              href={`/finances/register?view=tag&tag=${encodeURIComponent(tag)}`}
              title={`#${tag}`}
              className="min-w-0 truncate whitespace-nowrap rounded px-1.5 py-px text-[0.75rem] text-ink"
              style={{ backgroundColor: ctx.tagColors[tag] ?? "var(--surface-raised)" }}
            >
              #{tag}
            </a>
          ))}
        </span>
      );
    },
  },
  {
    id: "flow",
    label: "Flow",
    width: "minmax(9rem,0.6fr)",
    ...accessors("flow"),
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
    ...accessors("sourceCategory"),
    compact: "hidden",
    render: (row) => <Text value={row.node.sourceCategory} />,
  },
  {
    id: "amount",
    label: "Amount",
    width: "7.5rem",
    align: "right",
    hideable: false,
    ...accessors("amount"),
    compact: "meta",
    // Not `strong` while pending: the figure is provisional, and rendering it with the same
    // weight as a settled amount invites it to be added up as though it were final.
    render: (row) => <Amount cents={row.node.amountCents} strong={!row.node.pending} />,
  },
  {
    id: "posted",
    label: "Posted",
    width: "7rem",
    ...accessors("posted"),
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
    ...accessors("balance"),
    compact: "hidden",
    render: (row) => <Amount cents={row.node.balanceAfterCents} />,
  },
  {
    id: "notes",
    label: "Notes",
    width: "minmax(10rem,1fr)",
    ...accessors("notes"),
    compact: "hidden",
    render: (row) => <Text value={row.node.notes} />,
  },
];
