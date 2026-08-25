"use client";

import type { ColumnDef, NodeGridRow } from "@/components/grid/columns";
import type { BillEnvelopeEdit } from "@/lib/finances/mutations";
import { formatUsd } from "@/lib/finances/money";
import type { Cadence } from "@/lib/finances/recurringBills";
import type { EnvelopeIndicator } from "@/lib/finances/budget/indicator";
import { type BudgetBillRow, type BudgetRow } from "@/lib/finances/budget/rows";
import { AvailablePill, FundingBar } from "./FundingChrome";

/**
 * One column set on every money table.
 *
 * Bills and ordinary envelopes stay separate tables
 * (`agent-os/specs/2026-08-23-2313-one-budget/`). Bill-only fields (cadence, next charge,
 * amount, status, URL, yearly) live in the inspector, not extra columns
 * (`agent-os/specs/2026-08-25-1633-budget-inspector/` D2). Assigned / Activity / Available
 * are built by {@link moneyColumns} so the totals cannot drift.
 */

export type BillPatch = Omit<BillEnvelopeEdit, "name" | "cadence"> & {
  cadence?: Cadence;
};

export type BudgetColumnCtx = {
  /** Commit an inline assignment. Cents, absolute. */
  onAssign: (row: BudgetRow, cents: number) => void;
  /** Open the row's menu at the Available cell, where the cover/move actions belong. */
  onBalanceMenu: (row: BudgetRow, at: { x: number; y: number }) => void;
  /** Patch a bill's facet columns. */
  onPatchBill: (row: BudgetBillRow, patch: BillPatch) => void;
  pending: boolean;
  /** Live funding scan, keyed by envelope id. */
  indicators: ReadonlyMap<string, EnvelopeIndicator>;
};

const IDLE: EnvelopeIndicator = {
  state: "idle",
  moreNeededCents: 0,
  copy: null,
  pill: "gray",
  icon: null,
  bar: null,
};

function indicatorOf(ctx: BudgetColumnCtx, id: string): EnvelopeIndicator {
  return ctx.indicators.get(id) ?? IDLE;
}

function assignedCell<T extends BudgetRow>(row: NodeGridRow<T>, ctx: BudgetColumnCtx) {
  return (
    <input
      key={row.node.assignedCents}
      type="text"
      inputMode="decimal"
      defaultValue={(row.node.assignedCents / 100).toFixed(2)}
      disabled={ctx.pending}
      aria-label={`Assigned to ${row.node.name}`}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = (row.node.assignedCents / 100).toFixed(2);
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const next = Math.round(
          Number(event.target.value.replace(/[$,\s]/g, "")) * 100,
        );
        if (!Number.isFinite(next)) {
          event.target.value = (row.node.assignedCents / 100).toFixed(2);
          return;
        }
        if (next !== row.node.assignedCents) ctx.onAssign(row.node, next);
      }}
      className="tabular w-24 rounded border border-rule bg-surface px-1 text-right text-base text-ink md:text-[0.8125rem]"
    />
  );
}

/** The three figures every spending row carries, and the only ones the totals sum. */
function moneyColumns<T extends BudgetRow>(): ColumnDef<BudgetColumnCtx, T>[] {
  return [
    {
      id: "assigned",
      label: "Assigned",
      width: "7rem",
      align: "right",
      hideable: false,
      render: assignedCell,
      sortValue: (row) => row.node.assignedCents,
      compactText: (row) => formatUsd(row.node.assignedCents),
    },
    {
      id: "activity",
      label: "Activity",
      width: "7rem",
      align: "right",
      render: (row) => (
        <span
          className={`tabular ${row.node.activityCents === 0 ? "text-ink-faint" : "text-ink"}`}
        >
          {formatUsd(row.node.activityCents)}
        </span>
      ),
      sortValue: (row) => row.node.activityCents,
      compactText: (row) => formatUsd(row.node.activityCents),
    },
    {
      id: "balance",
      label: "Available",
      width: "8rem",
      align: "right",
      hideable: false,
      render: (row, ctx) => (
        <AvailablePill
          cents={row.node.balanceCents}
          indicator={indicatorOf(ctx, row.node.id)}
          label={row.node.name}
          disabled={ctx.pending}
          onOpen={(at) => ctx.onBalanceMenu(row.node, at)}
        />
      ),
      sortValue: (row) => row.node.balanceCents,
      compactText: (row) => formatUsd(row.node.balanceCents),
    },
  ];
}

function nameColumn<T extends BudgetRow>(label: string): ColumnDef<BudgetColumnCtx, T> {
  return {
    id: "name",
    label,
    width: "minmax(12rem,1fr)",
    hideable: false,
    render: (row, ctx) => {
      const indicator = indicatorOf(ctx, row.node.id);
      return (
        <div className="relative flex h-full w-full min-w-0 flex-col justify-center gap-0.5 md:block md:self-stretch">
          <div className="flex min-w-0 items-center gap-1.5 md:h-full">
            <span
              className={`min-w-0 truncate ${row.node.hidden ? "text-ink-faint italic" : ""}`}
            >
              {row.node.name}
            </span>
            {row.node.carryover ? (
              <span
                title="Overspending rolls into this envelope instead of onto Ready to Assign"
                className="shrink-0 rounded bg-surface-raised px-1 text-[0.625rem] text-ink-faint"
              >
                rolls over
              </span>
            ) : null}
            {indicator.copy ? (
              <span
                title={indicator.copy}
                className="ml-auto min-w-0 shrink truncate text-right text-[0.6875rem] text-ink-muted"
              >
                {indicator.copy}
              </span>
            ) : null}
          </div>
          {indicator.bar ? (
            <div className="md:pointer-events-none md:absolute md:inset-x-0 md:bottom-0.5">
              <FundingBar indicator={indicator} />
            </div>
          ) : null}
        </div>
      );
    },
    sortValue: (row) => row.node.name,
    filterValue: (row) => row.node.name,
    compactText: (row) => row.node.name,
  };
}

/** Ordinary envelopes: the four money columns. */
export const envelopeColumns: ColumnDef<BudgetColumnCtx, BudgetRow>[] = [
  nameColumn("Envelope"),
  ...moneyColumns<BudgetRow>(),
];

/** Bills: the same four columns. Facet fields live in the inspector. */
export const billColumns: ColumnDef<BudgetColumnCtx, BudgetBillRow>[] = [
  nameColumn("Bill"),
  ...moneyColumns<BudgetBillRow>(),
];
