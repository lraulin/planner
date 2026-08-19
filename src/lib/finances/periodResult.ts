/**
 * How successful each closed pay period was at living within its means.
 *
 * Every other finance surface answers a different question. The register is what happened,
 * insights is what life costs, statements are whether the record is complete, and
 * `available.ts` is what is left to spend *now*. This one is the scorecard: for each period
 * that has already closed, was the money there without reaching for the reserve?
 *
 * **This is a position, not a flow, and that is the whole reason it is not `cashFlow()`.**
 * `cashFlow().netCents` is income minus spending over an interval. It ignores where the
 * period started, so a period that opens $300 down and nets +$100 reports +$100 while
 * nothing has actually survived. It also cannot see a card balance carried in from an
 * earlier period, which under this app's premise — cards are a way of spending checking
 * money, paid off monthly — is money already spent. So the figure here is the *balance* at
 * the close of the period: checking plus cash, less what the cards owe.
 *
 * **Three rules, each of which could plausibly have gone the other way.**
 *
 * 1. **Balances are anchored to today and walked backwards**, never summed forward from
 *    zero. `balanceAt(D) = today's balance − everything posted after D`. Summing a ledger
 *    from zero gives the right *change* and the wrong *level* whenever the import did not
 *    begin at account opening, which is exactly the case here (see `assetDebtSeries` in
 *    `analytics.ts`, which lives with that limitation because it charts a shape rather than
 *    a number someone acts on).
 *
 * 2. **Set-asides and recurring-spend holds are deliberately absent.** Those accrue
 *    *forward* against a charge that has not landed yet — a device for not spending money
 *    you will need. Looking back at a closed period, any bill that was actually charged is
 *    already in the balance, and the accrual as of a past date cannot be reconstructed
 *    anyway because commitment state is not versioned. Hence the name: **period result**,
 *    never "available to spend as of", so nobody reads holds into it.
 *
 * 3. **Savings does not count, and money taken out of it is subtracted.** A period is
 *    self-funded only if it would still have closed at or above zero *without* the reserve
 *    money — `resultCents − unplannedSavings`. Pulling $500 and closing at +$600 is a real
 *    +$100 period; pulling $500 and closing at +$200 is a −$300 period wearing a positive
 *    number. A withdrawal marked planned is exempt, because saving for something and then
 *    buying it is the system working, not failing.
 *
 * **Sign convention, inherited and load-bearing:** positive is money *into* the account,
 * for every account kind (`src/db/schema.ts`). A credit card is a liability whose balance
 * runs negative. Nothing below branches on kind to decide a sign — kind only ever chooses
 * which accounts are in a sum. A `Math.abs` or a unary minus in this file would be a bug.
 *
 * **Pure, and takes `todayKey`.** No database import, no `new Date()`. All arithmetic on
 * `YYYY-MM-DD` parts (`agent-os/standards/development/dates.md`).
 *
 * Shaped in `agent-os/specs/2026-08-18-2005-period-result/`.
 */

import type { FinanceAccountKind } from "@/db/schema";
import { SAVINGS_KINDS, SPENDABLE_KINDS } from "./available";
import type { PayPeriod } from "./classify/payPeriods";

/**
 * What the arithmetic needs from an account: today's balance, and enough to know which sum
 * it belongs in. A structural subset of `DashboardAccount`, so the dashboard's own type
 * satisfies it.
 */
export type PeriodAccount = {
  id: string;
  kind: FinanceAccountKind;
  /** The current headline balance — the anchor every historical balance is walked back from. */
  balanceCents: number;
};

/**
 * One posted transaction, as this module reads it.
 *
 * `transferGroupId` is what tells a savings withdrawal that funded spending apart from one
 * that left the household: the classifier sets it on both legs of a movement it paired.
 */
export type PeriodLedgerRow = {
  accountId: string;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  description: string;
  /** Signed; positive is money into the account. */
  amountCents: number;
  transferGroupId: string | null;
  /** Declared by the user: this withdrawal is the thing the money was saved for. */
  plannedWithdrawal: boolean;
  /** Names a planned withdrawal on the panel ("Handgun"). Empty when unnamed. */
  eventLabel: string;
};

/**
 * Every account's balance as it stood at the end of `asOfKey`, walked back from today.
 *
 * Rows dated after `asOfKey` are undone; rows on or before it are already inside the
 * anchor balance and must not be applied again. The subtraction is what makes this exact
 * rather than merely directionally right — see rule 1 in the module header.
 */
export function balancesAt(
  accounts: readonly PeriodAccount[],
  rows: readonly PeriodLedgerRow[],
  asOfKey: string,
): Map<string, number> {
  const balances = new Map<string, number>(
    accounts.map((account) => [account.id, account.balanceCents]),
  );
  for (const row of rows) {
    if (row.transactionDate <= asOfKey) continue;
    const current = balances.get(row.accountId);
    if (current === undefined) continue;
    balances.set(row.accountId, current - row.amountCents);
  }
  return balances;
}

/**
 * Checking plus cash, less what the cards owe, at the end of `asOfKey`.
 *
 * The same account selection as `cashPosition` in `available.ts` minus savings, so the
 * backward figure and the forward headline on the dashboard describe one wallet. Savings
 * is handled separately and on purpose (rule 3).
 */
export function positionAt(
  accounts: readonly PeriodAccount[],
  rows: readonly PeriodLedgerRow[],
  asOfKey: string,
): number {
  const balances = balancesAt(accounts, rows, asOfKey);
  let total = 0;
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    if (SPENDABLE_KINDS.has(account.kind)) total += balance;
    else if (account.kind === "credit_card") total += balance;
  }
  return total;
}

/** A withdrawal that took money out of the reserve during one period. */
export type SavingsDraw = {
  /** `YYYY-MM-DD`. */
  dateKey: string;
  description: string;
  /** Positive magnitude of what left savings. */
  centsOut: number;
  planned: boolean;
  /** The user's name for a planned draw, or empty. */
  label: string;
};

export type PeriodResult = {
  /** Inclusive `YYYY-MM-DD`. */
  startKey: string;
  /** Inclusive `YYYY-MM-DD`. The day the result is measured at. */
  endKey: string;
  /** Checking + cash − card balances at the close. May be negative, and must render so. */
  resultCents: number;
  /** Positive magnitude drawn from savings without being declared planned. */
  unplannedSavingsCents: number;
  /** Positive magnitude drawn from savings for something declared planned. */
  plannedSavingsCents: number;
  /**
   * `resultCents − unplannedSavingsCents` — what the period would have closed at on its own.
   *
   * This, not `resultCents`, is what decides success. Reserve money makes a period look
   * solvent exactly when it was not.
   */
  selfFundedCents: number;
  selfFunded: boolean;
  /** The unplanned draws, so the panel can say *what* disqualified the period. */
  draws: readonly SavingsDraw[];
};

/** Savings ids, resolved once per call rather than per row. */
function savingsAccountIds(accounts: readonly PeriodAccount[]): Set<string> {
  return new Set(
    accounts.filter((account) => SAVINGS_KINDS.has(account.kind)).map((a) => a.id),
  );
}

/** Accounts a reserve withdrawal must land in to have funded this period's spending. */
function fundableAccountIds(accounts: readonly PeriodAccount[]): Set<string> {
  return new Set(
    accounts
      .filter(
        (account) =>
          SPENDABLE_KINDS.has(account.kind) || account.kind === "credit_card",
      )
      .map((account) => account.id),
  );
}

/**
 * Did this withdrawal's other leg land somewhere that funds spending?
 *
 * A transfer from savings to checking or to a card paid for this period's living; a
 * withdrawal that left the household (to a brokerage, say) did not, and penalising it
 * would be wrong. When the classifier never paired the row there is no counterpart to
 * inspect, and it counts — the conservative reading, since an unpaired outflow in this
 * dataset is a same-day internal move the matcher happened to miss.
 */
function fundedSpending(
  row: PeriodLedgerRow,
  rows: readonly PeriodLedgerRow[],
  fundable: ReadonlySet<string>,
): boolean {
  if (row.transferGroupId === null) return true;
  const counterparts = rows.filter(
    (other) =>
      other.transferGroupId === row.transferGroupId &&
      other.accountId !== row.accountId,
  );
  if (counterparts.length === 0) return true;
  return counterparts.some((other) => fundable.has(other.accountId));
}

/**
 * One result per **closed** pay period, oldest first.
 *
 * A period is scored only when it has already ended and the calendar actually saw a payday
 * in it. `PayPeriod.paydays` is empty when the window was inferred across a gap or projected
 * past the last real paycheck (`classify/payPeriods.ts`), and scoring one of those would
 * invent a verdict from a guessed boundary. The period in progress is likewise never
 * scored: it has not had the chance to close yet, and showing it as failing would be the
 * one way this panel could be actively discouraging.
 */
export function periodResults(
  accounts: readonly PeriodAccount[],
  rows: readonly PeriodLedgerRow[],
  periods: readonly PayPeriod[],
  todayKey: string,
): PeriodResult[] {
  const savings = savingsAccountIds(accounts);
  const fundable = fundableAccountIds(accounts);

  const closed = periods
    .filter((period) => period.endKey < todayKey && period.paydays.length > 0)
    .sort((left, right) => left.startKey.localeCompare(right.startKey));

  return closed.map((period) => {
    const draws: SavingsDraw[] = [];
    let unplannedSavingsCents = 0;
    let plannedSavingsCents = 0;

    for (const row of rows) {
      if (!savings.has(row.accountId)) continue;
      if (row.amountCents >= 0) continue;
      if (
        row.transactionDate < period.startKey ||
        row.transactionDate > period.endKey
      ) {
        continue;
      }
      if (!fundedSpending(row, rows, fundable)) continue;

      const centsOut = -row.amountCents;
      if (row.plannedWithdrawal) {
        plannedSavingsCents += centsOut;
      } else {
        unplannedSavingsCents += centsOut;
        draws.push({
          dateKey: row.transactionDate,
          description: row.description,
          centsOut,
          planned: false,
          label: row.eventLabel,
        });
      }
    }

    const resultCents = positionAt(accounts, rows, period.endKey);
    const selfFundedCents = resultCents - unplannedSavingsCents;

    return {
      startKey: period.startKey,
      endKey: period.endKey,
      resultCents,
      unplannedSavingsCents,
      plannedSavingsCents,
      selfFundedCents,
      selfFunded: selfFundedCents >= 0,
      draws,
    };
  });
}

export type PeriodScorecard = {
  /** The most recent closed period, or null when nothing has closed yet. */
  latest: PeriodResult | null;
  /** The window shown as history, oldest first. Includes `latest`. */
  history: readonly PeriodResult[];
  /** How many of `history` were self-funded. */
  selfFundedCount: number;
};

/**
 * The last `window` closed periods, and how many of them held.
 *
 * Returns an empty scorecard rather than a zero one when nothing has closed: "0 of 0" reads
 * as a failing streak, and a user with no history yet has not failed at anything.
 */
export function periodScorecard(
  results: readonly PeriodResult[],
  window = 6,
): PeriodScorecard {
  const history = results.slice(-window);
  return {
    latest: history.length > 0 ? history[history.length - 1] : null,
    history,
    selfFundedCount: history.filter((result) => result.selfFunded).length,
  };
}
