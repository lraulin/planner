"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { budgetOperationAction } from "@/app/(shell)/finances/actions";
import { NavLink } from "@/components/shell/NavLink";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import {
  monthKeyOf,
  monthLabel,
  monthParamOf,
  monthShortLabel,
  nextMonthKey,
  prevMonthKey,
  type BudgetMonth,
} from "@/lib/finances/budget/envelope";
import {
  currentMonthUnderfundedGap,
  isFutureBudgetMonth,
} from "@/lib/finances/budget/assign/fromBudget";
import type { StillNeeded } from "@/lib/finances/budget/assign/plan";
import type { BudgetData } from "@/lib/finances/budget/queries";
import type { BillAnchor } from "@/lib/finances/commitments";
import { formatUsd } from "@/lib/finances/money";
import { BudgetSummary, readyToAssignTone, SummaryAction } from "./BudgetSummary";
import type { BudgetRun } from "./useBudgetRun";

/**
 * Everything above the tables: the month and its arrows, the links out, the summary with
 * its one action, and the note a future month needs.
 *
 * The month lives in the URL (`?month=`), so the arrows navigate rather than set state and
 * every other parameter on the page survives the move.
 *
 * **Two shapes** (`components/responsive.md`). On desktop this is a fixed block above the
 * page scroller. On a phone a fixed block that tall left the envelopes a strip one row high,
 * so `BudgetView` puts the header *inside* the scroller and it scrolls away with the page —
 * except for one sticky bar carrying the month arrows, Ready to Assign and its button, the
 * three things you reach for while working down the list. That bar must be a direct child of
 * the scroller to stay stuck for its whole length, which is why the phone shape returns a
 * fragment rather than a wrapper.
 */
export function BudgetHeader({
  data,
  anchors,
  month,
  paydayKey,
  stillNeeded,
  canFixThis,
  onAction,
  showHidden,
  onShowHidden,
  pending,
  run,
}: {
  data: BudgetData;
  anchors: ReadonlyMap<string, BillAnchor>;
  month: BudgetMonth;
  paydayKey: string | null;
  stillNeeded: StillNeeded;
  canFixThis: boolean;
  /** The summary's button: Fix This while Ready to Assign is negative, else Assign. */
  onAction: () => void;
  showHidden: boolean;
  onShowHidden: (next: boolean) => void;
  pending: boolean;
  run: BudgetRun;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const formatDate = useDateFormatter();
  const compact = useIsCompact();
  const isCurrentMonth = data.month === monthKeyOf(data.todayKey);
  const action = canFixThis ? "fix-this" : "assign";

  function monthHref(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", monthParamOf(key));
    return `/finances/budget?${next.toString()}`;
  }

  const onPrev = () => router.push(monthHref(prevMonthKey(data.month)));
  const onNext = () => router.push(monthHref(nextMonthKey(data.month)));
  const todayHref = isCurrentMonth ? undefined : monthHref(monthKeyOf(data.todayKey));

  const tools = (
    <MonthTools
      month={month}
      pending={pending}
      onRelease={
        month.bufferedCents > 0
          ? () =>
              run(() =>
                budgetOperationAction({
                  kind: "release-hold",
                  month: data.month,
                }),
              )
          : undefined
      }
      showHidden={showHidden}
      onShowHidden={onShowHidden}
    />
  );

  const links = (
    <>
      <NavLink className="underline" href="/finances/accounts">
        Accounts
      </NavLink>
      <NavLink className="underline" href="/finances/bills?view=due-soon">
        Due soon · next 14 days
      </NavLink>
      {isCurrentMonth && paydayKey ? (
        <span>Next payday {formatDate(paydayKey)}</span>
      ) : null}
    </>
  );

  const summary = (
    <BudgetSummary
      month={month}
      stillNeeded={stillNeeded}
      accountPoolCents={isCurrentMonth ? data.accountPoolCents : undefined}
      mismatch={data.mismatch}
      uncategorizedCount={data.uncategorizedCount}
      uncategorizedCents={data.uncategorizedCents}
      uncategorizedSinceLabel={
        data.settings.startMonth ? monthLabel(data.settings.startMonth) : undefined
      }
      action={action}
      onAction={onAction}
      headline={!compact}
    />
  );

  const futureNote = isFutureBudgetMonth(data.month, data.todayKey) ? (
    <p className="text-[0.75rem] leading-snug text-ink-muted">
      Money assigned here is a job for {monthLabel(data.month)} and leaves Ready to
      Assign now.
      {currentMonthUnderfundedGap({
        months: data.months,
        todayKey: data.todayKey,
        groups: data.groups,
        categories: data.categories,
        goals: data.goals,
        anchors,
      }) > 0
        ? " This month still has envelopes to cover — those holes are the first job."
        : ""}
    </p>
  ) : null;

  if (compact) {
    return (
      <>
        <CompactMonthBar
          month={month}
          onPrev={onPrev}
          onNext={onNext}
          action={action}
          onAction={onAction}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {todayHref ? (
            <NavLink href={todayHref} className="underline" title="Current month">
              Today
            </NavLink>
          ) : null}
          {links}
          {tools}
        </div>
        {summary}
        {futureNote}
      </>
    );
  }

  const button =
    "rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-60";

  return (
    <div className="flex shrink-0 flex-col gap-3 px-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className={button}
          title="Previous month"
        >
          ←
        </button>
        <span className="min-w-[9rem] text-[0.9375rem] font-medium text-ink">
          {monthLabel(month.month)}
        </span>
        <button type="button" onClick={onNext} className={button} title="Next month">
          →
        </button>
        {/* A URL so it opens in a new tab. */}
        {todayHref ? (
          <NavLink href={todayHref} className={button} title="Current month">
            Today
          </NavLink>
        ) : null}
        <span className="ml-auto">{tools}</span>
      </div>

      <nav className="flex flex-wrap gap-4 text-xs text-ink-muted">{links}</nav>
      {summary}
      {futureNote}
    </div>
  );
}

/**
 * The phone's sticky bar. `-mx-3 -mt-3` undo the scroller's padding so it runs edge to edge
 * and sits flush with the top before it sticks; `bg-shell` so rows do not show through.
 */
function CompactMonthBar({
  month,
  onPrev,
  onNext,
  action,
  onAction,
}: {
  month: BudgetMonth;
  onPrev: () => void;
  onNext: () => void;
  action: "assign" | "fix-this";
  onAction: () => void;
}) {
  const arrow =
    "flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded text-[1rem] text-ink active:bg-surface-raised";
  const ready = month.readyToAssignCents;

  return (
    <div className="sticky -top-3 z-30 -mx-3 -mt-3 flex items-center gap-2 border-b border-rule bg-shell py-1 pr-3 pl-1">
      <button
        type="button"
        onClick={onPrev}
        className={arrow}
        aria-label="Previous month"
      >
        ←
      </button>
      <span className="shrink-0 text-[0.9375rem] font-medium text-ink">
        {monthShortLabel(month.month)}
      </span>
      <button type="button" onClick={onNext} className={arrow} aria-label="Next month">
        →
      </button>
      <span className="ml-auto min-w-0 text-right leading-tight">
        <span
          className={`tabular block text-[1rem] font-medium ${readyToAssignTone(ready)}`}
        >
          {formatUsd(ready)}
        </span>
        <span className="block text-[0.6875rem] text-ink-muted">Ready to Assign</span>
      </span>
      <SummaryAction action={action} onAction={onAction} />
    </div>
  );
}

/** Show hidden, and Release while last month left money held. Shared by both shapes. */
function MonthTools({
  month,
  onRelease,
  pending,
  showHidden,
  onShowHidden,
}: {
  month: BudgetMonth;
  onRelease?: () => void;
  pending: boolean;
  showHidden: boolean;
  onShowHidden: (next: boolean) => void;
}) {
  return (
    <span className="flex flex-wrap gap-2">
      <label className="flex min-h-tap items-center gap-2 px-1 text-[0.8125rem] text-ink md:min-h-0">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => onShowHidden(event.target.checked)}
        />
        Show hidden
      </label>
      {onRelease && month.bufferedCents > 0 ? (
        <button
          type="button"
          onClick={onRelease}
          disabled={pending}
          className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-60 md:min-h-0"
          title="Put the leftover held money back into this month's Ready to Assign"
        >
          Release {formatUsd(month.bufferedCents)}
        </button>
      ) : null}
    </span>
  );
}
