"use client";

import { useMemo, useState, useTransition } from "react";
import {
  accountContributions,
  assetDebtSeries,
  baselineSplit,
  cadenceCandidates,
  cashFlow,
  coverageGap,
  debtToAssetRatio,
  effectiveCategory,
  monthBuckets,
  monthlyIncome,
  oneOffSuggestions,
  paydaysFrom,
  payPeriodBuckets,
  recurringMerchants,
  rowsInRange,
  rowsRange,
  spendByCategory,
  spendByCategoryPerBucket,
  spendByMerchant,
  spendCentsOf,
  TREND_OTHER,
  upcomingBills,
  type AnalyticsRow,
  type Bucket,
} from "@/lib/finances/analytics";
import { buildPayPeriods } from "@/lib/finances/classify/payPeriods";
import type { CarryingCost } from "@/lib/finances/dashboardQueries";
import type { DeclaredBill } from "@/lib/finances/recurringBills";
import {
  applyInsightsFilter,
  drillLabel,
  insightsFilterOptions,
  resolveInsightsRange,
  rowsForDrill,
  type InsightsDrill,
} from "@/lib/finances/insightsFilter";
import { formatUsd } from "@/lib/finances/money";
import { cashFlowSankey } from "@/lib/finances/sankeyFlow";
import { reclassifyAction } from "@/app/finances/actions";
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
  type InsightsChartMode,
  type InsightsViewSettings,
  type InsightsWindow,
} from "@/lib/settings/finances";
import { INSIGHTS_SCOPE } from "@/lib/settings/scopes";
import {
  useDateFormatter,
  useSetting,
  type SettingCodec,
} from "@/components/settings/SettingsProvider";
import { useToday } from "@/components/grid/useToday";
import { AssetDebtChart } from "./AssetDebtChart";
import { CarryingCostTable } from "./CarryingCostTable";
import { CashFlowChart } from "./CashFlowChart";
import { CategoryBars } from "./CategoryBars";
import { FilterSelect } from "./FilterSelect";
import { OneOffReview } from "./OneOffReview";
import { Panel, PanelEmpty, StatRow, StatTile } from "./Panel";
import { RankedBars } from "./RankedBars";
import { RecurringTable } from "./RecurringTable";
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
export function InsightsView({
  rows,
  carryingCost,
  unclassified,
  bills,
}: {
  rows: AnalyticsRow[];
  carryingCost: CarryingCost;
  unclassified: number;
  bills: DeclaredBill[];
}) {
  const formatDate = useDateFormatter();
  const today = useToday();
  const { value: view, patch } = useSetting(INSIGHTS_SCOPE, INSIGHTS_CODEC);
  const [reclassifyError, setReclassifyError] = useState<string | null>(null);
  const [reclassified, setReclassified] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filterOptions = useMemo(() => insightsFilterOptions(rows), [rows]);

  const analysis = useMemo(() => {
    const filtered = applyInsightsFilter(rows, insightsFilterOf(view));
    const full = rowsRange(filtered);
    if (!full) return { filtered, empty: true as const };

    const range = resolveInsightsRange(view.window, today ?? full.endKey, full);
    if (!range) return { filtered, empty: true as const };
    const windowed = rowsInRange(filtered, range);

    const paydays = paydaysFrom(filtered);
    const buckets: Bucket[] =
      view.axis === "pay-period"
        ? payPeriodBuckets(buildPayPeriods(paydays, range))
        : monthBuckets(range);

    const fullBuckets: Bucket[] =
      view.axis === "pay-period"
        ? payPeriodBuckets(buildPayPeriods(paydays, full))
        : monthBuckets(full);
    const visibleKeys = new Set(buckets.map((bucket) => bucket.key));
    const flow = cashFlow(filtered, fullBuckets, {
      levelRecurring: view.levelRecurring,
      bills,
    }).filter((point) => visibleKeys.has(point.bucket.key));

    const income = monthlyIncome(filtered, paydays, range);
    // Detection runs on the window; declared bills read their amounts from the whole
    // history, so a commitment does not vanish from the table when the window narrows.
    const recurring = recurringMerchants(windowed, bills, filtered);
    const split = baselineSplit(windowed, buckets.length, {
      levelRecurring: view.levelRecurring,
      bills: recurring,
      buckets,
    });
    const trends = spendByCategoryPerBucket(windowed, buckets);
    const assetDebt = assetDebtSeries(filtered, buckets);
    const latest = assetDebt[assetDebt.length - 1];

    return {
      empty: false as const,
      filtered,
      range,
      windowed,
      buckets,
      flow,
      split,
      income,
      categories: spendByCategory(windowed),
      payees: spendByMerchant(windowed),
      trends,
      sankey: cashFlowSankey(windowed, view.sankeyGrouping),
      recurring,
      suggestions: oneOffSuggestions(windowed, { bills }),
      // Both of these read the **whole** filtered history, not the window. The two charges
      // that make a semi-annual pattern are eight months apart, and the anchor a forecast
      // walks from is the most recent charge — a window that hides either produces a
      // confident wrong answer rather than no answer.
      candidates: cadenceCandidates(filtered),
      upcoming: upcomingBills(filtered, bills, today ?? full.endKey),
      assetDebt,
      contributions: accountContributions(filtered, range),
      debtRatio: latest ? debtToAssetRatio(latest.assetCents, latest.debtCents) : null,
      latest,
      coverage: coverageGap(rows),
      drilled: drilledRows(windowed, view.drill, trends.keys),
    };
  }, [rows, today, view, bills]);

  function setDrill(next: InsightsDrill) {
    patch((current) => ({
      ...current,
      drill: sameDrill(current.drill, next) ? null : next,
    }));
  }

  function reclassify() {
    setReclassifyError(null);
    setReclassified(null);
    startTransition(async () => {
      const result = await reclassifyAction();
      if (!result.ok) {
        setReclassifyError(result.error);
        return;
      }
      const summary = result.data;
      setReclassified(
        summary
          ? `Reclassified ${summary.scanned.toLocaleString()} rows; ${summary.updated.toLocaleString()} changed.`
          : "Reclassified.",
      );
    });
  }

  const bucketNoun = view.axis === "pay-period" ? "pay period" : "month";
  const filterActive =
    view.accounts.length + view.categories.length + view.merchants.length > 0;

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
          <button
            type="button"
            onClick={() =>
              patch((current) => ({
                ...current,
                accounts: [],
                categories: [],
                merchants: [],
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

  const { split, coverage } = analysis;
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
        <ToggleGroup
          label="Window"
          options={INSIGHTS_WINDOWS.map((option) => ({
            id: option,
            label: WINDOW_LABELS[option],
          }))}
          value={view.window}
          onChange={(next) =>
            patch((current) => ({ ...current, window: next as InsightsWindow }))
          }
        />
        <ToggleGroup
          label="Axis"
          options={INSIGHTS_AXES.map((option) => ({
            id: option,
            label: AXIS_LABELS[option],
          }))}
          value={view.axis}
          onChange={(next) =>
            patch((current) => ({ ...current, axis: next as InsightsAxis }))
          }
        />
        <ToggleGroup
          label="Chart"
          options={INSIGHTS_CHART_MODES.map((option) => ({
            id: option,
            label: CHART_MODE_LABELS[option],
          }))}
          value={view.mode}
          onChange={(next) =>
            patch((current) => ({ ...current, mode: next as InsightsChartMode }))
          }
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
                ? "What each bucket gained or lost. Above the line is money kept; below it is a shortfall covered from savings or a card."
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
              coverage.completeFrom
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
          subtitle="Top categories across the window, everything else folded into Other. Click a segment."
          actions={
            <ToggleGroup
              label="Bars"
              options={[
                { id: "stacked", label: "Stacked" },
                { id: "grouped", label: "Grouped" },
              ]}
              value={view.trendMode}
              onChange={(next) =>
                patch((current) => ({
                  ...current,
                  trendMode: next as "stacked" | "grouped",
                }))
              }
            />
          }
        >
          <SpendingTrendsChart
            keys={analysis.trends.keys}
            points={analysis.trends.points}
            mode={view.trendMode}
            onSelect={(category) => setDrill({ kind: "category", id: category })}
          />
        </Panel>

        <Panel
          title="Cash flow"
          subtitle="This period's income sources and where the money went. Thickness is amount; nothing here claims a given paycheck bought the groceries."
          actions={
            <ToggleGroup
              label="Group"
              options={[
                { id: "category", label: "Category" },
                { id: "category-merchant", label: "Category & merchant" },
              ]}
              value={view.sankeyGrouping}
              onChange={(next) =>
                patch((current) => ({
                  ...current,
                  sankeyGrouping: next as "category" | "category-merchant",
                }))
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

        {/* Full width, not half. Five columns, two of them controls, and a charge that
            carries its observed range underneath — at half width the set-aside figure fell
            off the edge and the one number you would plan against needed scrolling to. */}
        <div className="grid grid-cols-1 gap-3">
          <Panel
            title="Recurring charges"
            subtitle="Found by how little they vary, not by category, plus the cadences you declared (▸) — and priced by the year, with what to set aside each month. A range under the charge means the amount swings; the yearly figure is a projection over it."
          >
            <RecurringTable
              merchants={analysis.recurring}
              declarable={filterOptions.merchants}
            />
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
                onClick={reclassify}
                disabled={pending}
                className="min-h-tap rounded border border-rule bg-surface-raised px-3 text-[0.8125rem] text-ink disabled:opacity-50"
              >
                {pending ? "Reclassifying…" : "Reclassify"}
              </button>
            }
          >
            <ul className="flex flex-col gap-2 text-[0.8125rem] text-ink">
              {coverage.completeFrom && (
                <li>
                  Card itemization starts {formatDate(coverage.completeFrom)}.{" "}
                  {formatUsd(coverage.unitemizedCents)} of earlier spending exists only
                  as lump payments from checking, so category and merchant totals before
                  that date are incomplete by roughly that much.
                </li>
              )}
              {coverage.lateAccounts.map((account) => (
                <li key={account.accountName} className="text-ink-muted">
                  {account.accountName} starts {formatDate(account.firstSeen)}.
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
              {reclassifyError && (
                <li className="text-priority-a">{reclassifyError}</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
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

/** A small segmented control. 44px tap targets, and the current value is a real state. */
function ToggleGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.75rem] text-ink-muted">{label}</span>
      <div
        className="flex overflow-hidden rounded border border-rule"
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
            className={`min-h-tap px-2.5 text-[0.8125rem] md:min-h-0 md:py-1 ${
              option.id === value
                ? "bg-select text-ink"
                : "bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
