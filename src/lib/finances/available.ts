/**
 * What is left to spend before the next paycheck — the Finances dashboard's arithmetic.
 *
 * Every other finance surface answers a retrospective question: the register is what happened,
 * insights is what life costs, statements are whether the record is complete. This module
 * answers the forward-looking one, and it is deliberately the only place that does.
 *
 * **Three rules do all the work, and each is a decision that could plausibly have gone the
 * other way.**
 *
 * 1. **Card debt is subtracted.** A card charge does not touch checking until the statement is
 *    paid, so a "spendable" figure built from checking alone overstates by exactly the amount
 *    most easily overspent. The consequence is accepted rather than smoothed: this number is
 *    often negative and must render that way. Clamping it at zero would restore the very
 *    comfort the page exists to remove.
 *
 * 2. **Savings is not spendable.** It sits in `cashPosition` and not in `availableToSpend`.
 *    Two numbers side by side make the gap between them visible, which is the useful signal;
 *    one number folding them together would spend savings without saying so.
 *
 * 3. **Set-asides accrue and then clear.** Half of rent per paycheck rather than the whole of
 *    it the day before it is due. A headline that lurches by a month's rent overnight is a
 *    headline that gets ignored, and being ignored is the only way this page can fail.
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
import {
  billAnchor,
  periodIndex,
  periodLengthDays,
  periodStartKey,
  type CommitmentCharge,
  type StoredSpend,
} from "./commitments";
import {
  cadenceDaysApprox,
  cadenceOf,
  nextDueDate,
  previousDueDate,
  type Cadence,
  type StoredBill,
} from "./recurringBills";

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
   * **This is what makes `availableToSpend` correct**, not merely informative — see the
   * pending rule there.
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
 * Pending is added only on a synced headline — the same D2a trap as `availableToSpend`.
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

export type SetAside = {
  /** The commitment's name, as the user set it. */
  name: string;
  /** What the whole bill costs, per cadence period. */
  expectedCents: number;
  /** `expectedCents` divided over the paychecks in one cadence. */
  perPaycheckCents: number;
  /** How much of it should already be held back. */
  heldCents: number;
  /** `heldCents` has reached `expectedCents` — the next charge is covered. */
  fullyFunded: boolean;
  /**
   * Start of the period being accrued for, `YYYY-MM-DD`. The last posted charge where there is
   * one, which is what makes the accrual reset on its own.
   */
  periodStartKey: string;
  /** When the charge being accrued for is expected: one cadence after `periodStartKey`. */
  nextDueKey: string;
};

/**
 * How much of one declared bill must be held back from today's spendable money.
 *
 * ```
 * perPaycheck = expected / paydaysPerCadence(cadenceMonths)
 * held        = min(expected, perPaycheck × paydays since the period started)
 * ```
 *
 * **It resets when the charge posts, and nothing has to notice.** The accrual is anchored on
 * the last posted charge, so the day rent leaves the account the anchor moves to that day, the
 * payday count drops to zero, and the held amount goes with it. An explicit "has it been paid
 * this period" branch was written first and deleted: with the anchor already being the last
 * charge, the flag was true by construction and the branch could only ever zero a figure that
 * was about to be zero anyway. Two mechanisms for one behaviour, one of them decorative.
 *
 * A bill with no `expectedCents` accrues nothing. A median of the charges on file is a fine
 * estimate for a report and the wrong basis for deducting money from a number the user is
 * about to spend against.
 *
 * The rejected alternative, recorded because it looks more careful: hold back the **full**
 * amount as soon as the due date is nearer than the next payday. Arguably more accurate about
 * what must survive, and it makes the headline drop by a month's rent overnight.
 */
export function setAsideHeld(
  bill: StoredBill,
  paydays: readonly Payday[],
  charges: readonly BillCharge[],
  todayKey: string,
): SetAside | null {
  if (bill.expectedCents === null || bill.expectedCents <= 0) return null;

  // A charge dated ahead of today cannot have reset anything yet.
  const mine = charges
    .filter((charge) => charge.name === bill.name && charge.dateKey <= todayKey)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  const lastCharge = mine.length > 0 ? mine[mine.length - 1].dateKey : null;

  const periodStartKey = periodStart(bill, lastCharge, paydays, todayKey);
  const perPaycheckCents = Math.round(
    bill.expectedCents / paydaysPerCadence(cadenceOf(bill)),
  );

  const accrued = paydays.filter(
    (payday) => payday.dateKey > periodStartKey && payday.dateKey <= todayKey,
  ).length;
  const heldCents = Math.min(bill.expectedCents, perPaycheckCents * accrued);

  return {
    name: bill.name,
    expectedCents: bill.expectedCents,
    perPaycheckCents,
    heldCents,
    fullyFunded: heldCents >= bill.expectedCents,
    periodStartKey,
    // One cadence on, not `nextDueFrom`'s walk to the future: a due date that has already
    // passed unpaid is the one thing worth seeing, and walking past it would hide it.
    nextDueKey: nextDueDate(periodStartKey, cadenceOf(bill)),
  };
}

export type SpendHeld = {
  /** The commitment's name. */
  name: string;
  /** What one period of it costs — derived from history, or pinned. */
  ratePerPeriodCents: number;
  /** Already spent in the period containing `todayKey`. */
  spentThisPeriodCents: number;
  /** What must be held back out of today's spendable money. */
  heldCents: number;
  /** How far over the period's rate this period has already gone. Zero when within it. */
  overCents: number;
  /** Periods counted, including the current one. */
  periodsCounted: number;
};

/**
 * How much of a recurring-spend commitment must be held back before the next paycheck.
 *
 * **This is not `setAsideHeld`, and the difference is the point.** That one accrues *toward* a
 * future charge and assumes the cadence is at least as long as a pay period — right for rent,
 * meaningless for a weekly grocery run against fortnightly pay, where two whole periods fall
 * inside one paycheck. So this sums the periods between today and payday instead:
 *
 * ```
 * current period      → max(0, rate − spent)
 * whole future period → rate
 * period straddling   → rate × daysBeforePayday ÷ periodDays
 *   the payday
 * ```
 *
 * **The clamp at zero is the whole mechanism**, and it is what produces the behaviour asked
 * for. A $60/week entry with fourteen days to payday holds $120. Order a $95 pizza and the
 * balance drops $95 while this period's held falls to `max(0, 60 − 95) = 0`, so the total held
 * drops to $60 and the headline moves by exactly **−$35** — the overage, and nothing else.
 * Money already budgeted is free because it was already held; only going over bites. Without
 * the clamp the overspend would be counted twice, once as a real charge and once as an unmet
 * obligation.
 *
 * **The current period is never pro-rated.** Friday's pizza is a lump, not a trickle, so half a
 * week left does not mean half a pizza. Only a *future* period cut short by payday is
 * pro-rated, because there the question really is "how much of that week does this paycheck
 * have to cover".
 */
export function recurringSpendHeld(
  entry: StoredSpend,
  ratePerPeriodCents: number,
  charges: readonly CommitmentCharge[],
  todayKey: string,
  nextPaydayKey: string | null,
): SpendHeld | null {
  if (!entry.active || ratePerPeriodCents <= 0) return null;

  const currentPeriod = periodIndex(todayKey, entry.period);
  const spentThisPeriodCents = charges
    .filter((charge) => periodIndex(charge.dateKey, entry.period) === currentPeriod)
    .reduce((total, charge) => total + charge.costCents, 0);

  // No payday in sight is not a reason to hold nothing: this period's obligation stands
  // whether or not the next paycheck can be dated.
  const lastPeriod =
    nextPaydayKey === null ? currentPeriod : periodIndex(nextPaydayKey, entry.period);

  let heldCents = Math.max(0, ratePerPeriodCents - spentThisPeriodCents);
  let periodsCounted = 1;

  for (let period = currentPeriod + 1; period <= lastPeriod; period++) {
    const startKey = periodStartKey(period, entry.period);
    if (nextPaydayKey !== null && startKey >= nextPaydayKey) break;

    const lengthDays = periodLengthDays(period, entry.period);
    const endKey = shiftDateKey(startKey, lengthDays);
    periodsCounted += 1;

    if (nextPaydayKey === null || endKey <= nextPaydayKey) {
      heldCents += ratePerPeriodCents;
      continue;
    }
    const coveredDays = daysBetweenKeys(startKey, nextPaydayKey);
    heldCents += Math.round((ratePerPeriodCents * coveredDays) / lengthDays);
  }

  return {
    name: entry.name,
    ratePerPeriodCents,
    spentThisPeriodCents,
    heldCents,
    overCents: Math.max(0, spentThisPeriodCents - ratePerPeriodCents),
    periodsCounted,
  };
}

/**
 * When the current accrual period began.
 *
 * The last posted charge is the best anchor — it is an observed fact, and it is what makes the
 * held amount reset to zero and start climbing again on its own. `anchorDate` is the declared
 * fallback for a bill whose history predates the import coverage. Failing both, the period is
 * derived backwards from `dueDay` so a freshly declared bill with no history still accrues
 * something rather than sitting at zero until its first charge lands.
 */
function periodStart(
  bill: StoredBill,
  lastCharge: string | null,
  paydays: readonly Payday[],
  todayKey: string,
): string {
  // `billAnchor` owns what a declared anchor means. It matters here for the case this used to
  // get backwards: an anchor set to a *future* charge is the end of the accrual window, not
  // its start, and returning it directly ran the period from a date that has not happened.
  const anchored = billAnchor(bill, lastCharge, todayKey).periodStartKey;
  if (anchored !== null) return anchored;

  if (bill.dueDay !== null) {
    // The most recent occurrence of the due day at or before today.
    const day = String(Math.min(bill.dueDay, 28)).padStart(2, "0");
    const thisMonth = `${todayKey.slice(0, 7)}-${day}`;
    return thisMonth <= todayKey
      ? thisMonth
      : previousDueDate(thisMonth, cadenceOf(bill));
  }

  // Nothing to anchor to. The first payday on file at least makes the accrual start somewhere
  // real rather than at the epoch, which would cap every bill on its first render.
  const first = paydays.length > 0 ? paydays[0].dateKey : todayKey;
  return first;
}

export type AvailableTerm = {
  label: string;
  cents: number;
};

export type AvailableToSpend = {
  totalCents: number;
  spendableCents: number;
  pendingCents: number;
  cardDebtCents: number;
  setAsideCents: number;
  /** Held back for tier 2 recurring spend before the next payday. */
  recurringSpendCents: number;
  /**
   * The arithmetic, in the order it should be read.
   *
   * Returned rather than reassembled in the component so the page cannot show a breakdown that
   * fails to add up to its own headline — the failure mode of every dashboard that formats its
   * terms twice.
   */
  terms: AvailableTerm[];
};

/**
 * The headline: what is left to spend before the next paycheck.
 *
 * **Pending rows are added only for accounts whose headline is a synced balance**, and that
 * guard is the one genuine trap in this file. `balanceCents` is three-tier — synced, then
 * statement-anchored, then the ledger sum. SimpleFIN reports the *posted* balance, so pending
 * rows have to be applied on top of it. The other two tiers are built by summing transactions,
 * which already includes every pending row on the account. Applying pending unconditionally
 * therefore double-counts exactly the accounts that have pending rows, and does it invisibly:
 * the number is merely wrong, never missing.
 *
 * The provider's own `available-balance` is not the answer — it came back `0` for every
 * account including a checking account holding $571.45, which is why
 * `2026-08-15-1315-live-bank-sync` D8a requires this figure be derived from the balance and
 * the pending rows instead.
 *
 * Amounts are added, never subtracted: pending outflows and card balances are already negative
 * under the module sign convention.
 */
export function availableToSpend(
  accounts: readonly DashboardAccount[],
  pending: readonly PendingRow[],
  setAsides: readonly SetAside[],
  spendHeld: readonly SpendHeld[] = [],
): AvailableToSpend {
  const position = cashPosition(accounts);

  const countsPending = new Set(
    accounts
      .filter(
        (account) =>
          account.syncedBalanceAsOf !== null &&
          (SPENDABLE_KINDS.has(account.kind) || account.kind === "credit_card"),
      )
      .map((account) => account.id),
  );
  const pendingCents = pending
    .filter((row) => countsPending.has(row.accountId))
    .reduce((total, row) => total + row.amountCents, 0);

  const setAsideCents = setAsides.reduce((total, entry) => total + entry.heldCents, 0);
  const recurringSpendCents = spendHeld.reduce(
    (total, entry) => total + entry.heldCents,
    0,
  );

  const totalCents =
    position.spendableCents +
    pendingCents +
    position.cardDebtCents -
    setAsideCents -
    recurringSpendCents;

  return {
    totalCents,
    spendableCents: position.spendableCents,
    pendingCents,
    cardDebtCents: position.cardDebtCents,
    setAsideCents,
    recurringSpendCents,
    // Two lines, not one. They are held for different reasons and answer different questions —
    // "the bills are covered" and "the groceries are covered" — and one merged figure would
    // make the larger of them impossible to interpret.
    terms: [
      { label: "Checking & cash", cents: position.spendableCents },
      { label: "Pending", cents: pendingCents },
      { label: "Card balances", cents: position.cardDebtCents },
      { label: "Set aside for bills", cents: -setAsideCents },
      { label: "Recurring spend", cents: -recurringSpendCents },
    ],
  };
}
