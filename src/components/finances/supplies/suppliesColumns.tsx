"use client";

import type { ColumnDef, NodeGridRow } from "@/components/grid/columns";
import { CategorySelect } from "@/components/finances/CategorySelect";
import type { EnvelopeCatalog } from "@/lib/finances/budget/groupEnvelopeOptions";
import { evalArithmetic } from "@/lib/arithmetic";
import { formatUsd } from "@/lib/finances/money";
import {
  formatDeltaPercent,
  formatDerivedRate,
  formatRate,
  formatUnitCost,
  trimNumber,
} from "@/lib/finances/supplies/format";
import type {
  SupplyItemEdit,
  SupplyOptionEdit,
  SupplyRateInput,
} from "@/lib/finances/supplies/mutations";
import type { SupplyGridRow } from "@/lib/finances/supplies/rows";
import { DAYS_PER_MONTH, unitsPerDay } from "@/lib/finances/supplies/cost";

/**
 * The worksheet's columns.
 *
 * Two row shapes share one column set: an **item**, which owns how fast something is used,
 * and its **options**, which own price. A cell belonging to the other shape renders blank
 * rather than disabled — a grid of greyed-out inputs on every second row reads as broken, and
 * the indent already says which row you are on.
 *
 * The money and number cells are uncontrolled and commit on blur, keyed by their own value so
 * a server round-trip re-seeds them. Enter blurs, Escape reverts. Same shape as
 * `budgetColumns.tsx`, and for the same reason: a controlled input re-rendered on every
 * keystroke by a grid that also re-sorts is how a half-typed price ends up somewhere else.
 */

export type SuppliesColumnCtx = {
  onPatchItem: (itemId: string, edit: SupplyItemEdit) => void;
  onPatchOption: (optionId: string, edit: SupplyOptionEdit) => void;
  onSetInUse: (optionId: string) => void;
  /** Non-income envelopes the "funded from" picker offers, including hidden. */
  catalog: EnvelopeCatalog;
  pending: boolean;
};

const INPUT =
  "min-w-0 w-full rounded border border-transparent bg-transparent px-1 text-base text-ink hover:border-rule focus:border-rule md:text-[0.8125rem]";
const NUMBER = `tabular text-right ${INPUT}`;

function TextCell({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      aria-label={label}
      disabled={disabled}
      className={INPUT}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        if (event.target.value !== value) onCommit(event.target.value);
      }}
    />
  );
}

function NumberCell({
  value,
  label,
  disabled,
  decimals = 0,
  onCommit,
}: {
  value: number;
  label: string;
  disabled: boolean;
  decimals?: number;
  onCommit: (next: number) => void;
}) {
  const shown = value.toFixed(decimals);
  return (
    <input
      key={shown}
      type="text"
      inputMode="decimal"
      defaultValue={shown}
      aria-label={label}
      disabled={disabled}
      className={NUMBER}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = shown;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        // `null` covers blank as well as malformed: the old `Number("")` read an emptied
        // field as a committed zero. Reverting is the only safe reading of a cleared cell.
        const next = evalArithmetic(event.target.value);
        if (next === null) {
          event.target.value = shown;
          return;
        }
        if (next !== value) onCommit(next);
      }}
    />
  );
}

/** Cost per period. Greyed on an option row, because there it is a what-if and not a cost. */
function periodCell(cents: number | null, live: boolean) {
  if (cents === null) return <span className="text-ink-faint">—</span>;
  return (
    <span className={`tabular ${live ? "text-ink" : "text-ink-faint"}`}>
      {formatUsd(cents)}
    </span>
  );
}

/** Lasts / Packs/mo. Same live-vs-greyed split as the period columns. */
function restockCell(value: number | null, live: boolean) {
  if (value === null) return <span className="text-ink-faint">—</span>;
  return (
    <span className={`tabular ${live ? "text-ink" : "text-ink-faint"}`}>
      {trimNumber(value)}
    </span>
  );
}

function RateCell({
  row,
  ctx,
}: {
  row: NodeGridRow<SupplyGridRow>;
  ctx: SuppliesColumnCtx;
}) {
  if (row.node.kind !== "item") return null;
  const { item, rate } = row.node;
  const basis = rate.basis;
  const value =
    basis === "units_per_day" ? unitsPerDay(rate) : rate.daysPerUnitTenths / 10;

  function commit(next: number, nextBasis: SupplyRateInput["rateBasis"]) {
    const rateInput: SupplyRateInput =
      nextBasis === "units_per_day"
        ? {
            rateBasis: "units_per_day",
            unitsPerDayMilli: Math.max(1, Math.round(next * 1000)),
          }
        : {
            rateBasis: "days_per_unit",
            daysPerUnitTenths: Math.max(1, Math.round(next * 10)),
          };
    ctx.onPatchItem(item.id, { rate: rateInput });
  }

  return (
    <span className="flex w-full items-center gap-1">
      <NumberCell
        value={value}
        decimals={basis === "units_per_day" ? 3 : 1}
        label={`Rate for ${item.name}`}
        disabled={ctx.pending}
        onCommit={(next) => commit(next, basis)}
      />
      <select
        value={basis}
        aria-label={`Rate basis for ${item.name}`}
        disabled={ctx.pending}
        className="rounded border border-transparent bg-transparent text-[0.75rem] text-ink-muted hover:border-rule"
        onChange={(event) => {
          // Restate the same speed from the other end rather than blanking the field: the
          // two bases are one fact, and losing it on a dropdown change would be a trap.
          const nextBasis = event.target.value as SupplyRateInput["rateBasis"];
          if (nextBasis === basis) return;
          const perDay = unitsPerDay(rate);
          commit(nextBasis === "units_per_day" ? perDay : 1 / perDay, nextBasis);
        }}
      >
        <option value="units_per_day">/day</option>
        <option value="days_per_unit">days each</option>
      </select>
    </span>
  );
}

export const SUPPLIES_COLUMN_IDS = [
  "name",
  "use",
  "vendor",
  "qty",
  "cost",
  "unitCost",
  "rate",
  "lasts",
  "packsPerMonth",
  "unitsPerMonth",
  "biweekly",
  "monthly",
  "yearly",
  "delta",
  "group",
  "envelope",
] as const;

export function suppliesColumns(): ColumnDef<SuppliesColumnCtx, SupplyGridRow>[] {
  return [
    {
      id: "name",
      label: "Item / Brand",
      width: "19rem",
      hideable: false,
      filterKind: "text",
      filterValue: (row) =>
        row.node.kind === "item" ? row.node.item.name : row.node.option.brand,
      sortValue: (row) =>
        (row.node.kind === "item"
          ? row.node.item.name
          : row.node.option.brand
        ).toLowerCase(),
      render: (row, ctx) => (
        <span
          className="flex w-full min-w-0 items-center"
          style={{ paddingLeft: `calc(${row.depth} * var(--indent-step))` }}
        >
          {row.node.kind === "item" ? (
            <TextCell
              value={row.node.item.name}
              label="Item name"
              disabled={ctx.pending}
              onCommit={(name) => ctx.onPatchItem(row.id, { name })}
            />
          ) : (
            <TextCell
              value={row.node.option.brand}
              label={`Brand for ${row.node.item.name}`}
              disabled={ctx.pending}
              onCommit={(brand) => ctx.onPatchOption(row.id, { brand })}
            />
          )}
        </span>
      ),
      compactText: (row) =>
        row.node.kind === "item" ? row.node.item.name : row.node.option.brand,
    },
    {
      id: "use",
      label: "Use",
      width: "3rem",
      align: "center",
      render: (row, ctx) => {
        if (row.node.kind !== "option") return null;
        const { option, item } = row.node;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={option.inUse}
            aria-label={`Use ${option.vendor || option.brand || "this offer"} for ${item.name}`}
            title={
              option.inUse
                ? "This offer drives the totals"
                : "Make this the offer that drives the totals"
            }
            disabled={ctx.pending || option.inUse}
            className="grid min-h-tap min-w-tap place-items-center md:min-h-0 md:min-w-0"
            onClick={() => ctx.onSetInUse(option.id)}
          >
            <span
              className={`block size-3.5 rounded-full border ${
                option.inUse
                  ? "border-select-edge bg-select-edge"
                  : "border-rule bg-surface"
              }`}
            />
          </button>
        );
      },
      compactText: (row) =>
        row.node.kind === "option" && row.node.option.inUse ? "in use" : null,
    },
    {
      id: "vendor",
      label: "Vendor",
      width: "10rem",
      filterKind: "enum",
      filterValue: (row) =>
        row.node.kind === "option" ? row.node.option.vendor : null,
      sortValue: (row) =>
        row.node.kind === "option" ? row.node.option.vendor.toLowerCase() : null,
      render: (row, ctx) =>
        row.node.kind === "option" ? (
          <TextCell
            value={row.node.option.vendor}
            label={`Vendor for ${row.node.item.name}`}
            disabled={ctx.pending}
            onCommit={(vendor) => ctx.onPatchOption(row.id, { vendor })}
          />
        ) : null,
      compactText: (row) =>
        row.node.kind === "option" ? row.node.option.vendor : null,
    },
    {
      id: "qty",
      label: "Qty",
      width: "4rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "option" ? row.node.option.qtyPerItem : null,
      render: (row, ctx) =>
        row.node.kind === "option" ? (
          <NumberCell
            value={row.node.option.qtyPerItem}
            label={`Units per purchase for ${row.node.item.name}`}
            disabled={ctx.pending}
            onCommit={(qty) =>
              ctx.onPatchOption(row.id, { qtyPerItem: Math.max(1, Math.round(qty)) })
            }
          />
        ) : null,
    },
    {
      id: "cost",
      label: "Cost/order",
      width: "6.5rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "option" ? row.node.option.costPerOrderCents : null,
      render: (row, ctx) =>
        row.node.kind === "option" ? (
          <NumberCell
            value={row.node.option.costPerOrderCents / 100}
            decimals={2}
            label={`Cost per order for ${row.node.item.name}`}
            disabled={ctx.pending}
            onCommit={(dollars) =>
              ctx.onPatchOption(row.id, {
                costPerOrderCents: Math.max(0, Math.round(dollars * 100)),
              })
            }
          />
        ) : null,
      compactText: (row) =>
        row.node.kind === "option"
          ? formatUsd(row.node.option.costPerOrderCents)
          : null,
    },
    {
      id: "unitCost",
      label: "$/unit",
      width: "5.5rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "option" ? row.node.totals.costPerUnitCents : null,
      render: (row) =>
        row.node.kind === "option" ? (
          <span className="tabular text-ink">
            {formatUnitCost(row.node.totals.costPerUnitCents)}
          </span>
        ) : null,
    },
    {
      id: "rate",
      label: "Rate",
      width: "12rem",
      render: (row, ctx) => <RateCell row={row} ctx={ctx} />,
      sortValue: (row) =>
        row.node.kind === "item" ? unitsPerDay(row.node.rate) : null,
      compactText: (row) =>
        row.node.kind === "item"
          ? formatRate(row.node.rate, row.node.item.unitLabel)
          : null,
    },
    {
      id: "lasts",
      label: "Lasts",
      width: "4.5rem",
      align: "right",
      sortValue: (row) => row.node.totals?.daysPerPack ?? null,
      render: (row) =>
        restockCell(row.node.totals?.daysPerPack ?? null, row.node.kind === "item"),
      compactText: (row) =>
        row.node.kind === "item" && row.node.totals
          ? `${trimNumber(row.node.totals.daysPerPack)} days`
          : null,
    },
    {
      id: "packsPerMonth",
      label: "Packs/mo",
      width: "5rem",
      align: "right",
      sortValue: (row) => row.node.totals?.packsPerMonth ?? null,
      render: (row) =>
        restockCell(row.node.totals?.packsPerMonth ?? null, row.node.kind === "item"),
    },
    {
      id: "unitsPerMonth",
      label: "Units/mo",
      width: "5rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "item" ? unitsPerDay(row.node.rate) * DAYS_PER_MONTH : null,
      render: (row) =>
        row.node.kind === "item" ? (
          <span
            className="tabular text-ink-muted"
            title={formatDerivedRate(row.node.rate, row.node.item.unitLabel)}
          >
            {Math.round(unitsPerDay(row.node.rate) * DAYS_PER_MONTH)}
          </span>
        ) : null,
    },
    {
      id: "biweekly",
      label: "Biweekly",
      width: "6.5rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "item" ? (row.node.totals?.biweeklyCents ?? null) : null,
      render: (row) =>
        periodCell(
          row.node.kind === "item"
            ? (row.node.totals?.biweeklyCents ?? null)
            : row.node.totals.biweeklyCents,
          row.node.kind === "item",
        ),
      compactText: (row) =>
        row.node.kind === "item" && row.node.totals
          ? formatUsd(row.node.totals.biweeklyCents)
          : null,
    },
    {
      id: "monthly",
      label: "Monthly",
      width: "6.5rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "item" ? (row.node.totals?.monthlyCents ?? null) : null,
      render: (row) =>
        periodCell(
          row.node.kind === "item"
            ? (row.node.totals?.monthlyCents ?? null)
            : row.node.totals.monthlyCents,
          row.node.kind === "item",
        ),
      compactText: (row) =>
        row.node.kind === "item" && row.node.totals
          ? `${formatUsd(row.node.totals.monthlyCents)}/mo`
          : null,
    },
    {
      id: "yearly",
      label: "Yearly",
      width: "7rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "item" ? (row.node.totals?.yearlyCents ?? null) : null,
      render: (row) =>
        periodCell(
          row.node.kind === "item"
            ? (row.node.totals?.yearlyCents ?? null)
            : row.node.totals.yearlyCents,
          row.node.kind === "item",
        ),
    },
    {
      id: "delta",
      label: "Δ vs in use",
      width: "6.5rem",
      align: "right",
      sortValue: (row) =>
        row.node.kind === "option"
          ? (row.node.comparison?.deltaPerUnitCents ?? null)
          : null,
      render: (row) => {
        if (row.node.kind !== "option" || !row.node.comparison) return null;
        const { deltaPercent, yearlyDeltaCents } = row.node.comparison;
        const cheaper = yearlyDeltaCents < 0;
        return (
          <span
            className={`tabular ${cheaper ? "text-select-edge" : "text-ink-muted"}`}
            title={`${cheaper ? "Saves" : "Costs"} ${formatUsd(Math.abs(yearlyDeltaCents))} a year`}
          >
            {formatDeltaPercent(deltaPercent)}
          </span>
        );
      },
    },
    {
      id: "group",
      label: "Group",
      width: "9rem",
      filterKind: "enum",
      filterValue: (row) =>
        row.node.kind === "item" ? row.node.item.groupLabel : null,
      sortValue: (row) => (row.node.kind === "item" ? row.node.item.groupLabel : null),
      render: (row, ctx) =>
        row.node.kind === "item" ? (
          <TextCell
            value={row.node.item.groupLabel}
            label={`Group for ${row.node.item.name}`}
            disabled={ctx.pending}
            onCommit={(groupLabel) => ctx.onPatchItem(row.id, { groupLabel })}
          />
        ) : null,
    },
    {
      id: "envelope",
      label: "Funded from",
      width: "11rem",
      filterKind: "enum",
      filterValue: (row) =>
        row.node.kind === "item" ? (row.node.item.envelopeName ?? "") : null,
      render: (row, ctx) => {
        if (row.node.kind !== "item") return null;
        const { item } = row.node;
        return (
          <CategorySelect
            catalog={ctx.catalog}
            value={item.envelopeId}
            onChange={(envelopeId) => ctx.onPatchItem(item.id, { envelopeId })}
            allowClear
            placeholder="—"
            disabled={ctx.pending}
            ariaLabel={`Envelope funding ${item.name}`}
            className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[0.8125rem] text-ink hover:border-rule"
          />
        );
      },
      compactText: (row) =>
        row.node.kind === "item" ? row.node.item.envelopeName : null,
    },
  ];
}
