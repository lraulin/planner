"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  autoMapBudgetAction,
  budgetOperationAction,
  setCarryoverAction,
  updateBudgetCategoryAction,
} from "@/app/finances/actions";
import { ContextMenu, type MenuItem } from "@/components/grid/ContextMenu";
import { DataGrid } from "@/components/grid/DataGrid";
import { useGridState } from "@/components/grid/useGridState";
import {
  findMonth,
  monthLabel,
  monthParamOf,
  nextMonthKey,
  prevMonthKey,
  type BudgetMonth,
} from "@/lib/finances/budget/envelope";
import type { BudgetData } from "@/lib/finances/budget/queries";
import {
  budgetGridRows,
  budgetRows,
  budgetTotals,
  coverSources,
  moveTargets,
  type BudgetRow,
} from "@/lib/finances/budget/rows";
import { formatUsd } from "@/lib/finances/money";
import { budgetColumns, type BudgetColumnCtx } from "./budgetColumns";
import { BudgetSummary } from "./BudgetSummary";
import { MoveMoneyDialog } from "./MoveMoneyDialog";

/**
 * The budget, one month at a time.
 *
 * **Arranges and formats only.** Every figure arrives already folded by
 * `src/lib/finances/budget/envelope.ts`, and every clamp is applied again on the server
 * before anything is written — this component never decides how much money can move.
 */
export function BudgetView({ data }: { data: BudgetData }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );
  const [move, setMove] = useState<{ from: BudgetRow; targets: BudgetRow[] } | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(null);

  const month = findMonth(data.months, data.month);
  const rows = useMemo(
    () => (month ? budgetRows(data.groups, data.categories, month) : []),
    [data.groups, data.categories, month],
  );
  const gridRows = useMemo(
    () => budgetGridRows(data.groups, rows),
    [data.groups, rows],
  );

  const grid = useGridState("budget", budgetColumns, {
    order: budgetColumns.map((column) => column.id),
  });

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else router.refresh();
    });
  }

  function goToMonth(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", monthParamOf(key));
    router.push(`/finances/budget?${next.toString()}`);
  }

  if (!month) return null;

  const ctx: BudgetColumnCtx = {
    pending,
    onAssign: (row, cents) =>
      run(() =>
        budgetOperationAction({
          kind: "assign",
          month: data.month,
          category: { id: row.id, name: row.name },
          amountCents: cents,
        }),
      ),
    onBalanceMenu: (row, at) => setMenu({ ...at, items: balanceMenu(row) }),
  };

  function balanceMenu(row: BudgetRow): MenuItem[] {
    const sources = coverSources(rows, row.id);
    const ref = { id: row.id, name: row.name };
    const overspent = row.balanceCents < 0;

    return [
      {
        label: "Cover overspending from",
        // Unavailable is disabled with the reason, never absent (`navigation.md`).
        title: overspent
          ? undefined
          : `${row.name} is not overspent, so there is nothing to cover`,
        disabled:
          !overspent || (sources.length === 0 && month!.readyToAssignCents <= 0),
        items: [
          {
            label: `Ready to Assign (${formatUsd(Math.max(0, month!.readyToAssignCents))})`,
            disabled: month!.readyToAssignCents <= 0,
            title:
              month!.readyToAssignCents <= 0
                ? "Nothing is left to assign this month"
                : undefined,
            onSelect: () =>
              run(() =>
                budgetOperationAction({
                  kind: "cover",
                  month: data.month,
                  from: null,
                  to: ref,
                }),
              ),
          },
          ...sources.map((source) => ({
            label: `${source.name} (${formatUsd(source.balanceCents)})`,
            onSelect: () =>
              run(() =>
                budgetOperationAction({
                  kind: "cover",
                  month: data.month,
                  from: { id: source.id, name: source.name },
                  to: ref,
                }),
              ),
          })),
        ],
      },
      {
        label: "Move money to…",
        disabled: row.balanceCents <= 0,
        title:
          row.balanceCents <= 0 ? `${row.name} has nothing in it to move` : undefined,
        onSelect: () => setMove({ from: row, targets: moveTargets(rows, row.id) }),
      },
      "separator",
      {
        label: row.carryover
          ? "Stop rolling overspending forward"
          : "Roll overspending forward",
        title: `Applies to ${monthLabel(data.month)} and every later month. ${
          row.carryover
            ? "Overspending will go back to reducing Ready to Assign."
            : "Overspending stays in this envelope instead of reducing Ready to Assign."
        }`,
        onSelect: () =>
          run(() => setCarryoverAction(data.month, row.id, !row.carryover)),
      },
      "separator",
      {
        label: row.hidden ? "Show envelope" : "Hide envelope",
        title: "A hidden envelope keeps its history and still counts toward the totals",
        onSelect: () =>
          run(() => updateBudgetCategoryAction(row.id, { hidden: !row.hidden })),
      },
    ];
  }

  const spending = rows.filter((row) => !row.isIncome);
  const totals = budgetTotals(spending);
  const backlog = data.uncategorizedCount;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <MonthBar
          month={month}
          onPrev={() => goToMonth(prevMonthKey(data.month))}
          onNext={() => goToMonth(nextMonthKey(data.month))}
          pending={pending}
          onCopyPrevious={() =>
            run(() =>
              budgetOperationAction({ kind: "copy-previous", month: data.month }),
            )
          }
          onAverage={() =>
            run(() => budgetOperationAction({ kind: "average", month: data.month }))
          }
          onZero={() =>
            run(() => budgetOperationAction({ kind: "zero", month: data.month }))
          }
          onHold={() => {
            const amount = window.prompt("Hold how much for next month?", "0");
            if (amount === null) return;
            const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
            if (!Number.isFinite(cents) || cents === 0) return;
            run(() =>
              budgetOperationAction({
                kind: "hold",
                month: data.month,
                amountCents: cents,
              }),
            );
          }}
          onRelease={() =>
            run(() =>
              budgetOperationAction({ kind: "release-hold", month: data.month }),
            )
          }
        />

        <BudgetSummary month={month} />

        {error ? (
          <p className="rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem] text-[var(--chart-spend)]">
            {error}
          </p>
        ) : null}

        {backlog > 0 ? <Backlog data={data} pending={pending} onRun={run} /> : null}

        <div className="flex min-h-0 min-w-0 flex-col md:flex-1">
          <DataGrid<BudgetColumnCtx, BudgetRow>
            rows={gridRows}
            columns={grid.columns}
            allColumns={budgetColumns}
            columnCtx={ctx}
            selectedId={selected}
            onSelect={setSelected}
            ariaLabel={`Budget for ${monthLabel(data.month)}`}
            empty="No envelopes yet."
            widths={grid.widths}
            onResizeColumn={grid.setWidth}
            onResetColumnWidth={grid.clearWidth}
            columnControls={grid.columnControls}
            collapsedGroups={grid.collapsedGroups}
            onToggleGroup={grid.toggleGroup}
            density={grid.density}
            rowLabel={(row) => `Envelope: ${row.node.name}`}
            groupSummary={(nodes) => {
              const group = budgetTotals(nodes.filter((node) => !node.isIncome));
              if (nodes.every((node) => node.isIncome)) return null;
              return (
                <span className="tabular flex gap-4 text-[0.75rem] text-ink-muted">
                  <span>{formatUsd(group.assignedCents)} assigned</span>
                  <span>{formatUsd(group.activityCents)} spent</span>
                  <span>{formatUsd(group.balanceCents)} left</span>
                </span>
              );
            }}
          />
        </div>

        <footer className="tabular flex flex-wrap gap-x-5 gap-y-1 rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem]">
          <span className="text-ink-muted">
            Assigned <span className="text-ink">{formatUsd(totals.assignedCents)}</span>
          </span>
          <span className="text-ink-muted">
            Spent <span className="text-ink">{formatUsd(totals.activityCents)}</span>
          </span>
          <span className="text-ink-muted">
            Left in envelopes{" "}
            <span className="text-ink">{formatUsd(totals.balanceCents)}</span>
          </span>
        </footer>
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {move ? (
        <MoveMoneyDialog
          from={move.from}
          targets={move.targets}
          onCancel={() => setMove(null)}
          onMove={(toId, cents) => {
            const target = move.targets.find((row) => row.id === toId);
            setMove(null);
            if (!target) return;
            run(() =>
              budgetOperationAction({
                kind: "transfer",
                month: data.month,
                from: { id: move.from.id, name: move.from.name },
                to: { id: target.id, name: target.name },
                amountCents: cents,
              }),
            );
          }}
        />
      ) : null}
    </div>
  );
}

function MonthBar({
  month,
  onPrev,
  onNext,
  onCopyPrevious,
  onAverage,
  onZero,
  onHold,
  onRelease,
  pending,
}: {
  month: BudgetMonth;
  onPrev: () => void;
  onNext: () => void;
  onCopyPrevious: () => void;
  onAverage: () => void;
  onZero: () => void;
  onHold: () => void;
  onRelease: () => void;
  pending: boolean;
}) {
  const button =
    "rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onPrev} className={button} title="Previous month">
        ←
      </button>
      <span className="min-w-[9rem] text-[0.9375rem] font-medium text-ink">
        {monthLabel(month.month)}
      </span>
      <button type="button" onClick={onNext} className={button} title="Next month">
        →
      </button>

      <span className="ml-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopyPrevious}
          disabled={pending}
          className={button}
        >
          Copy last month
        </button>
        <button type="button" onClick={onAverage} disabled={pending} className={button}>
          Set to 3-month average
        </button>
        <button type="button" onClick={onZero} disabled={pending} className={button}>
          Set all to zero
        </button>
        {month.bufferedCents > 0 ? (
          <button
            type="button"
            onClick={onRelease}
            disabled={pending}
            className={button}
            title="Put the held money back into this month's Ready to Assign"
          >
            Release {formatUsd(month.bufferedCents)}
          </button>
        ) : (
          <button
            type="button"
            onClick={onHold}
            disabled={pending || month.readyToAssignCents <= 0}
            className={button}
            title={
              month.readyToAssignCents <= 0
                ? "Nothing is left to hold"
                : "Keep money back so next month starts funded"
            }
          >
            Hold for next month
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The gap between the budget and the bank, stated rather than hidden.
 *
 * Ready to Assign plus every envelope balance equals the on-budget position exactly when
 * nothing since the start month is unenveloped. So this count *is* the discrepancy, and a
 * budget that did not show it would drift quietly instead of asking to be fixed.
 */
function Backlog({
  data,
  pending,
  onRun,
}: {
  data: BudgetData;
  pending: boolean;
  onRun: (work: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem]">
      <span className="text-ink">
        {data.uncategorizedCount}{" "}
        {data.uncategorizedCount === 1 ? "transaction has" : "transactions have"} no
        envelope
        {/* The backlog spans the whole budget, not the month on screen. Unqualified, it
            reads as September's when you have paged forward — and this figure is the one
            that explains the gap between the budget and the bank, so it has to say what it
            is counting. */}
        {data.settings.startMonth
          ? ` since ${monthLabel(data.settings.startMonth)}`
          : ""}
      </span>
      <span className="tabular text-ink-muted">
        {formatUsd(data.uncategorizedCents)} unaccounted for
      </span>
      <span className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            onRun(async () => {
              const result = await autoMapBudgetAction(
                data.settings.startMonth ?? data.month,
              );
              return { ok: result.ok, error: result.ok ? undefined : result.error };
            })
          }
          className="rounded border border-rule px-2 py-1 text-ink hover:bg-surface disabled:opacity-60"
        >
          Sort what can be sorted
        </button>
        <a
          href="/finances/register"
          className="rounded border border-rule px-2 py-1 text-ink hover:bg-surface"
        >
          Open Register
        </a>
      </span>
    </div>
  );
}
