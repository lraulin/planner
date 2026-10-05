"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { AmountCell } from "@/components/grid/cells";
import { CadenceSelect } from "@/components/finances/CadenceSelect";
import { formatUsd } from "@/lib/finances/money";
import { periodAmounts } from "@/lib/finances/scenarios/amount";
import type { LineEdit } from "@/lib/finances/scenarios/mutations";
import type { ScenarioGridNode } from "@/lib/finances/scenarios/gridRows";
import { isComposingKey } from "@/lib/keyboard";

/**
 * Columns for the scenario worksheet. One grid carries three kinds of row — live Regular
 * income, live bills, and the scenario's own lines — so most cells render differently by
 * kind: a bill's name is the budget's, a line's is yours to edit; a bill's amount is the
 * live figure unless this scenario overrides it, a manual line's is whatever you typed.
 *
 * The **Monthly** column is the comparable figure the whole page adds up, and it is the one
 * place a bill or income row is edited: typing there replaces the amount for this scenario
 * only. Everything else a bill carries (cadence, due date) stays on the Bills page.
 */

export type ScenariosColumnCtx = {
  pending: boolean;
  supplyItemNames: ReadonlyMap<string, string>;
  supplyGroupNames: ReadonlyMap<string, string>;
  /** What a line may compare itself to: envelopes and budget groups, labelled for a picker. */
  linkOptions: {
    envelopes: readonly { id: string; label: string }[];
    groups: readonly { id: string; label: string }[];
  };
  onPatchLine: (lineId: string, edit: LineEdit) => void;
  onSetOverride: (
    envelopeId: string,
    value: { included: boolean; monthlyCents?: number | null },
  ) => void;
};

const INPUT =
  "min-w-0 w-full rounded border border-transparent bg-transparent px-1 text-base text-ink hover:border-rule focus:border-rule md:text-[0.8125rem]";
const AMOUNT = `tabular text-right ${INPUT}`;

export const SCENARIO_COLUMN_IDS = [
  "on",
  "name",
  "amount",
  "cadence",
  "monthly",
  "actual",
  "difference",
  "compare",
  "payPeriod",
  "yearly",
] as const;

type Row = Parameters<ColumnDef<ScenariosColumnCtx, ScenarioGridNode>["render"]>[0];

function monthlyOf(node: ScenarioGridNode): number | null {
  switch (node.kind) {
    case "income":
      return node.row.monthlyCents;
    case "bill":
      return node.row.monthlyCents;
    case "line":
      return node.line.monthlyCents;
  }
}

function nameOf(node: ScenarioGridNode): string {
  return node.kind === "line" ? node.line.name : node.row.name;
}

function actualOf(node: ScenarioGridNode): number | null {
  if (node.kind === "line") return node.line.actualMonthlyCents;
  if (node.kind === "bill") return node.row.actualMonthlyCents;
  return null;
}

function differenceOf(node: ScenarioGridNode): number | null {
  if (node.kind === "line") return node.line.differenceCents;
  if (node.kind === "bill") {
    const actual = node.row.actualMonthlyCents;
    return actual === null ? null : node.row.monthlyCents - actual;
  }
  return null;
}

/** Whether a bill or income row is counted — lines have no switch. */
function includedOf(node: ScenarioGridNode): boolean | null {
  return node.kind === "line" ? null : node.row.included;
}

function NameInput({
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
        if (event.key === "Enter" && !isComposingKey(event.nativeEvent)) {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const next = event.target.value.trim();
        if (next === "") {
          event.target.value = value;
          return;
        }
        if (next !== value) onCommit(next);
      }}
    />
  );
}

function money(cents: number | null, muted = false) {
  if (cents === null) return <span className="text-ink-faint">—</span>;
  return (
    <span className={`tabular ${muted ? "text-ink-faint" : "text-ink"}`}>
      {formatUsd(cents)}
    </span>
  );
}

function sourceLabel(row: Row, ctx: ScenariosColumnCtx): string | null {
  if (row.node.kind !== "line") return null;
  const { source } = row.node.line;
  if (source.type === "supplyItem") {
    return `Supplies · ${ctx.supplyItemNames.get(source.supplyItemId) ?? "item removed"}`;
  }
  if (source.type === "supplyGroup") {
    return `Supplies · ${ctx.supplyGroupNames.get(source.supplyGroupId) ?? "group removed"}`;
  }
  return null;
}

function linkValue(node: ScenarioGridNode): string {
  if (node.kind !== "line") return "";
  if (node.line.envelopeId) return `e:${node.line.envelopeId}`;
  if (node.line.budgetGroupId) return `g:${node.line.budgetGroupId}`;
  return "";
}

export function scenarioColumns(): ColumnDef<ScenariosColumnCtx, ScenarioGridNode>[] {
  return [
    {
      id: "on",
      label: "On",
      width: "3rem",
      align: "center",
      filterKind: "enum",
      filterValue: (row) => {
        const included = includedOf(row.node);
        return included === null ? null : included ? "On" : "Off";
      },
      render: (row, ctx) => {
        const node = row.node;
        if (node.kind === "line") return null;
        const included = node.row.included;
        return (
          <input
            type="checkbox"
            checked={included}
            disabled={ctx.pending}
            aria-label={`${included ? "Exclude" : "Include"} ${node.row.name}`}
            title={
              node.row.overridden
                ? "Overridden in this scenario"
                : "As it is today — switch to override"
            }
            className="size-3.5 accent-[var(--select-edge)]"
            onChange={() =>
              ctx.onSetOverride(node.row.envelopeId, {
                included: !included,
                monthlyCents: node.row.overrideMonthlyCents,
              })
            }
          />
        );
      },
      compactText: (row) => {
        const included = includedOf(row.node);
        return included === false ? "off" : null;
      },
    },
    {
      id: "name",
      label: "Name",
      width: "19rem",
      hideable: false,
      filterKind: "text",
      filterValue: (row) => nameOf(row.node),
      sortValue: (row) => nameOf(row.node).toLowerCase(),
      render: (row, ctx) => {
        const node = row.node;
        const indent = { paddingLeft: `calc(${row.depth} * var(--indent-step))` };
        if (node.kind === "line") {
          return (
            <span className="flex w-full min-w-0 items-center" style={indent}>
              <NameInput
                value={node.line.name}
                label="Line name"
                disabled={ctx.pending}
                onCommit={(name) => ctx.onPatchLine(node.line.id, { name })}
              />
            </span>
          );
        }
        const status = node.kind === "bill" && node.row.status !== "active";
        return (
          <span
            className={`flex w-full min-w-0 items-center gap-2 px-1 text-[0.8125rem] ${
              node.row.included ? "text-ink" : "text-ink-faint"
            }`}
            style={indent}
          >
            <span className="truncate">{node.row.name}</span>
            {status ? (
              <span className="rounded border border-rule px-1 text-[0.6875rem] text-ink-muted">
                {node.kind === "bill" ? node.row.status : ""}
              </span>
            ) : null}
          </span>
        );
      },
      compactText: (row) => nameOf(row.node),
    },
    {
      id: "amount",
      label: "Amount",
      width: "8rem",
      align: "right",
      render: (row, ctx) => {
        const node = row.node;
        if (node.kind !== "line" || node.line.isRollup) return null;
        const { source } = node.line;
        if (source.type === "manual") {
          return (
            <AmountCell
              cents={source.amountCents}
              label={`Amount for ${node.line.name}`}
              disabled={ctx.pending}
              className={AMOUNT}
              onCommit={(amountCents) =>
                ctx.onPatchLine(node.line.id, {
                  source: { type: "manual", amountCents, cadence: source.cadence },
                })
              }
            />
          );
        }
        const label = sourceLabel(row, ctx);
        return (
          <span className="truncate text-[0.75rem] text-ink-muted" title={label ?? ""}>
            {label ?? "No amount"}
          </span>
        );
      },
    },
    {
      id: "cadence",
      label: "Cadence",
      width: "8rem",
      render: (row, ctx) => {
        const node = row.node;
        if (node.kind !== "line" || node.line.isRollup) return null;
        const { source } = node.line;
        if (source.type !== "manual") return null;
        return (
          <CadenceSelect
            value={source.cadence}
            disabled={ctx.pending}
            ariaLabel={`Cadence for ${node.line.name}`}
            className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[0.8125rem] text-ink hover:border-rule"
            onChange={(cadence) =>
              ctx.onPatchLine(node.line.id, {
                source: {
                  type: "manual",
                  amountCents: source.amountCents,
                  cadence,
                },
              })
            }
          />
        );
      },
    },
    {
      id: "monthly",
      label: "Monthly",
      width: "8rem",
      align: "right",
      sortValue: (row) => monthlyOf(row.node),
      render: (row, ctx) => {
        const node = row.node;
        if (node.kind === "line") {
          return (
            <span className={`tabular ${node.line.isRollup ? "font-medium" : ""}`}>
              {formatUsd(node.line.monthlyCents)}
            </span>
          );
        }
        // A bill or income is edited here: typing replaces the amount for this scenario.
        return (
          <span className={node.row.included ? "" : "opacity-50"}>
            <AmountCell
              cents={node.row.monthlyCents}
              label={`Monthly amount for ${node.row.name}`}
              disabled={ctx.pending}
              className={`${AMOUNT} ${node.row.overrideMonthlyCents !== null ? "font-medium" : ""}`}
              onCommit={(monthlyCents) =>
                ctx.onSetOverride(node.row.envelopeId, {
                  included: node.row.included,
                  monthlyCents,
                })
              }
            />
          </span>
        );
      },
      compactText: (row) => {
        const cents = monthlyOf(row.node);
        return cents === null ? null : `${formatUsd(cents)}/mo`;
      },
    },
    {
      id: "actual",
      label: "Last 12 mo",
      width: "7.5rem",
      align: "right",
      sortValue: (row) => actualOf(row.node),
      render: (row) => money(actualOf(row.node), true),
      compactText: (row) => {
        const cents = actualOf(row.node);
        return cents === null ? null : `${formatUsd(cents)} last yr`;
      },
    },
    {
      id: "difference",
      label: "Difference",
      width: "7.5rem",
      align: "right",
      sortValue: (row) => differenceOf(row.node),
      render: (row) => {
        const cents = differenceOf(row.node);
        if (cents === null) return <span className="text-ink-faint">—</span>;
        return (
          <span
            className={`tabular ${cents < 0 ? "text-ink" : "text-ink-muted"}`}
            title={
              cents < 0
                ? "Planned under what was actually spent"
                : "Planned at or over what was actually spent"
            }
          >
            {formatUsd(cents)}
          </span>
        );
      },
    },
    {
      id: "compare",
      label: "Compare to",
      width: "12rem",
      filterKind: "enum",
      filterValue: (row) => {
        if (row.node.kind !== "line") return null;
        return linkValue(row.node) === "" ? "" : linkValue(row.node);
      },
      render: (row, ctx) => {
        const node = row.node;
        if (node.kind !== "line") return null;
        return (
          <select
            value={linkValue(node)}
            disabled={ctx.pending}
            aria-label={`Spending to compare ${node.line.name} to`}
            className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[0.8125rem] text-ink hover:border-rule"
            onChange={(event) => {
              const value = event.target.value;
              ctx.onPatchLine(node.line.id, {
                link:
                  value === ""
                    ? null
                    : value.startsWith("e:")
                      ? { envelopeId: value.slice(2) }
                      : { budgetGroupId: value.slice(2) },
              });
            }}
          >
            <option value="">—</option>
            <optgroup label="Envelope">
              {ctx.linkOptions.envelopes.map((envelope) => (
                <option key={envelope.id} value={`e:${envelope.id}`}>
                  {envelope.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Budget group">
              {ctx.linkOptions.groups.map((group) => (
                <option key={group.id} value={`g:${group.id}`}>
                  {group.label}
                </option>
              ))}
            </optgroup>
          </select>
        );
      },
    },
    {
      id: "payPeriod",
      label: "Pay period",
      width: "7.5rem",
      align: "right",
      sortValue: (row) => {
        const cents = monthlyOf(row.node);
        return cents === null ? null : periodAmounts(cents).payPeriodCents;
      },
      render: (row) => {
        const cents = monthlyOf(row.node);
        return money(cents === null ? null : periodAmounts(cents).payPeriodCents, true);
      },
    },
    {
      id: "yearly",
      label: "Year",
      width: "8rem",
      align: "right",
      sortValue: (row) => {
        const cents = monthlyOf(row.node);
        return cents === null ? null : periodAmounts(cents).yearlyCents;
      },
      render: (row) => {
        const cents = monthlyOf(row.node);
        return money(cents === null ? null : periodAmounts(cents).yearlyCents, true);
      },
    },
  ];
}
