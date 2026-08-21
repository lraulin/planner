import {
  recurringSpendHeld,
  setAsideHeld,
  type BillCharge,
  type SetAside,
  type SpendHeld,
} from "./available";
import type { Payday } from "./classify/income";
import {
  billAnchor,
  recurringSpendRate,
  type CommitmentCharge,
  type SpendRate,
  type StoredBillRow,
  type StoredSpend,
} from "./commitments";
import { annualCents, cadenceOf } from "./recurringBills";

/**
 * What the Commitments grids and the dashboard panels both show for one commitment.
 *
 * This module exists to hold **one** answer to "is this money being held back, and how much".
 * Until 2026-08-18 that question had two answers: a `set_aside` column, and a
 * `status === "active"` filter each caller applied for itself. Deleting the flag left the
 * status rule sitting in two components, which is one component too many for a rule that
 * decides what a number on the dashboard means.
 *
 * `held` is the whole of it. Null means nothing is being held and the surface should say why —
 * no amount, cancelled, dismissed, or inactive — rather than showing a zero that looks like a
 * figure.
 */
export type BillRow = StoredBillRow & {
  /**
   * When the next charge is expected, for the editable date column.
   *
   * Deliberately not `held.nextDueKey`, which stops at a due date that has already passed so an
   * unpaid bill stays visible. This one walks forward past today, because it is the field the
   * user corrects rather than a finding.
   */
  nextDueKey: string | null;
  /** `expectedCents`, or zero — the grid's money input has nothing to render for null. */
  amountCents: number;
  /** What it costs over twelve months. Zero without a declared amount. */
  annualCostCents: number;
  /** The accrual, or null when nothing is being held back. */
  held: SetAside | null;
  /**
   * The charge being accrued for was due before today and has not posted.
   *
   * Worth its own field rather than a comparison at each call site: the accrual reaching its
   * target is good news and the same figure sitting past its due date is not, and they are one
   * cent apart in every other respect.
   */
  overdue: boolean;
};

export type SpendRow = StoredSpend & {
  rate: SpendRate;
  weeklyCents: number;
  monthlyCents: number;
  /** This period's hold, or null when the group is inactive or has no observed rate. */
  held: SpendHeld | null;
};

/** The last posted charge for a commitment, or null. */
function lastChargeOn(name: string, charges: readonly BillCharge[]): string | null {
  const mine = charges
    .filter((charge) => charge.name === name)
    .map((charge) => charge.dateKey)
    .sort();
  return mine.length > 0 ? mine[mine.length - 1] : null;
}

/**
 * The bills tier, with its accrual resolved.
 *
 * **`status === "active"` is the entire gate**, because `setAsideHeld` already declines a bill
 * with no declared amount. A cancelled or dismissed bill keeps its history and its annual
 * figure — both still worth reading — and holds nothing.
 *
 * `todayKey` null is the pre-hydration state: no date means no accrual and no due date, rather
 * than an accrual computed against the server's idea of today.
 */
export function billRows(
  bills: readonly StoredBillRow[],
  charges: readonly BillCharge[],
  paydays: readonly Payday[],
  todayKey: string | null,
): BillRow[] {
  return bills.map((bill) => {
    const amountCents = bill.expectedCents ?? 0;
    const lastPosted = lastChargeOn(bill.name, charges);
    const held =
      todayKey === null || bill.status !== "active"
        ? null
        : setAsideHeld(bill, paydays, charges, todayKey);
    return {
      ...bill,
      amountCents,
      annualCostCents: amountCents > 0 ? annualCents(amountCents, cadenceOf(bill)) : 0,
      nextDueKey:
        todayKey === null || !bill.scheduled
          ? null
          : billAnchor(bill, lastPosted, todayKey).nextDueKey,
      held,
      overdue: held !== null && todayKey !== null && held.nextDueKey < todayKey,
    };
  });
}

/**
 * The recurring-spend tier, with its rate and this period's hold resolved.
 *
 * `recurringSpendHeld` gates on `active` itself, so there is no second condition here — the
 * asymmetry with bills is real, not an oversight: spend has no cancelled state to consider.
 */
export function spendRows(
  spend: readonly StoredSpend[],
  charges: Record<string, CommitmentCharge[]>,
  todayKey: string | null,
  nextPaydayKey: string | null,
): SpendRow[] {
  return spend.map((entry) => {
    const mine = charges[entry.name] ?? [];
    // A far-future key before hydration makes every charge on file count as history, which is
    // what an un-dated read of the rate should show: the average so far, held against nothing.
    const rate = recurringSpendRate(entry, mine, todayKey ?? "9999-12-31");
    return {
      ...entry,
      rate,
      weeklyCents:
        entry.period === "week"
          ? rate.ratePerPeriodCents
          : Math.round((rate.ratePerPeriodCents * 12) / 52),
      monthlyCents:
        entry.period === "month"
          ? rate.ratePerPeriodCents
          : Math.round((rate.ratePerPeriodCents * 52) / 12),
      held:
        todayKey === null
          ? null
          : recurringSpendHeld(
              entry,
              rate.ratePerPeriodCents,
              mine,
              todayKey,
              nextPaydayKey,
            ),
    };
  });
}

/** Every bill accrual in force, for `availableToSpend`. */
export function heldSetAsides(rows: readonly BillRow[]): SetAside[] {
  return rows.flatMap((row) => (row.held === null ? [] : [row.held]));
}

/** Every recurring-spend hold in force, for `availableToSpend`. */
export function heldSpend(rows: readonly SpendRow[]): SpendHeld[] {
  return rows.flatMap((row) => (row.held === null ? [] : [row.held]));
}
