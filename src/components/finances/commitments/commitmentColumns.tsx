"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { CADENCE_CHOICES, cadenceLabel } from "@/lib/finances/recurringBills";
import { formatUsd } from "@/lib/finances/money";
import type { CommitmentStatus, RecurringSpendPeriod } from "@/db/schema";
import type { StoredBillRow, StoredSpend, SpendRate } from "@/lib/finances/commitments";

export type BillGridRow = StoredBillRow & {
  nextDueKey: string | null;
  amountCents: number;
  annualCostCents: number;
  monthlySetAsideCents: number;
};

export type SpendGridRow = StoredSpend & {
  rate: SpendRate;
  weeklyCents: number;
  monthlyCents: number;
};

export type BillColumnCtx = {
  pending: boolean;
  onPatch: (
    name: string,
    patch: Partial<StoredBillRow> & { cadenceMonths?: number },
  ) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
};

export type SpendColumnCtx = {
  pending: boolean;
  onPatch: (name: string, patch: Partial<StoredSpend>) => void;
  onDelete: (name: string) => void;
};

function dollarsInput(
  cents: number,
  onCommit: (cents: number) => void,
  label: string,
  pending: boolean,
) {
  return (
    <input
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
      row.node.scheduled ? cadenceLabel(row.node.cadenceMonths) : "Irregular",
    sortValue: (row) => row.node.cadenceMonths,
    render: (row, ctx) =>
      !row.node.scheduled ? (
        <span className="text-[0.8125rem] text-ink-muted">Irregular</span>
      ) : (
        <select
          value={row.node.cadenceMonths}
          disabled={ctx.pending}
          aria-label={`Cadence for ${row.node.name}`}
          onChange={(event) =>
            ctx.onPatch(row.node.name, { cadenceMonths: Number(event.target.value) })
          }
          className="min-h-tap rounded border border-rule bg-surface px-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
        >
          {CADENCE_CHOICES.map((months) => (
            <option key={months} value={months}>
              {cadenceLabel(months)}
            </option>
          ))}
        </select>
      ),
  },
  {
    id: "hold",
    label: "Hold",
    fieldLabel: "Hold from available",
    width: "4.5rem",
    filterKind: "enum",
    filterValue: (row) => (row.node.setAside ? "yes" : "no"),
    filterLabel: (value) => (value === "yes" ? "Held from available" : "Not held"),
    sortValue: (row) => (row.node.setAside ? 1 : 0),
    render: (row, ctx) => (
      <input
        type="checkbox"
        checked={row.node.setAside}
        disabled={ctx.pending || row.node.amountCents <= 0}
        aria-label={`Hold ${row.node.name} back from available to spend`}
        title={
          row.node.amountCents <= 0
            ? "Set an amount first — a hold with no figure would deduct nothing"
            : "Subtract this from Available to Spend on the dashboard"
        }
        onChange={(event) =>
          ctx.onPatch(row.node.name, {
            setAside: event.target.checked,
            ...(event.target.checked ? { expectedCents: row.node.amountCents } : {}),
          })
        }
        className="size-4 align-middle accent-[var(--chart-spend)]"
      />
    ),
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
        <option value="cancelled">Cancelled</option>
        <option value="ignored">Ignored</option>
      </select>
    ),
  },
  {
    id: "annual",
    label: "A year",
    width: "6rem",
    align: "right",
    sortValue: (row) => row.node.annualCostCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-[var(--chart-spend)]">
        {formatUsd(row.node.annualCostCents)}
      </span>
    ),
  },
  {
    id: "monthly",
    label: "Set aside",
    width: "6rem",
    align: "right",
    sortValue: (row) => row.node.monthlySetAsideCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.monthlySetAsideCents)}
      </span>
    ),
  },
  {
    id: "matchers",
    label: "Matchers",
    width: "minmax(8rem,1fr)",
    filterValue: (row) => row.node.matchers.join(", "),
    compact: "meta",
    render: (row, ctx) => (
      <input
        type="text"
        defaultValue={row.node.matchers.join(", ")}
        disabled={ctx.pending}
        aria-label={`Matchers for ${row.node.name}`}
        onBlur={(event) => {
          const matchers = event.target.value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
          ctx.onPatch(row.node.name, { matchers });
        }}
        className="w-full truncate rounded border border-transparent bg-transparent px-1 text-[0.75rem] text-ink-muted hover:border-rule focus:border-rule"
      />
    ),
  },
  {
    id: "cancelUrl",
    label: "Cancel URL",
    width: "minmax(7rem,0.8fr)",
    render: (row, ctx) => (
      <input
        type="url"
        defaultValue={row.node.cancelUrl}
        disabled={ctx.pending}
        aria-label={`Cancel URL for ${row.node.name}`}
        onBlur={(event) =>
          ctx.onPatch(row.node.name, { cancelUrl: event.target.value })
        }
        className="w-full truncate rounded border border-transparent bg-transparent px-1 text-[0.75rem] text-ink-muted hover:border-rule focus:border-rule"
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
    render: (row) => <span className="text-[0.8125rem] text-ink">{row.node.name}</span>,
  },
  {
    id: "matchers",
    label: "Matchers",
    width: "minmax(10rem,1.4fr)",
    filterValue: (row) => row.node.matchers.join(", "),
    compact: "meta",
    render: (row, ctx) => (
      <input
        type="text"
        defaultValue={row.node.matchers.join(", ")}
        disabled={ctx.pending}
        aria-label={`Matchers for ${row.node.name}`}
        onBlur={(event) => {
          const matchers = event.target.value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
          ctx.onPatch(row.node.name, { matchers });
        }}
        className="w-full truncate rounded border border-transparent bg-transparent px-1 text-[0.75rem] text-ink-muted hover:border-rule focus:border-rule"
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
    sortValue: (row) => row.node.rate.ratePerPeriodCents,
    compact: "meta",
    render: (row, ctx) => (
      <div className="text-right">
        {row.node.rate.pinned ? (
          dollarsInput(
            row.node.rate.ratePerPeriodCents,
            (expectedCents) =>
              ctx.onPatch(row.node.name, { amountSource: "pinned", expectedCents }),
            `Pinned rate for ${row.node.name}`,
            ctx.pending,
          )
        ) : (
          <span className="tabular text-[0.8125rem] text-ink">
            {formatUsd(row.node.rate.ratePerPeriodCents)}
          </span>
        )}
        <div className="text-[0.7rem] text-ink-muted">
          {row.node.rate.pinned ? "pinned" : "auto"}
          {row.node.rate.periodsObserved > 0 &&
            ` · history ${formatUsd(row.node.rate.observedCents)}`}
        </div>
      </div>
    ),
  },
  {
    id: "weekly",
    label: "Weekly",
    width: "5.5rem",
    align: "right",
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
    sortValue: (row) => row.node.monthlyCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.monthlyCents)}
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
