"use client";

import type { ColumnDef, NodeGridRow } from "@/components/grid/columns";
import { DateKeyCell } from "@/components/grid/cells";
import { CadenceSelect } from "@/components/finances/CadenceSelect";
import type { EnvelopeStatus } from "@/db/schema";
import type { BillEnvelopeEdit } from "@/lib/finances/mutations";
import { formatUsd } from "@/lib/finances/money";
import {
  annualCents,
  cadenceDaysApprox,
  cadenceLabel,
  cadenceOf,
  type Cadence,
} from "@/lib/finances/recurringBills";
import type { EnvelopeIndicator } from "@/lib/finances/budget/indicator";
import { type BudgetBillRow, type BudgetRow } from "@/lib/finances/budget/rows";
import { AvailablePill, FundingBar } from "./FundingChrome";
import { UrlCell } from "./UrlCell";

/**
 * Two column sets over one row shape: bills and ordinary envelopes are separate tables
 * (`agent-os/specs/2026-08-23-2313-one-budget/`, revised after use).
 *
 * Assigned / Activity / Available are built by {@link moneyColumns} so the two tables cannot
 * drift on the figures that have to add up across them. Everything else differs: only a bill
 * has a cadence, a next charge, a status or a URL, and putting those on one grid meant six
 * columns reading `—` on every ordinary envelope.
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

/** The cadence a bill row is on. `cadenceMonths` is only ever null off a `kind: 'bill'` row. */
function cadenceOfBill(bill: BudgetBillRow["bill"]): Cadence {
  return cadenceOf({
    cadenceMonths: bill.cadenceMonths ?? 1,
    cadenceDays: bill.cadenceDays,
  });
}

/** What a bill costs per year, or 0 when no amount has been declared. */
function annualCentsOf(row: BudgetBillRow): number {
  if (row.bill.expectedCents === null) return 0;
  return annualCents(row.bill.expectedCents, cadenceOfBill(row.bill));
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

/** Ordinary envelopes: Actual's three columns and nothing else. */
export const envelopeColumns: ColumnDef<BudgetColumnCtx, BudgetRow>[] = [
  nameColumn("Envelope"),
  ...moneyColumns<BudgetRow>(),
];

/** Bills: the Commitments table's columns, with Assigned/Activity/Available in place of the meter. */
export const billColumns: ColumnDef<BudgetColumnCtx, BudgetBillRow>[] = [
  nameColumn("Bill"),
  {
    id: "nextDue",
    label: "Next charge",
    width: "8rem",
    filterKind: "date",
    filterValue: (row) => row.node.nextDueKey ?? "",
    sortValue: (row) => row.node.nextDueKey ?? "",
    compact: "meta",
    render: (row, ctx) =>
      !row.node.bill.scheduled ? (
        <span className="text-ink-faint">Unscheduled</span>
      ) : (
        <DateKeyCell
          value={row.node.nextDueKey ?? ""}
          ariaLabel={`Next charge for ${row.node.name}`}
          disabled={ctx.pending}
          align="left"
          onChange={(anchorDate) => ctx.onPatchBill(row.node, { anchorDate })}
        />
      ),
  },
  {
    id: "cadence",
    label: "Cadence",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) =>
      row.node.bill.scheduled
        ? cadenceLabel(cadenceOfBill(row.node.bill))
        : "Irregular",
    // Days and months rank together by the length of a cycle, so a 28-day autoship sorts just
    // under a monthly bill rather than beside a yearly one.
    sortValue: (row) => cadenceDaysApprox(cadenceOfBill(row.node.bill)),
    render: (row, ctx) =>
      !row.node.bill.scheduled ? (
        <span className="text-ink-faint">Irregular</span>
      ) : (
        <CadenceSelect
          value={cadenceOfBill(row.node.bill)}
          disabled={ctx.pending}
          ariaLabel={`Cadence for ${row.node.name}`}
          onChange={(cadence) => ctx.onPatchBill(row.node, { cadence })}
          className="min-h-tap w-full rounded border border-rule bg-surface px-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        />
      ),
  },
  {
    id: "billAmount",
    label: "Amount",
    width: "7rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) => formatUsd(row.node.bill.expectedCents ?? 0),
    sortValue: (row) => row.node.bill.expectedCents ?? -1,
    compact: "meta",
    render: (row, ctx) =>
      dollarsInput(
        row.node.bill.expectedCents ?? 0,
        (expectedCents) => ctx.onPatchBill(row.node, { expectedCents }),
        `Amount for ${row.node.name}`,
        ctx.pending,
      ),
  },
  ...moneyColumns<BudgetBillRow>(),
  {
    id: "billStatus",
    label: "Status",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => row.node.bill.status,
    sortValue: (row) => row.node.bill.status,
    render: (row, ctx) => (
      <select
        value={row.node.bill.status}
        disabled={ctx.pending}
        aria-label={`Status for ${row.node.name}`}
        onChange={(event) =>
          ctx.onPatchBill(row.node, {
            status: event.target.value as EnvelopeStatus,
          })
        }
        className="min-h-tap rounded border border-rule bg-surface px-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
      >
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="cancelled">Cancelled</option>
      </select>
    ),
  },
  {
    id: "billUrl",
    label: "URL",
    width: "minmax(7rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => row.node.bill.url,
    render: (row, ctx) => (
      <UrlCell
        value={row.node.bill.url}
        label={row.node.name}
        disabled={ctx.pending}
        onCommit={(url) => ctx.onPatchBill(row.node, { url })}
      />
    ),
  },
  {
    id: "annual",
    label: "A year",
    width: "6rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) => formatUsd(annualCentsOf(row.node)),
    sortValue: (row) => annualCentsOf(row.node),
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-[var(--chart-spend)]">
        {formatUsd(annualCentsOf(row.node))}
      </span>
    ),
  },
  {
    id: "monthly",
    label: "Monthly",
    width: "5.5rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) => formatUsd(Math.round(annualCentsOf(row.node) / 12)),
    sortValue: (row) => Math.round(annualCentsOf(row.node) / 12),
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(Math.round(annualCentsOf(row.node) / 12))}
      </span>
    ),
  },
];
