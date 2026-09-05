"use client";
import { useId, useState, useMemo } from "react";
import Link from "next/link";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@/components/grid/columns";
import { DataGrid } from "@/components/grid/DataGrid";
import { useGridState } from "@/components/grid/useGridState";
import { useSetting } from "@/components/settings/SettingsProvider";
import { INSIGHTS_SCOPE } from "@/lib/settings/scopes";
import { WINDOW_LABELS } from "@/lib/settings/finances";
import { parseReportSettings } from "@/lib/finances/reportSettings";
import {
  spendingComparisonRows,
  sumReportActivity,
  cashMovementSummary,
  cashReportPoints,
  rankedReportSpending,
  applyReportFilters,
  completedMonthAverages,
  envelopeReportRows,
  reportMonthlySeries,
  reportRange,
  scopeCategoryIds,
  spendingContributions,
  regularIncomeContributions,
  type EnvelopeReportRow,
  type ReportEnvelope,
} from "@/lib/finances/reports";
import { effectiveFlow, rowsInRange, type DateRange } from "@/lib/finances/analytics";
import { analyzeInsights } from "@/lib/finances/insightsAnalysis";
import { cashFlowSankey } from "@/lib/finances/sankeyFlow";
import type { CarryingCost } from "@/lib/finances/dashboardQueries";
import type { StatementListRow } from "@/lib/finances/types";
import type { BudgetData } from "@/lib/finances/budget/queries";
import {
  monthKeyOf,
  monthEndKey,
  monthParamOf,
  monthKeyFromParam,
} from "@/lib/finances/budget/envelope";
import { budgetEnvelopeHref } from "@/lib/finances/registerActivity";
import { budgetEnvelopeLabel } from "@/lib/finances/budget/hierarchy";
import { reportRegisterHref, type ReportDrill } from "@/lib/finances/reportDrill";
import { formatUsd } from "@/lib/finances/money";
import { FilterSelect } from "./FilterSelect";
import { CashFlowChart } from "./CashFlowChart";
import { AssetDebtChart } from "./AssetDebtChart";
import { SankeyChart } from "./SankeyChart";
import { CarryingCostTable } from "./CarryingCostTable";
import { coverageGap } from "@/lib/finances/analytics";

type ReportCtx = { link: (ids: string[]) => string; month: string; balances: boolean };
const reportColumns: ColumnDef<ReportCtx, ReportEnvelope>[] = [
  {
    id: "name",
    label: "Envelope",
    width: "minmax(12rem,1fr)",
    compact: "primary",
    render: (row) => (
      <span className={row.node.hidden ? "text-ink-muted italic" : ""}>
        {row.node.name}
      </span>
    ),
    sortValue: (row) => row.node.name,
  },
  ...(
    [
      "spendingCents",
      "carryInCents",
      "assignedCents",
      "activityCents",
      "balanceCents",
    ] as const
  ).map((id): ColumnDef<ReportCtx, ReportEnvelope> => ({
    id,
    label: {
      spendingCents: "Spending",
      carryInCents: "Carry-in",
      assignedCents: "Assigned",
      activityCents: "Activity",
      balanceCents: "Available",
    }[id],
    width: "8rem",
    align: "right",
    compact: id === "balanceCents" ? "hidden" : "meta",
    compactText: (row) =>
      id === "carryInCents"
        ? `Available ${formatUsd(row.node.balanceCents)}`
        : `${{ spendingCents: "Spending", carryInCents: "Carry-in", assignedCents: "Assigned", activityCents: "Activity", balanceCents: "Available" }[id]} ${formatUsd(row.node[id])}`,
    sortValue: (row) => row.node[id],
    render: (row, ctx) => (
      <Link
        className="tabular text-xs underline decoration-rule underline-offset-2"
        href={
          id === "spendingCents" || id === "activityCents"
            ? ctx.link([row.id])
            : budgetEnvelopeHref(row.id, ctx.month)
        }
      >
        {formatUsd(row.node[id])}
      </Link>
    ),
  })),
];
const label =
  "min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base md:min-h-0 md:text-xs";
export function InsightsView({
  rows,
  data,
  carryingCost,
  statements,
}: {
  rows: readonly EnvelopeReportRow[];
  data: BudgetData;
  carryingCost: CarryingCost;
  statements: StatementListRow[];
}) {
  const router = useRouter();
  const titleId = useId();
  const [detailId, setDetailId] = useState<string | null>(null);
  const payees = useMemo(
    () => [
      ...new Map(
        rows
          .filter((row) => row.payeeId)
          .map((row) => [
            row.payeeId as string,
            { id: row.payeeId as string, name: row.payeeName ?? row.description },
          ]),
      ).values(),
    ],
    [rows],
  );
  const codec = useMemo(
    () => ({
      parse: (value: unknown) => parseReportSettings(value, data.categories, payees),
      serialize: (value: ReturnType<typeof parseReportSettings>) => value,
    }),
    [data.categories, payees],
  );
  const { value: view, patch } = useSetting(INSIGHTS_SCOPE, codec);
  const grid = useGridState("insights-envelopes", reportColumns, {
    order: reportColumns.map((column) => column.id),
    sorts: [{ columnId: "spendingCents", direction: "desc" }],
  });
  const details = useGridState("insights-details", [], { order: [] });
  const range = reportRange(
    view.window,
    data.todayKey,
    rows[0]?.transactionDate ?? null,
  );
  const month = view.month ?? monthKeyOf(data.todayKey);
  const balanceRange = { startKey: month, endKey: monthEndKey(month) };
  const filtered = useMemo(() => applyReportFilters(rows, view), [rows, view]);
  const comparisonRows = spendingComparisonRows(rows, view);
  const points = reportMonthlySeries(comparisonRows, view.scope, range, data.todayKey);
  const averages = completedMonthAverages(points, data.todayKey);
  const expenseIds = scopeCategoryIds(data.categories, view.scope).filter(
    (id) => !view.categoryIds.length || view.categoryIds.includes(id),
  );
  const regularIds = data.categories
    .filter((row) => row.kind === "income" && row.incomeRole === "regular")
    .map((row) => row.id);
  const windowed = filtered.filter(
    (row) =>
      row.transactionDate >= range.startKey && row.transactionDate <= range.endKey,
  );
  const spendRows = spendingContributions(windowed, view.scope);
  const incomeRows = regularIncomeContributions(
    comparisonRows.filter(
      (row) =>
        row.transactionDate >= range.startKey && row.transactionDate <= range.endKey,
    ),
  );
  const table = envelopeReportRows(data, filtered, {
    report: view.report === "balances" ? "balances" : "spending",
    month,
    range,
    scope: view.scope,
    categoryIds: view.categoryIds,
  });
  const opened = table.envelopes.find((row) => row.id === detailId);
  const uncategorized = applyReportFilters(rows, { ...view, categoryIds: [] }).filter(
    (row) =>
      row.transactionDate >= range.startKey &&
      row.transactionDate <= range.endKey &&
      row.contributesToBudget &&
      row.budgetCategoryId === null,
  );
  const drill = (
    categoryIds: string[],
    span: DateRange = range,
    overrides: Partial<ReportDrill> = {},
  ) =>
    reportRegisterHref({
      basis: "envelope",
      categoryIds,
      from: span.startKey,
      to: span.endKey,
      accountIds: view.report === "balances" ? [] : view.accountIds,
      payeeIds: view.report === "balances" ? [] : view.payeeIds,
      uncategorized: false,
      direction: "all",
      allCategories: false,
      ...overrides,
    });
  const balances = view.report === "balances";
  const columns = grid.columns.filter((column) =>
    balances
      ? column.id !== "spendingCents"
      : column.id === "name" || column.id === "spendingCents",
  );
  const cash = analyzeInsights(
    applyReportFilters(rows, {
      accountIds: view.accountIds,
      payeeIds: [],
      categoryIds: [],
    }),
    [],
    {
      range,
      today: data.todayKey,
      statements: statements.filter(
        (row) => !view.accountIds.length || view.accountIds.includes(row.accountId),
      ),
    },
  );
  const cashSummary = cashMovementSummary(windowed);
  const inflows = cashSummary.inflowCents;
  const outflows = cashSummary.outflowCents;
  const cashPoints = cash.empty ? [] : cashReportPoints(windowed, cash.flow);
  const secondaryPayees = rankedReportSpending(spendRows, data, "merchant");
  const coverage = coverageGap(rows, statements);
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-surface p-3">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-3 text-lg font-semibold">Insights</h1>
        {(
          [
            ["spending", "Spending"],
            ["balances", "Envelope balances"],
            ["cashflow", "Cash flow"],
          ] as const
        ).map(([id, title]) => (
          <button
            type="button"
            key={id}
            className={`${label} ${view.report === id ? "border-select-edge bg-select" : ""}`}
            onClick={() => patch((current) => ({ ...current, report: id }))}
          >
            {title}
          </button>
        ))}
        <Link
          className="ml-auto text-xs underline"
          href="/finances/register?view=uncategorized"
        >
          Categorize transactions
        </Link>
      </header>
      <div className="mb-3 flex flex-wrap gap-2">
        {balances ? (
          <label className="text-xs">
            Month{" "}
            <input
              type="month"
              className={label}
              value={monthParamOf(month)}
              onChange={(event) => {
                const next = monthKeyFromParam(event.target.value);
                if (next) patch((current) => ({ ...current, month: next }));
              }}
            />
          </label>
        ) : (
          <select
            aria-label="Report period"
            className={label}
            value={view.window}
            onChange={(event) =>
              patch((current) => ({
                ...current,
                window: event.target.value as typeof view.window,
              }))
            }
          >
            {Object.entries(WINDOW_LABELS).map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        )}
        {view.report === "spending" ? (
          <select
            aria-label="Spending scope"
            className={label}
            value={view.scope}
            onChange={(event) =>
              patch((current) => ({
                ...current,
                scope: event.target.value as typeof view.scope,
              }))
            }
          >
            <option value="living">Cost of living</option>
            <option value="savings">Savings</option>
            <option value="all">All spending</option>
          </select>
        ) : null}
        {!balances ? (
          <>
            <FilterSelect
              label="Accounts"
              options={[
                ...new Map(
                  rows.map((row) => [
                    row.accountId,
                    { id: row.accountId, label: row.accountName },
                  ]),
                ).values(),
              ]}
              selected={view.accountIds}
              onChange={(accountIds) =>
                patch((current) => ({ ...current, accountIds }))
              }
            />
            <FilterSelect
              label="Payees"
              options={[
                ...payees.map((row) => ({ id: row.id, label: row.name })),
                { id: "unknown", label: "Unknown payee" },
              ]}
              selected={view.payeeIds}
              onChange={(payeeIds) => patch((current) => ({ ...current, payeeIds }))}
            />
          </>
        ) : (
          <span className="self-center text-xs text-ink-muted">
            Whole envelope balances; account and payee filters do not apply.
          </span>
        )}
        <FilterSelect
          label="Envelopes"
          options={[
            ...data.categories.map((row) => ({
              id: row.id,
              label: budgetEnvelopeLabel(data.groups, row),
            })),
            ...(!balances ? [{ id: "uncategorized", label: "Uncategorized" }] : []),
          ]}
          selected={view.categoryIds}
          onChange={(categoryIds) => patch((current) => ({ ...current, categoryIds }))}
        />
      </div>
      {view.migrationWarnings.length ? (
        <p className="mb-2 text-xs text-priority-b">
          Previous name filters could not identify one record:{" "}
          {view.migrationWarnings.join(", ")}. Choose the intended IDs above.
        </p>
      ) : null}
      {view.report === "spending" ? (
        <>
          {regularIds.length === 0 ? (
            <p className="mb-2 text-xs text-priority-b">
              Choose Regular income envelopes on Budget to complete this comparison.
            </p>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-5 text-sm">
            <Link
              href={drill(expenseIds, range, {
                uncategorized:
                  view.scope === "all" &&
                  (!view.categoryIds.length ||
                    view.categoryIds.includes("uncategorized")),
              })}
            >
              Spending{" "}
              <b className="tabular">{formatUsd(-sumReportActivity(spendRows))}</b>
            </Link>
            <Link href={drill(regularIds)}>
              Actual regular income{" "}
              <b className="tabular">{formatUsd(sumReportActivity(incomeRows))}</b>
            </Link>
          </div>
          {view.scope === "savings" ? (
            <p className="mb-2 text-xs text-ink-muted">
              Purchases from Savings are reported here. Overspending depends on the
              envelope’s Available balance.
            </p>
          ) : null}
          <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]">
            <CashFlowChart
              points={points}
              axisLabel="month · actual regular income and spending"
              incomeLabel="Regular income"
              spendingLabel="Spending"
              mode="in-out"
              onSelect={(_key, startKey, endKey) =>
                router.push(
                  drill([...expenseIds, ...regularIds], {
                    startKey,
                    endKey: endKey < data.todayKey ? endKey : data.todayKey,
                  }),
                )
              }
            />
            <div className="space-y-2 text-xs">
              <h2 className="font-medium">Completed-month averages</h2>
              {averages.map((avg) => (
                <p key={avg.months} className="tabular">
                  {avg.months} months ({avg.count} available): Spending{" "}
                  {avg.spendCents === null ? "—" : formatUsd(avg.spendCents)} · Regular
                  income {avg.incomeCents === null ? "—" : formatUsd(avg.incomeCents)}
                </p>
              ))}
              <p className="border-t border-rule pt-2">
                Current month is partial and excluded from these averages.
              </p>
              {points
                .filter((point) => point.bucket.startKey === monthKeyOf(data.todayKey))
                .map((point) => (
                  <p className="tabular" key={point.bucket.key}>
                    So far: Spending {formatUsd(point.spendCents)} · Regular income{" "}
                    {formatUsd(point.incomeCents)}
                  </p>
                ))}
            </div>
          </div>
          <p className="mb-2 text-xs text-ink-muted">
            Current groups and envelope names apply to all history. Refunds reduce
            spending. Envelope filters narrow spending; regular income shares the
            account and payee filters.
          </p>
        </>
      ) : null}
      {view.report !== "cashflow" ? (
        table.beforeSetup ? (
          <p className="rounded border border-rule p-4 text-sm">
            No budget balances exist for this month. Assignments before budget setup are
            not reconstructed.
          </p>
        ) : (
          <DataGrid
            rows={table.rows}
            columns={columns}
            allColumns={reportColumns}
            columnCtx={{
              month,
              balances,
              link: (ids) => drill(ids, balances ? balanceRange : range),
            }}
            selectedId={null}
            onSelect={() => {}}
            onOpenDetail={(id) =>
              balances ? setDetailId(id) : router.push(drill([id]))
            }
            ariaLabel={balances ? "Envelope balances" : "Spending by envelope"}
            rowLabel={(row) => row.node.name}
            enableSort
            sorts={grid.sorts.filter((sort) =>
              columns.some((column) => column.id === sort.columnId),
            )}
            onSortChange={grid.toggleSort}
            onSetSort={grid.setSort}
            collapsedGroups={grid.collapsedGroups}
            onToggleGroup={grid.toggleGroup}
            density={grid.density}
            autoHeight
            groupTotals={(members) =>
              Object.fromEntries(
                columns
                  .filter((column) => column.id !== "name")
                  .map((column) => {
                    const key = column.id as
                      | "spendingCents"
                      | "carryInCents"
                      | "assignedCents"
                      | "activityCents"
                      | "balanceCents";
                    return [
                      key,
                      <Link
                        key={key}
                        href={
                          key === "spendingCents" || key === "activityCents"
                            ? drill(
                                members.map((row) => row.id),
                                balances ? balanceRange : range,
                              )
                            : `/finances/budget?month=${monthParamOf(month)}`
                        }
                        className="tabular underline decoration-rule"
                      >
                        {formatUsd(members.reduce((sum, row) => sum + row[key], 0))}
                      </Link>,
                    ];
                  }),
              )
            }
            empty="No envelopes match this report."
          />
        )
      ) : null}
      {view.report === "spending" ? (
        <>
          <div className="my-3 rounded border border-rule p-2 text-xs">
            <Link
              className="underline"
              href={drill([], range, { uncategorized: true })}
            >
              Uncategorized: {uncategorized.length} rows ·{" "}
              {formatUsd(-sumReportActivity(uncategorized))}
            </Link>
            {uncategorized.length ? (
              <span className="ml-2 text-priority-b">
                Categorize these to complete the cost-of-living report.
              </span>
            ) : null}
          </div>
          <details
            open={details.switches.payees ?? false}
            onToggle={(event) => details.setSwitch("payees", event.currentTarget.open)}
            className="rounded border border-rule p-3 text-xs"
          >
            <summary>Payee analysis</summary>
            <ol className="mt-2 space-y-1">
              {secondaryPayees.map((payee) => (
                <li key={payee.id}>
                  <Link
                    className="underline"
                    href={drill(expenseIds, range, {
                      payeeIds: [payee.id],
                      uncategorized:
                        view.scope === "all" &&
                        (!view.categoryIds.length ||
                          view.categoryIds.includes("uncategorized")),
                    })}
                  >
                    {payee.name} · {formatUsd(payee.cents)}
                  </Link>
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : null}
      {view.report === "cashflow" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-6 text-sm">
            {(
              [
                ["in", "Inflows", inflows],
                ["out", "Outflows", outflows],
                ["all", "Net movement", inflows - outflows],
              ] as const
            ).map(([direction, title, cents]) => (
              <Link
                key={direction}
                href={drill(view.categoryIds, range, {
                  basis: "cashflow",
                  direction,
                  allCategories: view.categoryIds.length === 0,
                })}
              >
                {title} <b className="tabular">{formatUsd(cents)}</b>
              </Link>
            ))}
          </div>
          <CashFlowChart
            points={cashPoints}
            axisLabel="month"
            mode="in-out"
            onSelect={(_key, startKey, endKey) =>
              router.push(
                drill(
                  view.categoryIds,
                  { startKey, endKey },
                  { basis: "cashflow", allCategories: view.categoryIds.length === 0 },
                ),
              )
            }
          />
          {!cash.empty ? (
            <>
              <h2 className="mt-3 text-sm font-medium">
                Account-position history · whole selected accounts
              </h2>
              <AssetDebtChart points={cash.assetDebt} />
              {cash.reconciliation ? (
                <p className="my-2 text-xs">
                  Recorded movement{" "}
                  {formatUsd(
                    cash.reconciliation.netCents + cash.reconciliation.externalCents,
                  )}{" "}
                  · Statement movement {formatUsd(cash.reconciliation.statementCents)} ·
                  Unexplained difference {formatUsd(cash.reconciliation.residualCents)}
                </p>
              ) : (
                <p className="my-2 text-xs text-ink-muted">
                  No statement bookends for reconciliation in this period.
                </p>
              )}
            </>
          ) : null}
          <details
            open={details.switches.sankey ?? false}
            onToggle={(event) => details.setSwitch("sankey", event.currentTarget.open)}
            className="my-2 rounded border border-rule p-3 text-xs"
          >
            <summary>Cash-flow diagram</summary>
            <p className="py-2 text-ink-muted">
              All sources join the same pool. This does not attribute purchases to a
              particular income source.
            </p>
            <SankeyChart
              model={cashFlowSankey(
                rowsInRange(filtered, range).map((row) => ({
                  ...row,
                  flowOverride:
                    effectiveFlow(row) === "external_transfer"
                      ? row.amountCents > 0
                        ? "income"
                        : "spend"
                      : row.flowOverride,
                })),
                "category",
              )}
            />
          </details>
          <details
            className="rounded border border-rule p-3 text-xs"
            open={details.switches.coverage ?? false}
            onToggle={(event) =>
              details.setSwitch("coverage", event.currentTarget.open)
            }
          >
            <summary>
              Account interest, fees and coverage · all imported statements
            </summary>
            <CarryingCostTable cost={carryingCost} />
            <p className="py-2">
              {coverage.holes.length} statement gaps · {coverage.mismatches.length}{" "}
              balance differences · {formatUsd(coverage.unitemizedCents)} unitemized
              movement
              {coverage.completeFrom
                ? ` · All accounts itemize from ${coverage.completeFrom}`
                : ""}
            </p>
            <Link className="underline" href="/finances/statements">
              Review statements
            </Link>
          </details>
        </>
      ) : null}
      <Drawer
        open={Boolean(opened)}
        onClose={() => setDetailId(null)}
        labelledBy={titleId}
      >
        <DrawerHeader
          titleId={titleId}
          title={opened?.name ?? "Envelope balance"}
          onClose={() => setDetailId(null)}
        />
        {opened ? (
          <div className="space-y-3 p-3 text-sm">
            <p>{monthParamOf(month)}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-3 tabular">
              {(
                [
                  ["Carry-in", opened.carryInCents],
                  ["Assigned", opened.assignedCents],
                  ["Activity", opened.activityCents],
                  ["Available", opened.balanceCents],
                ] as const
              ).map(([label, cents]) => (
                <div className="contents" key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <Link
                      className="underline"
                      href={
                        label === "Activity"
                          ? drill([opened.id], balanceRange)
                          : budgetEnvelopeHref(opened.id, month)
                      }
                    >
                      {formatUsd(cents)}
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              className="inline-block min-h-tap underline"
              href={budgetEnvelopeHref(opened.id, month)}
            >
              Open in Budget
            </Link>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
