/**
 * Cash position and the payday series — what is actually held right now, and when the next
 * paycheck lands.
 *
 * **The Available to Spend headline and its set-aside accrual were retired by
 * `agent-os/specs/2026-08-23-2313-one-budget/` D5.** Ready to Assign
 * (`src/lib/finances/budget/envelope.ts`) is now the one spendable-money figure; a bill
 * envelope's own balance says whether it is funded, which is a per-bill answer instead of one
 * collapsed number. What survives here is genuinely independent of commitments: cash position
 * (checking + savings + cash − card debt) and the detected payday series, both still read by
 * the Dashboard and by budget income reporting.
 *
 * **Sign convention, inherited and load-bearing:** positive is money *into* the account, for
 * every account kind (`src/db/schema.ts`, `finance_transactions`). A credit card is simply a
 * liability whose balance runs negative. That is why nothing below branches on kind to decide
 * a sign — kind only ever chooses which accounts are in the sum. A `Math.abs` or a unary minus
 * anywhere in this file would be a bug.
 *
 * **Pure, and takes `todayKey`.** No database import, no `new Date()`. "Today" is the reader's
 * local wall-clock day and comes from `useToday()` in the view; a server-derived today would
 * make the day count depend on the deploy region's `TZ`
 * (`agent-os/standards/development/dates.md`, rule 8). All month arithmetic runs on
 * `YYYY-MM-DD` parts.
 */

import type { FinanceAccountKind } from "@/db/schema";
import { daysBetweenKeys, shiftDateKey } from "@/lib/schedule/geometry";
import { BIWEEKLY_DAYS, type Payday } from "./classify/income";
import { formatUsd } from "./money";
import { cadenceDaysApprox, type Cadence } from "./recurringBills";

/**
 * Kinds whose balance is money you could spend this fortnight without a decision.
 *
 * Exported because `periodResult.ts` measures the same wallet looking backward, and two
 * copies of "what counts as spendable" would let the forward and backward figures on one
 * page disagree about which accounts they describe.
 */
export const SPENDABLE_KINDS: ReadonlySet<FinanceAccountKind> = new Set([
  "checking",
  "cash",
]);

/** Kinds held in reserve — real money, deliberately outside the spendable figure. */
export const SAVINGS_KINDS: ReadonlySet<FinanceAccountKind> = new Set(["savings"]);

/**
 * What the arithmetic needs from an account. A structural subset of `FinanceAccountRow`, so
 * the query layer's own type satisfies it and this module still imports nothing from the
 * database.
 */
export type DashboardAccount = {
  id: string;
  name: string;
  kind: FinanceAccountKind;
  /** The headline balance: synced > statement-anchored > ledger sum. */
  balanceCents: number;
  /**
   * When a live feed last reported this balance, or null for an account with no bank link.
   *
   * **This is what made Available to Spend correct**, not merely informative, before that
   * headline was retired — see the pending rule that used to live here.
   */
  syncedBalanceAsOf: Date | null;
};

/** A pending row, as the dashboard needs it. Signed in module convention. */
export type PendingRow = {
  accountId: string;
  amountCents: number;
};

export type AccountBalanceView = {
  /** Posted headline plus pending, when pending sits on top of a synced balance. */
  workingCents: number;
  /** The headline: synced posted, or statement/ledger (already includes pending). */
  postedCents: number;
  pendingCents: number;
};

/**
 * What one account should show: the working figure, and the posted figure when they differ.
 *
 * Pending is added only on a synced headline, the same trap Available to Spend used to
 * guard against before it was retired.
 * A statement or ledger balance already contains every pending row.
 */
export function accountBalanceView(
  account: DashboardAccount,
  pending: readonly PendingRow[],
): AccountBalanceView {
  const postedCents = account.balanceCents;
  const pendingCents =
    account.syncedBalanceAsOf === null
      ? 0
      : pending
          .filter((row) => row.accountId === account.id)
          .reduce((total, row) => total + row.amountCents, 0);
  return {
    workingCents: postedCents + pendingCents,
    postedCents,
    pendingCents,
  };
}

/** Hover text for an account row: the current figure, and the posted split when they differ. */
export function accountBalanceTooltip(view: AccountBalanceView): string {
  if (view.pendingCents === 0) {
    return `Current balance ${formatUsd(view.workingCents)}`;
  }
  return `Current balance ${formatUsd(view.workingCents)} (${formatUsd(view.postedCents)} posted + ${formatUsd(view.pendingCents)} pending)`;
}

/**
 * A posted charge against a declared bill, used to decide whether this period is already paid.
 *
 * Keyed by the **commitment's name**, not the bank's merchant string: the caller has already
 * resolved it through the matcher index, which is what lets a bill covering two bank spellings
 * arrive here as one series rather than two that each look half-paid.
 */
export type BillCharge = {
  name: string;
  /** `YYYY-MM-DD`. */
  dateKey: string;
  /**
   * Positive cost of the charge, when the caller has it. Used for the observed amount
   * range on a swingy bill. Accrual itself only needs the date.
   */
  costCents?: number;
};

export type CashPosition = {
  /** Checking and cash. */
  spendableCents: number;
  savingsCents: number;
  /** Signed and negative when money is owed, like every other figure here. */
  cardDebtCents: number;
  /** `spendable + savings + cardDebt`. The "true net" of what is actually held. */
  netCents: number;
};

/**
 * Checking + savings + cash − what the cards owe.
 *
 * Deliberately **not** `assetDebtAt()` in `analytics.ts`, which folds in investment and loan
 * accounts. That one answers "what am I worth", tracked over time; this answers "what do I
 * hold right now", which is a different question and a different set of accounts. Keeping them
 * separate is what stops a mortgage from swamping a figure about groceries.
 */
export function cashPosition(accounts: readonly DashboardAccount[]): CashPosition {
  let spendableCents = 0;
  let savingsCents = 0;
  let cardDebtCents = 0;

  for (const account of accounts) {
    if (SPENDABLE_KINDS.has(account.kind)) spendableCents += account.balanceCents;
    else if (SAVINGS_KINDS.has(account.kind)) savingsCents += account.balanceCents;
    else if (account.kind === "credit_card") cardDebtCents += account.balanceCents;
  }

  return {
    spendableCents,
    savingsCents,
    cardDebtCents,
    netCents: spendableCents + savingsCents + cardDebtCents,
  };
}

export type PaydaySource = "detected" | "override" | "unknown";

export type NextPayday = {
  /** `YYYY-MM-DD`, or null when there is nothing to project from. */
  dateKey: string | null;
  /** Whole days from `todayKey`. Zero means payday is today. Null with no date. */
  daysAway: number | null;
  /**
   * Where the date came from. Rendered, always: a projected date reads as knowledge however it
   * is captioned, and the reader is owed the difference between "your bank says so" and "we
   * guessed from a pattern" (`agent-os/specs/2026-08-14-1104-unscheduled-bills/`).
   */
  source: PaydaySource;
};

/** A user-supplied correction to the detected series. Both fields or neither. */
export type PaydayOverride = {
  /** A `YYYY-MM-DD` that was, or will be, a payday. */
  anchorDate: string | null;
  cadenceDays: number | null;
};

/**
 * Bound on the forward walk. Long enough to cross any real gap between an anchor and today —
 * a decade of fortnights — and short enough that a corrupt anchor fails fast instead of
 * spinning.
 */
const MAX_PAYDAY_STEPS = 300;

/**
 * The next payday at or after `todayKey`.
 *
 * The detected path walks forward from the **newest** payday on file by the median observed
 * gap. The median rather than the mean because a holiday-stretched 18-day gap and a job-change
 * 77-day hole are both in the series, and a mean would let the hole drag every projection late
 * (`classify/payPeriods.ts` documents the same two anomalies from the real data).
 *
 * The override wins outright when set. Detection is retrospective by construction: a job change
 * or a sync running a few days behind makes it quietly wrong, and quietly is the problem — the
 * day count is the denominator of the whole page.
 */
export function nextPayday(
  paydays: readonly Payday[],
  override: PaydayOverride,
  todayKey: string,
): NextPayday {
  const cadence =
    override.cadenceDays !== null && override.cadenceDays > 0
      ? override.cadenceDays
      : null;

  if (override.anchorDate !== null && cadence !== null) {
    return walkForward(override.anchorDate, cadence, todayKey, "override");
  }

  if (paydays.length === 0) return { dateKey: null, daysAway: null, source: "unknown" };

  const sorted = [...paydays].sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey),
  );
  const newest = sorted[sorted.length - 1].dateKey;
  return walkForward(newest, medianGapDays(sorted), todayKey, "detected");
}

function walkForward(
  anchorKey: string,
  cadenceDays: number,
  todayKey: string,
  source: PaydaySource,
): NextPayday {
  // Whole cadences from the anchor to today, then one more if that landed in the past. Done
  // arithmetically rather than by looping from the anchor, so an anchor years back costs the
  // same as one last fortnight.
  const elapsed = daysBetweenKeys(anchorKey, todayKey);
  const steps = Math.min(
    MAX_PAYDAY_STEPS,
    Math.max(0, Math.ceil(elapsed / cadenceDays)),
  );
  const dateKey = shiftDateKey(anchorKey, steps * cadenceDays);
  const daysAway = daysBetweenKeys(todayKey, dateKey);
  return { dateKey, daysAway, source };
}

/** Median gap between consecutive paydays, falling back to a fortnight for a single one. */
function medianGapDays(sorted: readonly Payday[]): number {
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index++) {
    const gap = daysBetweenKeys(sorted[index - 1].dateKey, sorted[index].dateKey);
    // Two employers paying on the same day produce a zero gap, which is not a cadence.
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return BIWEEKLY_DAYS;

  gaps.sort((left, right) => left - right);
  const middle = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1
    ? gaps[middle]
    : Math.round((gaps[middle - 1] + gaps[middle]) / 2);
}

/**
 * Paychecks in one cadence period. Monthly → 2, quarterly → 7, yearly → 26.
 *
 * Measured in days rather than months so a day cadence gets the same treatment: a 28-day
 * autoship accrues over two paychecks, which is what its 28 days actually contain.
 */
export function paydaysPerCadence(cadence: Cadence): number {
  return Math.max(1, Math.round(cadenceDaysApprox(cadence) / (365.2425 / 26)));
}
