"use client";

import { formatUsd } from "@/lib/finances/money";
import type { PeriodResult, PeriodScorecard } from "@/lib/finances/periodResult";
import { Panel, PanelEmpty } from "../insights/Panel";

/**
 * How the last few closed pay periods went — the backward twin of Available to Spend.
 *
 * **Arranges and formats only.** Every figure arrives already computed from
 * `src/lib/finances/periodResult.ts`; nothing here decides whether a period passed, because
 * a verdict computed in a component is a verdict with no test behind it.
 *
 * The verdict shown is `selfFundedCents`, not `resultCents`. They differ exactly when the
 * reserve was raided, which is the case the panel exists to make visible — a period that
 * closed at +$200 on $500 of savings money reads as −$300 here, and says why.
 */
export function PeriodScorecardPanel({
  scorecard,
  formatDate,
}: {
  scorecard: PeriodScorecard;
  formatDate: (dateKey: string) => string;
}) {
  const { latest, history, selfFundedCount } = scorecard;

  return (
    <Panel
      title="Living within my means"
      subtitle="Each pay period after it closed, once everything owed is counted"
    >
      {latest === null ? (
        <PanelEmpty>
          No pay period has closed yet. The first result lands after your next paycheck.
        </PanelEmpty>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`tabular text-[2.25rem] leading-none font-medium ${
                latest.selfFunded ? "text-ink" : "text-[var(--chart-spend)]"
              }`}
            >
              {formatUsd(latest.selfFundedCents)}
            </span>
            <span className="text-[0.8125rem] text-ink-muted">
              {latest.selfFunded ? "covered itself" : "short"} · period ending{" "}
              {formatDate(latest.endKey)}
            </span>
          </div>

          {/* Named, not merely implied: when the raw balance and the verdict disagree, the
              reader is owed the reason rather than a number that looks wrong. */}
          {latest.unplannedSavingsCents > 0 && (
            <p className="mt-2 text-[0.8125rem] text-ink-muted">
              Closed at {formatUsd(latest.resultCents)}, but{" "}
              {formatUsd(latest.unplannedSavingsCents)} of that came out of savings:{" "}
              {latest.draws
                .map((draw) => `${draw.description} (${formatUsd(draw.centsOut)})`)
                .join(", ")}
              .
            </p>
          )}
          {latest.plannedSavingsCents > 0 && (
            <p className="mt-2 text-[0.8125rem] text-ink-muted">
              {formatUsd(latest.plannedSavingsCents)} drawn from savings as planned, and
              not counted against this period.
            </p>
          )}

          <PeriodBars history={history} formatDate={formatDate} />

          <p className="mt-2 border-t border-rule pt-2 text-[0.8125rem] text-ink-muted">
            <span className="text-ink">
              {selfFundedCount} of {history.length}
            </span>{" "}
            recent periods covered themselves without reaching into savings.
          </p>
        </>
      )}
    </Panel>
  );
}

/**
 * One bar per closed period, drawn from a shared scale so their heights are comparable.
 *
 * Bars hang below the rule when the period fell short, which is the whole reading: a row of
 * bars all above the line is the habit working, and one dropping below is the period to look
 * at. A period is never omitted for being negative.
 */
function PeriodBars({
  history,
  formatDate,
}: {
  history: readonly PeriodResult[];
  formatDate: (dateKey: string) => string;
}) {
  const peak = Math.max(
    1,
    ...history.map((result) => Math.abs(result.selfFundedCents)),
  );

  return (
    <div className="mt-3 flex items-stretch gap-2" role="list">
      {history.map((result) => {
        const share = Math.abs(result.selfFundedCents) / peak;
        // A floor, so a period that landed near zero is still a visible mark rather than
        // an empty column that reads as missing data.
        const height = `${Math.max(4, Math.round(share * 100))}%`;
        return (
          <div
            key={result.endKey}
            role="listitem"
            className="flex min-w-0 flex-1 flex-col gap-1"
            title={`${formatDate(result.startKey)} – ${formatDate(result.endKey)}: ${formatUsd(
              result.selfFundedCents,
            )}${result.selfFunded ? "" : " short"}`}
          >
            <div className="flex h-12 items-end">
              {result.selfFunded && (
                <div
                  className="w-full rounded-t-[2px] bg-[var(--chart-income)]"
                  style={{ height }}
                />
              )}
            </div>
            <div className="border-t border-rule" />
            <div className="flex h-12 items-start">
              {!result.selfFunded && (
                <div
                  className="w-full rounded-b-[2px] bg-[var(--chart-spend)]"
                  style={{ height }}
                />
              )}
            </div>
            {/* The end date, because a bar the reader cannot place on the calendar is a
                shape rather than a fact they can go and check in the register. */}
            <div className="truncate text-center text-[0.6875rem] text-ink-muted">
              {formatDate(result.endKey)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
