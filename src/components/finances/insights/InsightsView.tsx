"use client";

import { useMemo, useState, useTransition } from "react";
import {
  balanceSeries,
  baselineSplit,
  cashFlow,
  coverageGap,
  monthBuckets,
  monthlyIncome,
  oneOffSuggestions,
  paydaysFrom,
  payPeriodBuckets,
  recurringMerchants,
  rowsInRange,
  rowsRange,
  spendByCategory,
  trailingRange,
  type AnalyticsRow,
  type Bucket,
} from "@/lib/finances/analytics";
import { buildPayPeriods } from "@/lib/finances/classify/payPeriods";
import type { CarryingCost } from "@/lib/finances/dashboardQueries";
import { formatUsd } from "@/lib/finances/money";
import { reclassifyAction } from "@/app/finances/actions";
import {
  CHART_MODE_LABELS,
  INSIGHTS_AXES,
  INSIGHTS_CHART_MODES,
  INSIGHTS_WINDOWS,
  WINDOW_LABELS,
  WINDOW_MONTHS,
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
import { BalanceChart } from "./BalanceChart";
import { CarryingCostTable } from "./CarryingCostTable";
import { CashFlowChart } from "./CashFlowChart";
import { CategoryBars } from "./CategoryBars";
import { OneOffReview } from "./OneOffReview";
import { Panel, PanelEmpty, StatRow, StatTile } from "./Panel";
import { RecurringTable } from "./RecurringTable";

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
 * Every panel reads the **same** `rows` array — the whole imported history — and narrows it
 * locally. That is why the trailing average is real on the first visible bucket: the chart
 * shows a window, but the statistic behind it saw the twelve buckets before it. Windowing at
 * the query would have made the overlay null wherever anyone actually looked.
 *
 * The two toggles persist through `useSetting` rather than `useState`. A window you re-pick
 * on every visit is one you stop using, and the axis choice especially is a way of thinking,
 * not a momentary view.
 */
export function InsightsView({
  rows,
  carryingCost,
  unclassified,
}: {
  rows: AnalyticsRow[];
  carryingCost: CarryingCost;
  /** Rows a reclassify has never seen. Nonzero means the numbers below are incomplete. */
  unclassified: number;
}) {
  const formatDate = useDateFormatter();
  const { value: view, patch } = useSetting(INSIGHTS_SCOPE, INSIGHTS_CODEC);
  const [reclassifyError, setReclassifyError] = useState<string | null>(null);
  const [reclassified, setReclassified] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const analysis = useMemo(() => {
    const full = rowsRange(rows);
    if (!full) return null;

    const months = WINDOW_MONTHS[view.window];
    const range = months === null ? full : trailingRange(full.endKey, months);
    const windowed = rowsInRange(rows, range);

    // Pay periods are built from the whole history's paydays so a window that starts
    // mid-period still lands inside a real one rather than opening a stub.
    const paydays = paydaysFrom(rows);
    const buckets: Bucket[] =
      view.axis === "pay-period"
        ? payPeriodBuckets(buildPayPeriods(paydays, range))
        : monthBuckets(range);

    // Cash flow runs over the *whole* history and is sliced afterwards, which is what makes
    // the rolling average non-null at the left edge of the window.
    const fullBuckets: Bucket[] =
      view.axis === "pay-period"
        ? payPeriodBuckets(buildPayPeriods(paydays, full))
        : monthBuckets(full);
    const visibleKeys = new Set(buckets.map((bucket) => bucket.key));
    const flow = cashFlow(rows, fullBuckets, {
      levelRecurring: view.levelRecurring,
    }).filter((point) => visibleKeys.has(point.bucket.key));

    const income = monthlyIncome(rows, paydays, range);
    const split = baselineSplit(windowed, buckets.length);

    return {
      range,
      windowed,
      buckets,
      flow,
      split,
      income,
      categories: spendByCategory(windowed),
      recurring: recurringMerchants(windowed),
      suggestions: oneOffSuggestions(windowed),
      balances: balanceSeries(rows, buckets),
      coverage: coverageGap(rows),
    };
  }, [rows, view.axis, view.window, view.levelRecurring]);

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

  if (!analysis) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <PanelEmpty>
          No transactions yet. Import a CSV from the Register and the dashboard fills
          in.
        </PanelEmpty>
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
            label={`Baseline burn per ${bucketNoun}`}
            value={formatUsd(split.baselinePerBucketCents)}
            detail={`Ongoing spend only, over ${split.bucketCount} ${bucketNoun}${
              split.bucketCount === 1 ? "" : "s"
            }`}
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
            <CategoryBars totals={analysis.categories} />
          </Panel>

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
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel
            title="Recurring charges"
            subtitle="Found by how little they vary, not by category — and priced by the year."
          >
            <RecurringTable merchants={analysis.recurring} />
          </Panel>

          <Panel
            title="One-offs to review"
            subtitle="Suggestions only. An annual premium looks like a one-off to any statistic, so nothing is excluded until you say so."
          >
            <OneOffReview suggestions={analysis.suggestions} />
          </Panel>
        </div>

        <Panel
          title="Tracked balance"
          subtitle="Cash minus card debt across the imported accounts. Not net worth — no mortgage, car or retirement account is in here."
        >
          <BalanceChart points={analysis.balances} />
        </Panel>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
