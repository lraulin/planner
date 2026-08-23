"use client";

import type { ColumnDef } from "@/components/grid/columns";
import {
  cadenceDaysApprox,
  cadenceLabel,
  cadenceOf,
  type Cadence,
} from "@/lib/finances/recurringBills";
import { FINANCE_CATEGORIES } from "@/lib/finances/classify/categories";
import { CadenceSelect } from "../CadenceSelect";
import { UrlCell } from "./UrlCell";
import { formatUsd } from "@/lib/finances/money";
import type { CommitmentStatus, RecurringSpendPeriod } from "@/db/schema";
import type { RecurringBillEdit, RecurringSpendEdit } from "@/lib/finances/mutations";
import type { BillRow, SpendRow } from "@/lib/finances/commitmentRows";
import { FundingMeter } from "./FundingMeter";

export type BillGridRow = BillRow;
export type SpendGridRow = SpendRow;

/**
 * What a cell may change, typed as **what the write accepts** rather than as the row shape.
 *
 * These were `Partial<StoredBillRow>` / `Partial<StoredSpend>`, which let a column patch a
 * field the mutation has no idea what to do with — `id`, or a raw `cadenceMonths` — and said
 * nothing when a field went missing on the way there. Derived from the edit types, the
 * compiler now refuses a patch the write cannot honour.
 */
export type BillPatch = Omit<RecurringBillEdit, "name" | "cadence"> & {
  cadence?: Cadence;
};
export type SpendPatch = Omit<RecurringSpendEdit, "name">;

export type BillColumnCtx = {
  pending: boolean;
  onPatch: (name: string, patch: BillPatch) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onEditPayees: (row: BillGridRow) => void;
};

export type SpendColumnCtx = {
  pending: boolean;
  onPatch: (name: string, patch: SpendPatch) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
  onEditPayees: (row: SpendGridRow) => void;
};

function PayeesCell({
  names,
  label,
  disabled,
  onClick,
}: {
  names: readonly string[];
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const text = names.length > 0 ? names.join(", ") : "No payees";
  return (
    <button
      type="button"
      disabled={disabled}
      title={`Edit payees for ${label}`}
      onClick={onClick}
      className="min-h-tap w-full truncate rounded border border-transparent px-1 text-left text-[0.75rem] text-ink-muted hover:border-rule disabled:opacity-50 md:min-h-0"
    >
      {text}
    </button>
  );
}

/**
 * The category a commitment files its charges under — and, through it, the charges themselves.
 *
 * Shared by both grids because the question and its answers are identical on both tiers; the
 * blank option is "none", which is a real answer and not an unset control.
 */
function CategoryCell({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  onCommit: (category: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={`Category for ${label}`}
      title="Also categorises every charge this matches"
      onChange={(event) => onCommit(event.target.value)}
      className="min-h-tap w-full rounded border border-transparent bg-transparent px-1 text-base text-ink-muted hover:border-rule focus:border-rule md:min-h-0 md:text-[0.8125rem]"
    >
      <option value="">—</option>
      {FINANCE_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  );
}

/** The muted "nothing is being held, and here is why" cell both tiers fall back to. */
function NotHeld({ reason }: { reason: string }) {
  return (
    <span title={reason} className="text-[0.8125rem] text-ink-muted">
      {reason}
    </span>
  );
}

/**
 * What a bill is putting aside, and how far along it is.
 *
 * The one cell this whole redesign is for. It replaces a Hold checkbox and a column showing
 * `annualCost / 12` — a monthly average that was never the figure being held — with the accrual
 * itself. On a yearly bill it reads `$8.28 of $71.88 · $2.76 a paycheck`, which is the entire
 * explanation of how saving up for an annual charge works here, in the row where you decide.
 *
 * One line, because grid rows are exactly `--row-height` tall and a second line lands on top of
 * the row below. The due date is already two columns to the left under Next charge, so the only
 * thing worth the width here is the slice and the progress.
 */
function BillSetAside({ row }: { row: BillRow }) {
  if (row.held === null) {
    if (row.status === "paused") return <NotHeld reason="Paused" />;
    if (row.status === "cancelled") return <NotHeld reason="Cancelled" />;
    if (row.status === "ignored") return <NotHeld reason="Dismissed" />;
    return <NotHeld reason="Needs an amount" />;
  }

  const { heldCents, expectedCents, perPaycheckCents, fullyFunded } = row.held;
  const tone = row.overdue ? "over" : fullyFunded ? "funded" : "accruing";

  return (
    // `min-w-0 overflow-hidden` is what keeps this inside its column. Without them the flex
    // container grows past the cell and, being right-aligned, spills leftward across Cadence
    // — which is exactly what surfaced the moment a Category column made the grid tighter.
    <span className="flex min-w-0 items-center justify-end gap-1.5 overflow-hidden whitespace-nowrap">
      <FundingMeter
        heldCents={heldCents}
        targetCents={expectedCents}
        tone={tone}
        title={`${formatUsd(heldCents)} of ${formatUsd(expectedCents)} put aside`}
      />
      <span className="tabular flex-none text-[0.8125rem] text-ink">
        {fullyFunded
          ? `${formatUsd(expectedCents)} ready`
          : `${formatUsd(heldCents)} of ${formatUsd(expectedCents)}`}
      </span>
      <span
        className={`min-w-0 truncate text-[0.7rem] ${row.overdue ? "text-[var(--chart-spend)]" : "text-ink-muted"}`}
      >
        {row.overdue
          ? "· overdue"
          : fullyFunded
            ? "· covered"
            : `· ${formatUsd(perPaycheckCents)} a paycheck`}
      </span>
    </span>
  );
}

/**
 * What a recurring-spend group is holding back before the next payday.
 *
 * The bar drains rather than fills: this tier starts each period holding the whole rate and
 * releases it as the money is actually spent, so spending what you budgeted costs nothing and
 * only going over bites. A full red bar is that overspend.
 */
function SpendSetAside({ row }: { row: SpendRow }) {
  if (row.held === null) {
    if (!row.active) return <NotHeld reason="Paused" />;
    return <NotHeld reason="No rate yet" />;
  }

  const { heldCents, spentThisPeriodCents, ratePerPeriodCents, overCents } = row.held;
  const over = overCents > 0;
  const remainingCents = Math.max(0, ratePerPeriodCents - spentThisPeriodCents);

  return (
    <span className="flex min-w-0 items-center justify-end gap-1.5 overflow-hidden whitespace-nowrap">
      <FundingMeter
        heldCents={over ? ratePerPeriodCents : remainingCents}
        targetCents={ratePerPeriodCents}
        tone={over ? "over" : "accruing"}
        title={`${formatUsd(remainingCents)} of this period's ${formatUsd(ratePerPeriodCents)} unspent`}
      />
      <span className="tabular flex-none text-[0.8125rem] text-ink">
        {formatUsd(heldCents)} held
      </span>
      <span
        className={`min-w-0 truncate text-[0.7rem] ${over ? "text-[var(--chart-spend)]" : "text-ink-muted"}`}
      >
        {over
          ? `· over by ${formatUsd(overCents)}`
          : `· spent ${formatUsd(spentThisPeriodCents)} of ${formatUsd(ratePerPeriodCents)}`}
      </span>
    </span>
  );
}

function dollarsInput(
  cents: number,
  onCommit: (cents: number) => void,
  label: string,
  pending: boolean,
) {
  return (
    <input
      key={cents}
      type="text"
      inputMode="decimal"
      defaultValue={(cents / 100).toFixed(2)}
      disabled={pending}
      aria-label={label}
      onBlur={(event) => {
        const next = Math.round(
          Number(event.target.value.replace(/[$,\s]/g, "")) * 100,
        );
        if (Number.isFinite(next) && next !== cents) onCommit(next);
      }}
      className="tabular w-20 rounded border border-rule bg-surface px-1 text-right text-base text-ink md:text-[0.8125rem]"
    />
  );
}

/** How to name a bill's hold in a filter chip — the same five words the cell shows. */
function billHoldState(row: BillRow): string {
  if (row.held === null) {
    if (row.status === "paused") return "Paused";
    if (row.status === "cancelled") return "Cancelled";
    if (row.status === "ignored") return "Dismissed";
    return "Needs an amount";
  }
  if (row.overdue) return "Overdue";
  return row.held.fullyFunded ? "Ready" : "Accruing";
}

/** The same, for a spend group. */
function spendHoldState(row: SpendRow): string {
  if (row.held === null) return row.active ? "No rate yet" : "Paused";
  return row.held.overCents > 0 ? "Over" : "Holding";
}

export const billColumns: ColumnDef<BillColumnCtx, BillGridRow>[] = [
  {
    id: "name",
    label: "Name",
    width: "minmax(9rem,1.2fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name,
    sortValue: (row) => row.node.name.toLowerCase(),
    compact: "primary",
    render: (row, ctx) => (
      <input
        key={row.node.name}
        type="text"
        defaultValue={row.node.name}
        disabled={ctx.pending}
        aria-label={`Name for ${row.node.name}`}
        onBlur={(event) => {
          const next = event.target.value.trim();
          if (next !== "" && next !== row.node.name) ctx.onRename(row.node.name, next);
        }}
        className="w-full truncate rounded border border-transparent bg-transparent px-1 text-[0.8125rem] text-ink hover:border-rule focus:border-rule"
      />
    ),
  },
  {
    id: "next",
    label: "Next charge",
    width: "8rem",
    filterKind: "date",
    filterValue: (row) => row.node.nextDueKey,
    sortValue: (row) => row.node.nextDueKey ?? "",
    compact: "meta",
    render: (row, ctx) =>
      !row.node.scheduled ? (
        <span className="text-[0.8125rem] text-ink-muted">Unscheduled</span>
      ) : (
        <input
          type="date"
          value={row.node.nextDueKey ?? ""}
          disabled={ctx.pending}
          aria-label={`Next charge for ${row.node.name}`}
          onChange={(event) =>
            ctx.onPatch(row.node.name, { anchorDate: event.target.value || null })
          }
          className="rounded border border-rule bg-surface px-1 text-[0.8125rem] text-ink"
        />
      ),
  },
  {
    id: "amount",
    label: "Amount",
    width: "7rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.amountCents),
    sortValue: (row) => row.node.amountCents,
    compact: "meta",
    render: (row, ctx) =>
      dollarsInput(
        row.node.amountCents,
        (expectedCents) => ctx.onPatch(row.node.name, { expectedCents }),
        `Amount for ${row.node.name}`,
        ctx.pending,
      ),
  },
  {
    id: "cadence",
    label: "Cadence",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) =>
      row.node.scheduled ? cadenceLabel(cadenceOf(row.node)) : "Irregular",
    // Days and months rank together by the length of a cycle, so a 28-day autoship sorts
    // just under a monthly bill rather than beside a yearly one. Sorting on the stored
    // `cadenceMonths` would tie them: a day cadence carries its nearest month in that column.
    sortValue: (row) => cadenceDaysApprox(cadenceOf(row.node)),
    render: (row, ctx) =>
      !row.node.scheduled ? (
        <span className="text-[0.8125rem] text-ink-muted">Irregular</span>
      ) : (
        <CadenceSelect
          value={cadenceOf(row.node)}
          disabled={ctx.pending}
          ariaLabel={`Cadence for ${row.node.name}`}
          onChange={(cadence) => ctx.onPatch(row.node.name, { cadence })}
          className="min-h-tap w-full rounded border border-rule bg-surface px-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
      ),
  },
  {
    id: "setAside",
    label: "Set aside",
    fieldLabel: "Set aside so far",
    width: "minmax(13rem,17rem)",
    align: "right",
    filterKind: "enum",
    filterValue: (row) => billHoldState(row.node),
    sortValue: (row) => row.node.held?.heldCents ?? -1,
    compact: "meta",
    render: (row) => <BillSetAside row={row.node} />,
  },
  {
    id: "status",
    label: "Status",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => row.node.status,
    sortValue: (row) => row.node.status,
    render: (row, ctx) => (
      <select
        value={row.node.status}
        disabled={ctx.pending}
        aria-label={`Status for ${row.node.name}`}
        onChange={(event) =>
          ctx.onPatch(row.node.name, {
            status: event.target.value as CommitmentStatus,
          })
        }
        className="min-h-tap rounded border border-rule bg-surface px-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
      >
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="cancelled">Cancelled</option>
        {/* The word the Review list's button uses. Picking it moves the row into Review's
            dismissed list, which is where it can be brought back. */}
        <option value="ignored">Dismissed</option>
      </select>
    ),
  },
  {
    id: "annual",
    label: "A year",
    width: "6rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.annualCostCents),
    sortValue: (row) => row.node.annualCostCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-[var(--chart-spend)]">
        {formatUsd(row.node.annualCostCents)}
      </span>
    ),
  },
  {
    id: "monthly",
    label: "Monthly",
    width: "5.5rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.monthlyCents),
    sortValue: (row) => row.node.monthlyCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.monthlyCents)}
      </span>
    ),
  },
  {
    id: "paycheck",
    label: "Pay period",
    fieldLabel: "Per pay period",
    width: "6rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.paycheckCents),
    sortValue: (row) => row.node.paycheckCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.paycheckCents)}
      </span>
    ),
  },
  {
    id: "category",
    label: "Category",
    width: "9rem",
    filterKind: "enum",
    filterValue: (row) => row.node.category,
    sortValue: (row) => row.node.category,
    compact: "meta",
    render: (row, ctx) => (
      <CategoryCell
        value={row.node.category}
        label={row.node.name}
        disabled={ctx.pending}
        onCommit={(category) => ctx.onPatch(row.node.name, { category })}
      />
    ),
  },
  {
    id: "payees",
    label: "Payees",
    width: "minmax(8rem,1fr)",
    filterValue: (row) => row.node.payees.map((payee) => payee.name).join(", "),
    compact: "meta",
    render: (row, ctx) => (
      <PayeesCell
        names={row.node.payees.map((payee) => payee.name)}
        label={row.node.name}
        disabled={ctx.pending}
        onClick={() => ctx.onEditPayees(row.node)}
      />
    ),
  },
  {
    id: "url",
    label: "URL",
    width: "minmax(7rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => row.node.url,
    render: (row, ctx) => (
      <UrlCell
        value={row.node.url}
        label={row.node.name}
        disabled={ctx.pending}
        onCommit={(url) => ctx.onPatch(row.node.name, { url })}
      />
    ),
  },
  {
    id: "remove",
    label: "",
    fieldLabel: "Remove",
    width: "2.5rem",
    hideable: false,
    render: (row, ctx) => (
      <button
        type="button"
        disabled={ctx.pending}
        title={`Remove ${row.node.name}`}
        onClick={() => ctx.onDelete(row.node.name)}
        className="min-h-tap text-ink-muted hover:text-ink disabled:opacity-50 md:min-h-0"
      >
        ×
      </button>
    ),
  },
];

export const spendColumns: ColumnDef<SpendColumnCtx, SpendGridRow>[] = [
  {
    id: "name",
    label: "Name",
    width: "minmax(8rem,1fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name,
    sortValue: (row) => row.node.name.toLowerCase(),
    compact: "primary",
    render: (row, ctx) => (
      <input
        key={row.node.name}
        type="text"
        defaultValue={row.node.name}
        disabled={ctx.pending}
        aria-label={`Name for ${row.node.name}`}
        title="What you call this group — Pizza, not the bank's spelling of one shop"
        onBlur={(event) => {
          const next = event.target.value.trim();
          if (next !== "" && next !== row.node.name) ctx.onRename(row.node.name, next);
        }}
        className="w-full truncate rounded border border-transparent bg-transparent px-1 text-[0.8125rem] text-ink hover:border-rule focus:border-rule"
      />
    ),
  },
  {
    id: "category",
    label: "Category",
    width: "9rem",
    filterKind: "enum",
    filterValue: (row) => row.node.category,
    sortValue: (row) => row.node.category,
    compact: "meta",
    render: (row, ctx) => (
      <CategoryCell
        value={row.node.category}
        label={row.node.name}
        disabled={ctx.pending}
        onCommit={(category) => ctx.onPatch(row.node.name, { category })}
      />
    ),
  },
  {
    id: "payees",
    label: "Payees",
    width: "minmax(10rem,1.4fr)",
    filterValue: (row) => row.node.payees.map((payee) => payee.name).join(", "),
    compact: "meta",
    render: (row, ctx) => (
      <PayeesCell
        names={row.node.payees.map((payee) => payee.name)}
        label={row.node.name}
        disabled={ctx.pending}
        onClick={() => ctx.onEditPayees(row.node)}
      />
    ),
  },
  {
    id: "period",
    label: "Period",
    width: "6rem",
    filterKind: "enum",
    filterValue: (row) => row.node.period,
    render: (row, ctx) => (
      <select
        value={row.node.period}
        disabled={ctx.pending}
        aria-label={`Period for ${row.node.name}`}
        onChange={(event) =>
          ctx.onPatch(row.node.name, {
            period: event.target.value as RecurringSpendPeriod,
          })
        }
        className="min-h-tap rounded border border-rule bg-surface px-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
      >
        <option value="week">Week</option>
        <option value="month">Month</option>
      </select>
    ),
  },
  {
    id: "rate",
    label: "Rate",
    width: "11rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.rate.ratePerPeriodCents),
    sortValue: (row) => row.node.rate.ratePerPeriodCents,
    compact: "meta",
    render: (row, ctx) => (
      // One line, like every other cell: the row is `--row-height` tall and a second line
      // lands on the row below. When the rate is auto it *is* the observed history, so
      // repeating the history figure beside it said the same number twice.
      <span className="flex min-w-0 items-center justify-end gap-1.5 overflow-hidden whitespace-nowrap">
        {row.node.rate.pinned ? (
          dollarsInput(
            row.node.rate.ratePerPeriodCents,
            (expectedCents) =>
              ctx.onPatch(row.node.name, { amountSource: "pinned", expectedCents }),
            `Pinned rate for ${row.node.name}`,
            ctx.pending,
          )
        ) : (
          <span className="tabular flex-none text-[0.8125rem] text-ink">
            {formatUsd(row.node.rate.ratePerPeriodCents)}
          </span>
        )}
        <span className="min-w-0 truncate text-[0.7rem] text-ink-muted">
          {row.node.rate.pinned
            ? row.node.rate.periodsObserved > 0
              ? `pinned · you spend ${formatUsd(row.node.rate.observedCents)}`
              : "pinned"
            : "from your history"}
        </span>
      </span>
    ),
  },
  {
    id: "setAside",
    label: "Set aside",
    fieldLabel: "Held before payday",
    width: "minmax(13rem,17rem)",
    align: "right",
    filterKind: "enum",
    filterValue: (row) => spendHoldState(row.node),
    sortValue: (row) => row.node.held?.heldCents ?? -1,
    compact: "meta",
    render: (row) => <SpendSetAside row={row.node} />,
  },
  {
    id: "active",
    label: "Active",
    fieldLabel: "Still part of the routine",
    width: "4.5rem",
    filterKind: "enum",
    filterValue: (row) => (row.node.active ? "Active" : "Paused"),
    sortValue: (row) => (row.node.active ? 1 : 0),
    render: (row, ctx) => (
      <input
        type="checkbox"
        checked={row.node.active}
        disabled={ctx.pending}
        aria-label={`${row.node.name} is still part of the routine`}
        title={
          row.node.active
            ? "Stop holding this back without losing the group or its history"
            : "Start holding this back again"
        }
        onChange={(event) =>
          ctx.onPatch(row.node.name, { active: event.target.checked })
        }
        className="size-4 align-middle accent-[var(--chart-average)]"
      />
    ),
  },
  {
    id: "weekly",
    label: "Weekly",
    width: "5.5rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.weeklyCents),
    sortValue: (row) => row.node.weeklyCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.weeklyCents)}
      </span>
    ),
  },
  {
    id: "monthly",
    label: "Monthly",
    width: "5.5rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.monthlyCents),
    sortValue: (row) => row.node.monthlyCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.monthlyCents)}
      </span>
    ),
  },
  {
    id: "paycheck",
    label: "Pay period",
    fieldLabel: "Per pay period",
    width: "6rem",
    align: "right",
    filterValue: (row) => formatUsd(row.node.paycheckCents),
    sortValue: (row) => row.node.paycheckCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.paycheckCents)}
      </span>
    ),
  },
  {
    id: "remove",
    label: "",
    fieldLabel: "Remove",
    width: "2.5rem",
    hideable: false,
    render: (row, ctx) => (
      <button
        type="button"
        disabled={ctx.pending}
        title={`Remove ${row.node.name}`}
        onClick={() => ctx.onDelete(row.node.name)}
        className="min-h-tap text-ink-muted hover:text-ink disabled:opacity-50 md:min-h-0"
      >
        ×
      </button>
    ),
  },
];
