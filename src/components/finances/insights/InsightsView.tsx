"use client";

import { useMemo, useState } from "react";
import {
  coverageGap,
  effectiveCategory,
  spendCentsOf,
  TREND_OTHER,
  typicalIncomePerBucketCents,
  type AnalyticsRow,
} from "@/lib/finances/analytics";
import type { CarryingCost } from "@/lib/finances/dashboardQueries";
import { analyzeInsights } from "@/lib/finances/insightsAnalysis";
import type { StoredBillRow } from "@/lib/finances/commitments";
import {
  unresolvedPaypalInflows,
  type PaypalResolution,
} from "@/lib/finances/paypalMatch";
import type { PaymentResolutionRow } from "@/lib/finances/queries";
import type { ReconcileStatement } from "@/lib/finances/reconcile";
import {
  drillLabel,
  insightsFilterOptions,
  rowsForDrill,
  type InsightsDrill,
} from "@/lib/finances/insightsFilter";
import { formatUsd } from "@/lib/finances/money";
import { cashFlowSankey } from "@/lib/finances/sankeyFlow";
import { RulePreviewDialog } from "@/components/finances/rules/RulePreviewDialog";
import {
  CHART_MODE_LABELS,
  INSIGHTS_AXES,
  INSIGHTS_CHART_MODES,
  INSIGHTS_WINDOWS,
  WINDOW_LABELS,
  insightsFilterOf,
  parseInsightsView,
  serializeInsightsView,
  type InsightsAxis,
  type InsightsViewSettings,
} from "@/lib/settings/finances";
import { INSIGHTS_SCOPE } from "@/lib/settings/scopes";
import {
  useDateFormatter,
  useSetting,
  type SettingCodec,
} from "@/components/settings/SettingsProvider";
import { useToday } from "@/components/grid/useToday";
import { ToolbarSegments } from "@/components/tabs/tabChrome";
import { AssetDebtChart } from "./AssetDebtChart";
import { CarryingCostTable } from "./CarryingCostTable";
import { CashFlowChart } from "./CashFlowChart";
import { CategoryBars } from "./CategoryBars";
import { FilterSelect } from "./FilterSelect";
import { OneOffReview } from "./OneOffReview";
import { Panel, PanelEmpty, StatRow, StatTile } from "./Panel";
import { RankedBars } from "./RankedBars";
import Link from "next/link";
import { SankeyChart } from "./SankeyChart";
import { SpendingTrendsChart } from "./SpendingTrendsChart";
import { TransactionAudit } from "./TransactionAudit";
import { UpcomingBills } from "./UpcomingBills";

const INSIGHTS_CODEC: SettingCodec<InsightsViewSettings> = {
  parse: parseInsightsView,
  serialize: serializeInsightsView,
};

const AXIS_LABELS: Record<InsightsAxis, string> = {
  month: "Months",
  "pay-period": "Pay periods",
};

/**
 * The Finances insights dashboard.
 *
 * Filters narrow the whole history first. Windowing and the trailing average then run on
 * that filtered set, so a grocery-only view does not mix in everyone else's average.
 * The coverage gap still reads the unfiltered import — it is a fact about the feed, not
 * about the current slice.
 */
function asPaypalResolutions(
  rows: readonly PaymentResolutionRow[],
): PaypalResolution[] {
  return rows.flatMap((row) => {
    if (row.direction !== "in" && row.direction !== "out") return [];
    return [
      {
        externalId: row.externalId,
        date: row.transactionDate,
        amountCents: row.amountCents,
        counterparty: row.counterparty,
        direction: row.direction,
      },
    ];
  });
}

export function InsightsView({
  rows,
  carryingCost,
  unclassified,
  bills,
  statements = [],
  resolutions = [],
}: {
  rows: AnalyticsRow[];
  carryingCost: CarryingCost;
  unclassified: number;
  bills: StoredBillRow[];
  statements?: readonly ReconcileStatement[];
  resolutions?: readonly PaymentResolutionRow[];
}) {
  const formatDate = useDateFormatter();
  const today = useToday();
  // Which declarations the dashboard holds money back for. Passed alongside the analysis
  // rather than folded into `RecurringMerchant`, so `analytics.ts` stays unaware that
  // budgeting exists — it costs a year of a bill, and what to do about that is not its call.

  const { value: view, patch } = useSetting(INSIGHTS_SCOPE, INSIGHTS_CODEC);
  const [reclassified, setReclassified] = useState<string | null>(null);
  const [previewingRules, setPreviewingRules] = useState(false);

  const filterOptions = useMemo(() => insightsFilterOptions(rows), [rows]);
  const unresolvedPaypal = useMemo(
    () => unresolvedPaypalInflows(rows, asPaypalResolutions(resolutions)),
    [rows, resolutions],
  );

  const analysis = useMemo(() => {
    const core = analyzeInsights(rows, bills, {
      filter: insightsFilterOf(view),
      window: view.window,
      axis: view.axis,
      levelRecurring: view.levelRecurring,
      today,
      statements,
      suppressPayeeIds: bills.flatMap((bill) => bill.payees.map((payee) => payee.id)),
    });
    if (core.empty) return core;
    return {
      ...core,
      sankey: cashFlowSankey(core.windowed, view.sankeyGrouping),
      coverage: coverageGap(rows, statements),
      drilled: drilledRows(core.windowed, view.drill, core.trends.keys),
    };
  }, [rows, today, view, bills, statements]);

  function setDrill(next: InsightsDrill) {
    patch((current) => ({
      ...current,
      drill: sameDrill(current.drill, next) ? null : next,
    }));
  }

  const bucketNoun = view.axis === "pay-period" ? "pay period" : "month";
  const filterActive =
    view.accounts.length +
      view.categories.length +
      view.merchants.length +
      view.tags.length >
    0;

  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <PanelEmpty>
          No transactions yet. Import a CSV from the Register and the dashboard fills
          in.
        </PanelEmpty>
      </div>
    );
  }

  if (analysis.empty) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-surface-raised px-3 py-2">
          <FilterSelect
            label="Accounts"
            options={filterOptions.accounts.map((account) => ({
              id: account.id,
              label: account.name,
            }))}
            selected={view.accounts}
            onChange={(accounts) => patch((current) => ({ ...current, accounts }))}
          />
          <FilterSelect
            label="Categories"
            options={filterOptions.categories.map((category) => ({
              id: category,
              label: category,
            }))}
            selected={view.categories}
            onChange={(categories) => patch((current) => ({ ...current, categories }))}
          />
          <FilterSelect
            label="Merchants"
            options={filterOptions.merchants.map((merchant) => ({
              id: merchant,
              label: merchant,
            }))}
            selected={view.merchants}
            onChange={(merchants) => patch((current) => ({ ...current, merchants }))}
          />
          <FilterSelect
            label="Tags"
            options={filterOptions.tags.map((tag) => ({ id: tag, label: `#${tag}` }))}
            selected={view.tags}
            onChange={(tags) => patch((current) => ({ ...current, tags }))}
          />
          <button
            type="button"
            onClick={() =>
              patch((current) => ({
                ...current,
                accounts: [],
                categories: [],
                merchants: [],
                tags: [],
              }))
            }
            className="min-h-tap text-[0.75rem] text-ink-muted hover:text-ink md:min-h-0"
          >
            Clear filters
          </button>
        </div>
        <div className="p-3">
          <PanelEmpty>Nothing matches these filters.</PanelEmpty>
        </div>
      </div>
    );
  }

  const { split, coverage, reconciliation } = analysis;
  const incomePerBucket = typicalIncomePerBucketCents(analysis.income, view.axis);
  const netPerBucket =
    analysis.buckets.length > 0
      ? Math.round(
          analysis.flow.reduce((total, point) => total + point.netCents, 0) /
            Math.max(1, analysis.flow.length),
        )
      : 0;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-surface-raised px-3 py-2">
        <ToolbarSegments
          label="Window"
          options={INSIGHTS_WINDOWS.map((option) => ({
            value: option,
            label: WINDOW_LABELS[option],
          }))}
          value={view.window}
          onChange={(next) => patch((current) => ({ ...current, window: next }))}
        />
        <ToolbarSegments
          label="Axis"
          options={INSIGHTS_AXES.map((option) => ({
            value: option,
            label: AXIS_LABELS[option],
          }))}
          value={view.axis}
          onChange={(next) => patch((current) => ({ ...current, axis: next }))}
        />
        <ToolbarSegments
          label="Chart"
          options={INSIGHTS_CHART_MODES.map((option) => ({
            value: option,
            label: CHART_MODE_LABELS[option],
          }))}
          value={view.mode}
          onChange={(next) => patch((current) => ({ ...current, mode: next }))}
        />
        <FilterSelect
          label="Accounts"
          options={filterOptions.accounts.map((account) => ({
            id: account.id,
            label: account.name,
          }))}
          selected={view.accounts}
          onChange={(accounts) => patch((current) => ({ ...current, accounts }))}
        />
        <FilterSelect
          label="Categories"
          options={filterOptions.categories.map((category) => ({
            id: category,
            label: category,
          }))}
          selected={view.categories}
          onChange={(categories) => patch((current) => ({ ...current, categories }))}
        />
        <FilterSelect
          label="Merchants"
          options={filterOptions.merchants.map((merchant) => ({
            id: merchant,
            label: merchant,
          }))}
          selected={view.merchants}
          onChange={(merchants) => patch((current) => ({ ...current, merchants }))}
        />
        <FilterSelect
          label="Tags"
          options={filterOptions.tags.map((tag) => ({ id: tag, label: `#${tag}` }))}
          selected={view.tags}
          onChange={(tags) => patch((current) => ({ ...current, tags }))}
        />
        <label className="flex min-h-tap cursor-pointer items-center gap-1.5 text-[0.75rem] text-ink-muted md:min-h-0">
          <input
            type="checkbox"
            checked={view.levelRecurring}
            onChange={(event) =>
              patch((current) => ({
                ...current,
                levelRecurring: event.target.checked,
              }))
            }
            className="size-4"
          />
          Level bills
        </label>
        {filterActive && (
          <button
            type="button"
            onClick={() =>
              patch((current) => ({
                ...current,
                accounts: [],
                categories: [],
                merchants: [],
                tags: [],
              }))
            }
            className="min-h-tap text-[0.75rem] text-ink-muted hover:text-ink md:min-h-0"
          >
            Clear filters
          </button>
        )}
        <span className="text-[0.75rem] text-ink-muted">
          {formatDate(analysis.range.startKey)} – {formatDate(analysis.range.endKey)}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <StatRow>
          <StatTile
            label="Monthly income"
            value={formatUsd(analysis.income.totalMonthlyCents)}
            detail={
              analysis.income.paydayCount === 0
                ? "No paycheck series detected in this window"
                : analysis.income.otherMonthlyCents === 0
                  ? `Median paycheck ${formatUsd(analysis.income.medianPaycheckCents)} × 26 ÷ 12`
                  : `${formatUsd(analysis.income.paycheckMonthlyCents)} from pay (median ${formatUsd(
                      analysis.income.medianPaycheckCents,
                    )} × 26 ÷ 12) plus ${formatUsd(analysis.income.otherMonthlyCents)} a month of other reliable income`
            }
            tone="income"
          />
          <StatTile
            label={`Baseline burn per ${bucketNoun}${split.levelled ? " (levelled)" : ""}`}
            value={formatUsd(split.baselinePerBucketCents)}
            detail={
              split.levelled
                ? `Ongoing spend over ${split.bucketCount} ${bucketNoun}${
                    split.bucketCount === 1 ? "" : "s"
                  }, with bills accrued at their cadence — ${formatUsd(
                    Math.round(split.billsCents / Math.max(1, split.bucketCount)),
                  )} a ${bucketNoun} of them, whether or not a charge landed here. Untick "Level bills" for what actually posted.`
                : `Ongoing spend only, as posted, over ${split.bucketCount} ${bucketNoun}${
                    split.bucketCount === 1 ? "" : "s"
                  }. A semi-annual bill lands whole in its own ${bucketNoun}; tick "Level bills" to spread it.`
            }
            tone="spend"
          />
          <StatTile
            label="One-off spend"
            value={formatUsd(split.oneOffCents)}
            detail={
              split.events.length > 0
                ? `${split.events.length} named ${split.events.length === 1 ? "event" : "events"}`
                : "Nothing excluded from the baseline yet"
            }
          />
          <StatTile
            label={`Average net per ${bucketNoun}`}
            value={formatUsd(netPerBucket)}
            detail="Money in minus money out, transfers excluded"
            tone={netPerBucket < 0 ? "spend" : "income"}
          />
        </StatRow>

        <Panel
          title={
            view.mode === "net"
              ? `Net cash flow by ${bucketNoun}`
              : view.mode === "fixed-variable"
                ? `Bills and everything else by ${bucketNoun}`
                : `Money in and out by ${bucketNoun}`
          }
          subtitle={
            view.levelRecurring
              ? `Recurring bills are spread across the ${bucketNoun}s they cover, so one monthly charge cannot swamp a single ${bucketNoun}. A bar is then an ongoing obligation rather than a record of that ${bucketNoun}: nothing is created or lost, though a bill straddling the window edge shifts the visible total a little.`
              : view.mode === "net"
                ? "Bars are transaction net — earned minus spent, transfers out. The dotted line is money crossing the boundary of these accounts: refunds, reimbursements, liquidations, gifts. It funds a month without being earned, so it sits outside net rather than in it. The dashed line is the change in statement-anchored household position, and the three reconcile: net + external = statement, give or take a residual."
                : view.mode === "fixed-variable"
                  ? "The out bar split into recurring bills and everything else — the half that is actually a decision each period."
                  : view.axis === "month"
                    ? "Calendar months. A month holding three paychecks looks rich and the next looks broke — switch the axis to pay periods to remove that."
                    : "One bucket per paycheck, so two stretches of a biweekly year are comparable."
          }
        >
          <CashFlowChart
            points={analysis.flow}
            axisLabel={bucketNoun}
            mode={view.mode}
            selectedKey={view.drill?.kind === "bucket" ? view.drill.startKey : null}
            onSelect={(_key, startKey, endKey) =>
              setDrill({ kind: "bucket", startKey, endKey })
            }
          />
          {reconciliation !== null && (
            <p className="mt-2 text-[0.75rem] text-ink-muted">
              Across this window: net {formatUsd(reconciliation.netCents)} + external{" "}
              {formatUsd(reconciliation.externalCents)} ={" "}
              {formatUsd(reconciliation.netCents + reconciliation.externalCents)},
              against {formatUsd(reconciliation.statementCents)} of statement-anchored
              movement —{" "}
              {reconciliation.residualCents === 0
                ? "an exact reconciliation."
                : `a residual of ${formatUsd(reconciliation.residualCents)}, which is what no imported row accounts for.`}
              {view.levelRecurring
                ? " Counted from the rows as they posted, so it does not match the levelled bars above."
                : ""}
            </p>
          )}
        </Panel>

        <Panel
          title="The rows behind the figure"
          subtitle="Click a bar, a stack, a Sankey node or a payee. This list is that number, so it can be audited."
        >
          <TransactionAudit
            rows={analysis.drilled}
            title={view.drill ? drillLabel(view.drill) : "Everything in the window"}
            onClear={
              view.drill
                ? () => patch((current) => ({ ...current, drill: null }))
                : undefined
            }
          />
        </Panel>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel
            title="Where it went"
            subtitle={
              coverage.holes.length > 0
                ? `${coverage.holes.length} statement hole${coverage.holes.length === 1 ? "" : "s"} — category totals skip those dates.`
                : coverage.completeFrom
                  ? `Complete from ${formatDate(coverage.completeFrom)}. Before then ${formatUsd(
                      coverage.unitemizedCents,
                    )} exists only as lump card payments, so it cannot appear here.`
                  : "Spending by category over the window."
            }
          >
            <CategoryBars
              totals={analysis.categories}
              selected={view.drill?.kind === "category" ? view.drill.id : null}
              onSelect={(category) => setDrill({ kind: "category", id: category })}
            />
          </Panel>

          <Panel
            title="Top payees"
            subtitle="Who was paid, ranked the same way as the categories — length, not angle."
          >
            <RankedBars
              items={analysis.payees.map((entry) => ({
                key: entry.merchant,
                label: entry.merchant,
                cents: entry.cents,
                share: entry.share,
              }))}
              selected={view.drill?.kind === "merchant" ? view.drill.id : null}
              onSelect={(merchant) => setDrill({ kind: "merchant", id: merchant })}
              restNoun="smaller payees"
              empty="No payees in this window."
            />
          </Panel>
        </div>

        <Panel
          title={`Spending trends by ${bucketNoun}`}
          subtitle={
            incomePerBucket > 0
              ? `Top categories across the window, everything else folded into Other. The red line is typical income for a ${bucketNoun}. Click a segment.`
              : "Top categories across the window, everything else folded into Other. Click a segment."
          }
          actions={
            <ToolbarSegments
              label="Bars"
              options={[
                { value: "stacked", label: "Stacked" },
                { value: "grouped", label: "Grouped" },
              ]}
              value={view.trendMode}
              onChange={(next) => patch((current) => ({ ...current, trendMode: next }))}
            />
          }
        >
          <SpendingTrendsChart
            keys={analysis.trends.keys}
            points={analysis.trends.points}
            mode={view.trendMode}
            incomeCents={incomePerBucket}
            onSelect={(category) => setDrill({ kind: "category", id: category })}
          />
        </Panel>

        <Panel
          title="Cash flow"
          subtitle="This period's income sources and where the money went. Thickness is amount; nothing here claims a given paycheck bought the groceries."
          actions={
            <ToolbarSegments
              label="Group"
              options={[
                { value: "category", label: "Category" },
                { value: "category-merchant", label: "Category & merchant" },
              ]}
              value={view.sankeyGrouping}
              onChange={(next) =>
                patch((current) => ({ ...current, sankeyGrouping: next }))
              }
            />
          }
        >
          <SankeyChart model={analysis.sankey} onSelect={setDrill} />
        </Panel>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel
            title="Baseline vs one-off"
            subtitle="Two numbers, never blended: an average that folds in a wedding answers a question nobody asked."
          >
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="Baseline"
                  value={formatUsd(split.baselineCents)}
                  tone="spend"
                />
                <StatTile label="One-off" value={formatUsd(split.oneOffCents)} />
              </div>
              {split.events.length === 0 ? (
                <PanelEmpty>
                  Nothing is excluded yet. Confirm a suggestion below to name an event.
                </PanelEmpty>
              ) : (
                <ul className="flex flex-col divide-y divide-rule text-[0.8125rem]">
                  {split.events.map((event) => (
                    <li
                      key={event.label}
                      className="flex items-baseline justify-between gap-2 py-1"
                    >
                      <span className="min-w-0 truncate text-ink">{event.label}</span>
                      <span className="flex-none text-[0.75rem] text-ink-muted">
                        {event.count} {event.count === 1 ? "charge" : "charges"}
                      </span>
                      <span className="tabular flex-none text-ink">
                        {formatUsd(event.cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel
            title="Cash vs card debt"
            subtitle="Cash minus card debt across the imported accounts. Not net worth — no mortgage, car or unimported retirement account is in here."
          >
            <div className="flex flex-col gap-3">
              <StatRow>
                <StatTile
                  label="Assets"
                  value={formatUsd(analysis.latest?.assetCents ?? 0)}
                  tone="income"
                />
                <StatTile
                  label="Debt"
                  value={formatUsd(analysis.latest?.debtCents ?? 0)}
                  tone="spend"
                />
                <StatTile
                  label="Debt-to-asset"
                  value={
                    analysis.debtRatio === null
                      ? "—"
                      : `${Math.round(analysis.debtRatio * 100)}%`
                  }
                />
              </StatRow>
              <AssetDebtChart
                points={analysis.assetDebt}
                onSelect={(startKey, endKey) =>
                  setDrill({ kind: "bucket", startKey, endKey })
                }
              />
              <ul className="flex flex-col divide-y divide-rule text-[0.8125rem]">
                {analysis.contributions.map((entry) => (
                  <li key={entry.accountId}>
                    <button
                      type="button"
                      onClick={() => setDrill({ kind: "account", id: entry.accountId })}
                      className={`flex w-full min-h-tap items-baseline justify-between gap-2 py-1 text-left md:min-h-0 ${
                        view.drill?.kind === "account" &&
                        view.drill.id === entry.accountId
                          ? "bg-select"
                          : ""
                      }`}
                    >
                      <span className="min-w-0 truncate text-ink">
                        {entry.accountName}
                      </span>
                      <span className="tabular flex-none text-ink-muted">
                        {formatUsd(entry.changeCents)}
                      </span>
                      <span className="tabular flex-none text-ink">
                        {formatUsd(entry.endCents)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Panel
            title="Recurring charges"
            subtitle="Detection still runs here so the cash-flow chart can level bills. Curation — track, edit, dismiss — lives on Commitments."
          >
            {(() => {
              const open = analysis.recurring.filter((entry) => !entry.declared).length;
              const declared = analysis.recurring.filter(
                (entry) => entry.declared,
              ).length;
              return (
                <p className="text-[0.8125rem] text-ink">
                  {open > 0 ? (
                    <>
                      {open} detected {open === 1 ? "charge" : "charges"} to review on{" "}
                      <Link href="/finances/budget">Budget</Link>
                      {declared > 0 && ` · ${declared} already tracked`}.
                    </>
                  ) : declared > 0 ? (
                    <>
                      {declared} tracked on <Link href="/finances/budget">Budget</Link>.
                      Nothing new to review.
                    </>
                  ) : (
                    <>
                      Nothing in this window looks regular enough to review.{" "}
                      <Link href="/finances/budget">Budget</Link> is where declarations
                      live.
                    </>
                  )}
                </p>
              );
            })()}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel
            title="One-offs to review"
            subtitle="Suggestions only. An annual premium looks like a one-off to any statistic, so nothing is excluded until you say so — and if it is a bill, say that instead."
          >
            <OneOffReview
              suggestions={analysis.suggestions}
              candidates={analysis.candidates}
            />
          </Panel>

          <Panel
            title="Upcoming bills"
            subtitle="Projected from the last charge on file, for the cadences you declared. Nothing here reconciles against the charge that arrives — a bill still listed after its date means the import is behind, not that money went missing."
          >
            <UpcomingBills bills={analysis.upcoming} />
          </Panel>

          <Panel
            title="What the accounts cost"
            subtitle="Interest and fees as the statements state them, not as the register infers them."
          >
            <CarryingCostTable cost={carryingCost} />
          </Panel>

          <Panel
            title="What this dashboard cannot see"
            subtitle="Every figure above is only as honest as the rows behind it."
            actions={
              <button
                type="button"
                onClick={() => setPreviewingRules(true)}
                className="min-h-tap rounded border border-rule bg-surface-raised px-3 text-[0.8125rem] text-ink disabled:opacity-50"
              >
                Run rules…
              </button>
            }
          >
            <ul className="flex flex-col gap-2 text-[0.8125rem] text-ink">
              {coverage.holes.map((hole) => (
                <li key={`${hole.accountId}:${hole.afterPeriodEnd}`}>
                  {hole.accountName} has no statement after{" "}
                  {formatDate(hole.afterPeriodEnd)} until{" "}
                  {formatDate(hole.beforePeriodStart)}. Official close moved{" "}
                  {formatUsd(hole.discontinuityCents)} across the gap, so cash-flow and
                  category charts skip that stretch.
                </li>
              ))}
              {coverage.mismatches.map((mismatch) => (
                <li key={mismatch.accountId} className="text-priority-a">
                  {mismatch.accountName} headlines{" "}
                  {formatUsd(mismatch.anchoredBalanceCents)} from its latest statement,
                  but the ledger sums to {formatUsd(mismatch.ledgerBalanceCents)}.
                </li>
              ))}
              {coverage.completeFrom && coverage.unitemizedCents > 0 && (
                <li>
                  Some accounts start {formatDate(coverage.completeFrom)}.{" "}
                  {formatUsd(coverage.unitemizedCents)} of unpaired payments before then
                  (or inside a hole) stand in for spending the register cannot itemize.
                </li>
              )}
              {coverage.lateAccounts.map((account) => (
                <li key={account.accountName} className="text-ink-muted">
                  {account.accountName} starts {formatDate(account.firstSeen)}.
                </li>
              ))}
              {unresolvedPaypal.map((entry) => (
                <li key={entry.rowId}>
                  PayPal deposit {formatUsd(entry.amountCents)} on{" "}
                  {formatDate(entry.date)} is unresolved: {entry.reason}.
                </li>
              ))}
              <li
                className={
                  unclassified > 0 ? "text-[var(--chart-spend)]" : "text-ink-muted"
                }
              >
                {unclassified > 0
                  ? `${unclassified.toLocaleString()} rows have never been classified — reclassify to fold them in.`
                  : "Every row has been classified."}
              </li>
              {reclassified && <li className="text-ink-muted">{reclassified}</li>}
            </ul>
          </Panel>
        </div>
      </div>
      {previewingRules ? (
        <RulePreviewDialog
          onClose={() => setPreviewingRules(false)}
          onRan={(message) => {
            setPreviewingRules(false);
            setReclassified(message);
          }}
        />
      ) : null}
    </div>
  );
}

function sameDrill(left: InsightsDrill | null, right: InsightsDrill): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function drilledRows(
  rows: AnalyticsRow[],
  drill: InsightsDrill | null,
  trendKeys: string[],
): AnalyticsRow[] {
  if (drill?.kind === "category" && drill.id === TREND_OTHER) {
    const named = new Set(trendKeys.filter((key) => key !== TREND_OTHER));
    return rows.filter(
      (row) => spendCentsOf(row) !== 0 && !named.has(effectiveCategory(row)),
    );
  }
  return rowsForDrill(rows, drill);
}
