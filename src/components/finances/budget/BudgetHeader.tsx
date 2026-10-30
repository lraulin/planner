"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { budgetOperationAction } from "@/app/(shell)/finances/actions";
import { NavLink } from "@/components/shell/NavLink";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import {
  monthKeyOf,
  monthLabel,
  monthParamOf,
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
import { BudgetSummary } from "./BudgetSummary";
import type { BudgetRun } from "./useBudgetRun";

/**
 * Everything above the tables: the month and its arrows, the links out, the summary with
 * its one action, and the note a future month needs.
 *
 * The month lives in the URL (`?month=`), so the arrows navigate rather than set state and
 * every other parameter on the page survives the move.
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
  const isCurrentMonth = data.month === monthKeyOf(data.todayKey);

  function monthHref(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", monthParamOf(key));
    return `/finances/budget?${next.toString()}`;
  }

  function goToMonth(key: string) {
    router.push(monthHref(key));
  }

  return (
    <div className="flex shrink-0 flex-col gap-3 px-3 pt-3">
      <MonthBar
        month={month}
        onPrev={() => goToMonth(prevMonthKey(data.month))}
        onNext={() => goToMonth(nextMonthKey(data.month))}
        todayHref={isCurrentMonth ? undefined : monthHref(monthKeyOf(data.todayKey))}
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

      <nav className="flex flex-wrap gap-4 text-xs text-ink-muted">
        <NavLink className="underline" href="/finances/accounts">
          Accounts
        </NavLink>
        <NavLink className="underline" href="/finances/bills?view=due-soon">
          Due soon · next 14 days
        </NavLink>
        {isCurrentMonth && paydayKey ? (
          <span>Next payday {formatDate(paydayKey)}</span>
        ) : null}
      </nav>
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
        action={canFixThis ? "fix-this" : "assign"}
        onAction={onAction}
      />
      {isFutureBudgetMonth(data.month, data.todayKey) ? (
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
      ) : null}
    </div>
  );
}

function MonthBar({
  month,
  onPrev,
  onNext,
  todayHref,
  onRelease,
  pending,
  showHidden,
  onShowHidden,
}: {
  month: BudgetMonth;
  onPrev: () => void;
  onNext: () => void;
  /** Current month, when the bar is showing some other month. A URL so it opens in a new tab. */
  todayHref?: string;
  onRelease?: () => void;
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
      {todayHref ? (
        <NavLink href={todayHref} className={button} title="Current month">
          Today
        </NavLink>
      ) : null}

      <span className="ml-auto flex flex-wrap gap-2">
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
            className={button}
            title="Put the leftover held money back into this month's Ready to Assign"
          >
            Release {formatUsd(month.bufferedCents)}
          </button>
        ) : null}
      </span>
    </div>
  );
}
