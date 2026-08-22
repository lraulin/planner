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
import { PAYCHECKS_PER_YEAR } from "./classify/income";
import { formatUsd, formatUsdWhole } from "./money";
import { annualCents, cadenceOf } from "./recurringBills";

/**
 * Same 25% band the recurring detector uses (`analytics.ts`). A range is an admission that
 * the stated amount is soft; printing one for MetLife ($100.24 twelve times) would argue
 * with a figure that is already a fact.
 */
const AMOUNT_SPREAD_RATIO = 0.25;

/**
 * Observed min–max of a bill's charges, or null when the spread is too tight to mention.
 *
 * `(high − low) / high` rather than standard deviation: two fills of $336 and $540 should
 * show as a range even though n=2 makes stddev a poor story, and a 16% Geico swing stays
 * under the band.
 */
export function observedAmountRange(
  amounts: readonly number[],
): { lowCents: number; highCents: number } | null {
  if (amounts.length < 2) return null;
  const lowCents = Math.min(...amounts);
  const highCents = Math.max(...amounts);
  if (highCents <= 0) return null;
  if ((highCents - lowCents) / highCents <= AMOUNT_SPREAD_RATIO) return null;
  return { lowCents, highCents };
}

/** Whole-dollar range for a swingy bill: `$150–$540`. */
export function amountRangeLabel(range: {
  lowCents: number;
  highCents: number;
}): string {
  return `${formatUsdWhole(range.lowCents)}–${formatUsdWhole(range.highCents)}`;
}

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
  /** `annualCostCents / 12` — comparable across cadences. The Amount column is not. */
  monthlyCents: number;
  /**
   * Annual cost spread over 26 paychecks. Not `held.perPaycheckCents`, which is the accrual
   * slice of *this* cycle (`expected / paydays in the cadence`) and cannot be summed with a
   * monthly bill's slice.
   */
  paycheckCents: number;
  /** The accrual, or null when nothing is being held back. */
  held: SetAside | null;
  /**
   * Observed min–max of matched charges when the spread exceeds 25% of the dearest
   * charge. Null when history is tight, a single fill, or the amounts were not supplied.
   */
  amountRange: { lowCents: number; highCents: number } | null;
  /**
   * The charge being accrued for was due before today and has not posted.
   *
   * Worth its own field rather than a comparison at each call site: the accrual reaching its
   * target is good news and the same figure sitting past its due date is not, and they are one
   * cent apart in every other respect.
   */
  overdue: boolean;
};

/**
 * Caption under a dashboard bill row. Unscheduled bills must not grow a due date — a
 * projected date reads as knowledge (`2026-08-14-1104-unscheduled-bills`).
 */
export function billHoldCaption(
  row: Pick<BillRow, "scheduled" | "held" | "amountRange">,
  todayKey: string | null,
  formatDate: (key: string) => string,
): string {
  if (row.held === null) return "";
  const parts = [
    `${formatUsd(row.held.perPaycheckCents)} per paycheck of ${formatUsd(row.held.expectedCents)}`,
  ];
  if (row.scheduled) {
    parts.push(`due ${formatDate(row.held.nextDueKey)}`);
    if (todayKey !== null && row.held.nextDueKey < todayKey) parts.push("overdue");
  } else {
    parts.push("unscheduled");
  }
  if (row.amountRange) parts.push(amountRangeLabel(row.amountRange));
  if (row.held.fullyFunded) parts.push("fully set aside");
  return parts.join(" · ");
}

export type SpendRow = StoredSpend & {
  rate: SpendRate;
  weeklyCents: number;
  monthlyCents: number;
  /** Monthly rate spread over 26 paychecks, so it sits next to the bills column. */
  paycheckCents: number;
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
 * **`status === "active"` is the entire hold gate**, because `setAsideHeld` already declines a
 * bill with no declared amount. Paused, cancelled, and dismissed bills keep their history
 * and their annual figure — both still worth reading — and hold nothing. Pause is the one
 * that stays on the grid: still a commitment, not subtracted from available.
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
    const annualCostCents =
      amountCents > 0 ? annualCents(amountCents, cadenceOf(bill)) : 0;
    return {
      ...bill,
      amountCents,
      annualCostCents,
      monthlyCents: Math.round(annualCostCents / 12),
      paycheckCents: Math.round(annualCostCents / PAYCHECKS_PER_YEAR),
      nextDueKey:
        todayKey === null || !bill.scheduled
          ? null
          : billAnchor(bill, lastPosted, todayKey).nextDueKey,
      held,
      amountRange: observedAmountRange(
        charges.flatMap((charge) =>
          charge.name === bill.name && charge.costCents !== undefined
            ? [charge.costCents]
            : [],
        ),
      ),
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
    const weeklyCents =
      entry.period === "week"
        ? rate.ratePerPeriodCents
        : Math.round((rate.ratePerPeriodCents * 12) / 52);
    const monthlyCents =
      entry.period === "month"
        ? rate.ratePerPeriodCents
        : Math.round((rate.ratePerPeriodCents * 52) / 12);
    return {
      ...entry,
      rate,
      weeklyCents,
      monthlyCents,
      paycheckCents: Math.round((monthlyCents * 12) / PAYCHECKS_PER_YEAR),
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

export type MoneyTotals = {
  annualCents: number;
  monthlyCents: number;
  paycheckCents: number;
  weeklyCents: number;
};

/** Active bills, summed on the columns that share a period. Amount is excluded on purpose. */
export function activeBillTotals(rows: readonly BillRow[]): MoneyTotals {
  return sumMoney(
    rows.filter((row) => row.status === "active"),
    (row) => ({
      annualCents: row.annualCostCents,
      monthlyCents: row.monthlyCents,
      paycheckCents: row.paycheckCents,
      weeklyCents: 0,
    }),
  );
}

/** Active spend groups, summed on weekly / monthly / paycheck. Rate is period-mixed. */
export function activeSpendTotals(rows: readonly SpendRow[]): MoneyTotals {
  return sumMoney(
    rows.filter((row) => row.active),
    (row) => ({
      annualCents: row.monthlyCents * 12,
      monthlyCents: row.monthlyCents,
      paycheckCents: row.paycheckCents,
      weeklyCents: row.weeklyCents,
    }),
  );
}

function sumMoney<T>(
  rows: readonly T[],
  centsOf: (row: T) => MoneyTotals,
): MoneyTotals {
  return rows.reduce(
    (total, row) => {
      const cents = centsOf(row);
      return {
        annualCents: total.annualCents + cents.annualCents,
        monthlyCents: total.monthlyCents + cents.monthlyCents,
        paycheckCents: total.paycheckCents + cents.paycheckCents,
        weeklyCents: total.weeklyCents + cents.weeklyCents,
      };
    },
    { annualCents: 0, monthlyCents: 0, paycheckCents: 0, weeklyCents: 0 },
  );
}
