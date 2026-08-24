"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  applyBudgetTemplatesAction,
  budgetOperationAction,
  setCarryoverAction,
  setRecurringBillAction,
  updateBudgetCategoryAction,
} from "@/app/finances/actions";
import type { Command } from "@/lib/commands/registry";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { ContextMenu, type MenuItem } from "@/components/grid/ContextMenu";
import { DataGrid } from "@/components/grid/DataGrid";
import { useGridState } from "@/components/grid/useGridState";
import {
  categoryMonth,
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
import {
  templateCarryIn,
  type EnvelopeApplyInput,
} from "@/lib/finances/budget/templates/apply";
import { descendantEnvelopeIds } from "@/lib/finances/budget/hierarchy";
import { formatUsd } from "@/lib/finances/money";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import { cadenceOf } from "@/lib/finances/recurringBills";
import type { BillForecast } from "@/lib/finances/dashboardQueries";
import { AssignRemainingDialog } from "./AssignRemainingDialog";
import { budgetColumns, type BudgetColumnCtx } from "./budgetColumns";
import { BudgetSummary } from "./BudgetSummary";
import { BudgetStructureDrawer } from "./BudgetStructureDrawer";
import { CommitmentPayeeDialog } from "./CommitmentPayeeDialog";
import { withScheme } from "./UrlCell";
import { ForecastDetails } from "./ForwardPanel";
import { MoveMoneyDialog } from "./MoveMoneyDialog";
import { TemplateDrawer } from "./TemplateDrawer";
import { ReviewDrawer } from "./ReviewDrawer";

/**
 * The budget, one month at a time.
 *
 * **Arranges and formats only.** Every figure arrives already folded by
 * `src/lib/finances/budget/envelope.ts`, and every clamp is applied again on the server
 * before anything is written — this component never decides how much money can move.
 */
/** Collapsed by default (D8): carried over from Commitments as a lookup, not a fixture. */
const DEFAULT_HIDDEN_COLUMNS = new Set(["annual", "monthly"]);

export function BudgetView({
  data,
  review,
  nextDueKeys,
  payees,
  forecast,
}: {
  data: BudgetData;
  /** Detected recurring merchants no envelope has claimed yet. */
  review: readonly RecurringMerchant[];
  /** Next charge per bill envelope id, from `loadBillSnapshots`. */
  nextDueKeys: ReadonlyMap<string, string>;
  /** Every payee, with its current bill/envelope claim if any — for the payees dialog. */
  payees: readonly { id: string; name: string; budgetCategoryId: string | null }[];
  /** Next 12 months and Expected vs income — collapsed-by-default reference panels (D8). */
  forecast: BillForecast;
}) {
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
  const [editing, setEditing] = useState<string | null>(null);
  const [editingPayeesFor, setEditingPayeesFor] = useState<BudgetRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [managingStructure, setManagingStructure] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const grid = useGridState("budget", budgetColumns, {
    order: budgetColumns
      .map((column) => column.id)
      .filter((id) => !DEFAULT_HIDDEN_COLUMNS.has(id)),
    switches: { "show-hidden": false },
  });
  const showHidden = grid.switches["show-hidden"] ?? false;

  const month = findMonth(data.months, data.month);
  const rows = useMemo(
    () =>
      month
        ? budgetRows(data.groups, data.categories, month, data.goals, nextDueKeys)
        : [],
    [data.groups, data.categories, month, data.goals, nextDueKeys],
  );
  const gridRows = useMemo(
    () => budgetGridRows(data.groups, rows, { showHidden }),
    [data.groups, rows, showHidden],
  );

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else router.refresh();
    });
  }

  /**
   * Carry-in is last month's balance, and a negative one only carries when the envelope is set
   * to roll overspending forward — Actual's rule, and the reason `templateCarryIn` is shared
   * with the server rather than re-derived here.
   */
  const previous = month ? findMonth(data.months, prevMonthKey(data.month)) : null;

  function envelopeInput(row: BudgetRow): EnvelopeApplyInput {
    return {
      id: row.id,
      name: row.name,
      isIncome: row.isIncome,
      kind: row.kind,
      templates: row.templates,
      assignedCents: row.assignedCents,
      carryInCents: templateCarryIn(previous ? categoryMonth(previous, row.id) : null),
    };
  }

  /**
   * Apply and Overwrite hand back per-envelope problems (a schedule that was completed, one
   * that no longer exists) alongside the count. They are shown rather than dropped: the money
   * that line would have assigned is missing from the total, and nothing else says so.
   */
  const runApply = useCallback(
    (force: boolean, categoryIds?: readonly string[]) => {
      setError(null);
      setNotice(null);
      startTransition(async () => {
        const result = await applyBudgetTemplatesAction(data.month, force, categoryIds);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const applied = result.data?.applied ?? 0;
        const problems = result.data?.errors ?? [];
        setNotice(
          [
            applied === 0
              ? "Nothing to apply — no templated envelope was eligible."
              : `${applied === 1 ? "1 envelope" : `${applied} envelopes`} filled from templates.`,
            ...problems,
          ].join(" "),
        );
        router.refresh();
      });
    },
    [data.month, router, startTransition],
  );

  function goToMonth(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", monthParamOf(key));
    router.push(`/finances/budget?${next.toString()}`);
  }

  const spendingRows = useMemo(() => rows.filter((row) => !row.isIncome), [rows]);
  const receivedThisMonthCents = useMemo(
    () =>
      rows
        .filter((row) => row.isIncome)
        .reduce((total, row) => total + row.activityCents, 0),
    [rows],
  );
  const templatedCount = useMemo(
    () => spendingRows.filter((row) => row.templates.length > 0).length,
    [spendingRows],
  );

  const commands = useMemo((): Command[] => {
    const nothingTemplated =
      templatedCount === 0
        ? "No envelope has a template yet — open an envelope's row menu to add one"
        : undefined;

    return [
      {
        id: "budget.structure.manage",
        label: "Manage groups and envelopes…",
        group: "view",
        menu: "organize",
        section: "Budget",
        keywords: "create rename delete hide group envelope category",
        run: () => setManagingStructure(true),
      },
      {
        id: "budget.review",
        label: review.length > 0 ? `Review… (${review.length})` : "Review…",
        group: "view",
        menu: "tools",
        section: "Setup",
        icon: "convert",
        keywords: "detect recurring merchant candidates bills",
        title: "Detected recurring merchants no envelope has claimed yet",
        run: () => setReviewing(true),
      },
      {
        id: "budget.templates.apply",
        label: "Apply templates",
        group: "view",
        menu: "tools",
        section: "Templates",
        keywords: "goal fill autofill",
        title:
          nothingTemplated ??
          "Fill every templated envelope whose Assigned is still zero. Leaves the rest alone.",
        disabled: templatedCount === 0,
        run: () => runApply(false),
      },
      {
        id: "budget.templates.overwrite",
        label: "Overwrite with templates",
        group: "view",
        menu: "tools",
        section: "Templates",
        keywords: "goal replace refill",
        title:
          nothingTemplated ??
          "Replace Assigned on every templated envelope, including ones you have already edited.",
        disabled: templatedCount === 0,
        run: () => runApply(true),
      },
    ];
  }, [runApply, templatedCount, review.length]);

  useRegisterCommands(commands);

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
    onPatchBill: (row, patch) => {
      if (!row.bill) return;
      run(() =>
        setRecurringBillAction({
          name: row.name,
          cadence:
            patch.cadence ??
            cadenceOf({
              cadenceMonths: row.bill!.cadenceMonths ?? 1,
              cadenceDays: row.bill!.cadenceDays,
            }),
          ...patch,
        }),
      );
    },
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
        label: "Edit templates…",
        title: row.isIncome
          ? "Income feeds Ready to Assign, so it holds no templates"
          : `What ${row.name} should ask for each month`,
        disabled: row.isIncome,
        onSelect: () => setEditing(row.id),
      },
      {
        label: "Overwrite this envelope",
        title: row.isIncome
          ? "Income feeds Ready to Assign, so it holds no templates"
          : row.templates.length === 0
            ? `${row.name} has no templates to apply`
            : `Replace ${row.name}'s Assigned with what its templates ask for`,
        disabled: row.isIncome || row.templates.length === 0,
        onSelect: () => runApply(true, [row.id]),
      },
      ...(row.bill
        ? ([
            "separator" as const,
            {
              label: "Edit payees…",
              title: "Charges from these payees belong to this bill",
              onSelect: () => setEditingPayeesFor(row),
            },
            {
              label: "Open URL",
              disabled: row.bill.url === "",
              title: row.bill.url === "" ? "No URL saved for this bill" : row.bill.url,
              onSelect: () => window.open(withScheme(row.bill!.url), "_blank"),
            },
          ] satisfies MenuItem[])
        : []),
      "separator",
      {
        label: row.hidden ? "Show envelope" : "Hide envelope",
        title: "A hidden envelope keeps its history and still counts toward the totals",
        onSelect: () =>
          run(() => updateBudgetCategoryAction(row.id, { hidden: !row.hidden })),
      },
    ];
  }

  const totals = budgetTotals(spendingRows);
  const editingRow = rows.find((row) => row.id === editing) ?? null;
  const backlog = data.uncategorizedCount;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <MonthBar
          month={month}
          onPrev={() => goToMonth(prevMonthKey(data.month))}
          onNext={() => goToMonth(nextMonthKey(data.month))}
          pending={pending}
          templatedCount={templatedCount}
          onApply={() => runApply(false)}
          onOverwrite={() => runApply(true)}
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
          showHidden={showHidden}
          onShowHidden={(next) => grid.setSwitch("show-hidden", next)}
        />

        <BudgetSummary month={month} onAssignAll={() => setAssigning(true)} />

        <div className="tabular flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem]">
          <span className="text-ink-muted">
            Income received this month{" "}
            <span className="text-ink">{formatUsd(receivedThisMonthCents)}</span>
          </span>
          <span
            className="text-ink-muted"
            title="A forecast from a typical paycheck, not money you have — Ready to Assign counts only what's received."
          >
            Expected{" "}
            <span className="text-ink">
              {formatUsd(forecast.comparison.income.monthlyCents)}
            </span>
            /mo
          </span>
        </div>

        {data.movementNotes ? (
          <details className="rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem]">
            <summary className="cursor-pointer text-ink">Movement log</summary>
            <ol className="mt-2 space-y-1 text-ink-muted">
              {data.movementNotes
                .split("\n")
                .filter(Boolean)
                .reverse()
                .map((line, index) => (
                  <li key={`${index}:${line}`}>{line}</li>
                ))}
            </ol>
          </details>
        ) : null}

        {error ? (
          <p className="rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem] text-[var(--chart-spend)]">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p
            role="status"
            className="flex items-start gap-3 rounded border border-rule bg-surface px-3 py-2 text-[0.8125rem] text-ink"
          >
            <span className="min-w-0 flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="flex-none rounded px-1 text-ink-muted hover:bg-surface-raised hover:text-ink"
            >
              ×
            </button>
          </p>
        ) : null}

        {backlog > 0 ? <Backlog data={data} /> : null}

        <div className="flex min-h-0 min-w-0 flex-col md:flex-1">
          <DataGrid<BudgetColumnCtx, BudgetRow>
            rows={gridRows}
            columns={grid.columns}
            allColumns={budgetColumns}
            columnCtx={ctx}
            selectedId={selected}
            onSelect={setSelected}
            /*
             * The same menu the Balance cell opens, reachable by right-click and — the reason it
             * is here — by long-press on a phone, where the compact row draws no Balance button
             * at all. Without it the template editor would exist only on a desktop.
             */
            rowMenu={(rowId) => {
              const row = rows.find((candidate) => candidate.id === rowId);
              return row ? balanceMenu(row) : [];
            }}
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
            groupSummary={(_nodes, header) => {
              const allIds = descendantEnvelopeIds(
                data.groups,
                data.categories,
                header.id,
              );
              const allNodes = rows.filter((row) => allIds.has(row.id));
              const group = budgetTotals(allNodes.filter((node) => !node.isIncome));
              if (allNodes.length > 0 && allNodes.every((node) => node.isIncome))
                return null;
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

        <ForecastDetails
          months={forecast.months}
          periods={forecast.periods}
          comparison={forecast.comparison}
        />
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {editingRow ? (
        <TemplateDrawer
          key={editingRow.id}
          envelope={envelopeInput(editingRow)}
          month={data.month}
          todayKey={data.todayKey}
          readyToAssignCents={month.readyToAssignCents}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
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
      {assigning ? (
        <AssignRemainingDialog
          amountCents={Math.max(0, month.readyToAssignCents)}
          envelopes={spendingRows}
          onCancel={() => setAssigning(false)}
          onAssign={(toId) => {
            const target = spendingRows.find((row) => row.id === toId);
            setAssigning(false);
            if (!target) return;
            run(() =>
              budgetOperationAction({
                kind: "assign-remaining",
                month: data.month,
                to: { id: target.id, name: target.name },
                amountCents: null,
              }),
            );
          }}
        />
      ) : null}
      {managingStructure ? (
        <BudgetStructureDrawer
          groups={data.groups}
          categories={data.categories}
          onClose={() => setManagingStructure(false)}
          onChanged={() => router.refresh()}
        />
      ) : null}
      {reviewing ? (
        <ReviewDrawer
          review={review}
          onClose={() => setReviewing(false)}
          onSaved={(message) => {
            setReviewing(false);
            setNotice(message);
            router.refresh();
          }}
        />
      ) : null}
      {editingPayeesFor ? (
        <CommitmentPayeeDialog
          commitment={{
            id: editingPayeesFor.id,
            name: editingPayeesFor.name,
            payeeIds: payees
              .filter((payee) => payee.budgetCategoryId === editingPayeesFor.id)
              .map((payee) => payee.id),
          }}
          payees={payees}
          onClose={() => setEditingPayeesFor(null)}
          onSaved={() => {
            setEditingPayeesFor(null);
            router.refresh();
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
  onApply,
  onOverwrite,
  templatedCount,
  pending,
  showHidden,
  onShowHidden,
}: {
  month: BudgetMonth;
  onPrev: () => void;
  onNext: () => void;
  onCopyPrevious: () => void;
  onAverage: () => void;
  onZero: () => void;
  onHold: () => void;
  onRelease: () => void;
  onApply: () => void;
  onOverwrite: () => void;
  /** How many spending envelopes hold templates — nothing to apply when it is zero. */
  templatedCount: number;
  pending: boolean;
  showHidden: boolean;
  onShowHidden: (next: boolean) => void;
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
        <label className="flex min-h-tap items-center gap-2 px-1 text-[0.8125rem] text-ink md:min-h-0">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(event) => onShowHidden(event.target.checked)}
          />
          Show hidden
        </label>
        {/*
         * Templates first: they are the answer to "fill this month in", and the three manual
         * fills beside them are what you reach for when no template covers the case.
         * Unavailable is disabled with the reason rather than hidden (`navigation.md`).
         */}
        <button
          type="button"
          onClick={onApply}
          disabled={pending || templatedCount === 0}
          className={button}
          title={
            templatedCount === 0
              ? "No envelope has a template yet — add one from an envelope's row menu"
              : "Fill every templated envelope whose Assigned is still zero"
          }
        >
          Apply templates
        </button>
        <button
          type="button"
          onClick={onOverwrite}
          disabled={pending || templatedCount === 0}
          className={button}
          title={
            templatedCount === 0
              ? "No envelope has a template yet — add one from an envelope's row menu"
              : "Replace Assigned on every templated envelope, including ones already edited"
          }
        >
          Overwrite with templates
        </button>
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
function Backlog({ data }: { data: BudgetData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem]">
      <a
        href="/finances/register?view=uncategorized"
        className="text-ink hover:underline"
      >
        {data.uncategorizedCount}{" "}
        {data.uncategorizedCount === 1 ? "transaction has" : "transactions have"} no
        category
        {/* The backlog spans the whole budget, not the month on screen. Unqualified, it
            reads as September's when you have paged forward — and this figure is the one
            that explains the gap between the budget and the bank, so it has to say what it
            is counting. */}
        {data.settings.startMonth
          ? ` since ${monthLabel(data.settings.startMonth)}`
          : ""}
      </a>
      <span className="tabular text-ink-muted">
        {formatUsd(data.uncategorizedCents)} unaccounted for
      </span>
      <span className="ml-auto flex gap-2">
        <a
          href="/finances/register?view=uncategorized"
          className="rounded border border-rule px-2 py-1 text-ink hover:bg-surface"
        >
          Categorize
        </a>
      </span>
    </div>
  );
}
