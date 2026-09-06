import type { BillCharge } from "./available";
import { observedAmountRange } from "./amountMatch";
import { billAnchor, type StoredBillRow } from "./commitments";
import { annualCents, cadenceOf } from "./recurringBills";

export { observedAmountRange };

/**
 * A bill envelope with its cost columns and next-due date resolved — what the budget grid's
 * hideable A year / Monthly columns and the URL/status cells read.
 *
 * **The accrual meter this module used to carry (`held`, `SetAside`, `billHoldCaption`) is
 * gone** — `agent-os/specs/2026-08-23-2313-one-budget/` D5 retired Available to Spend and the
 * per-paycheck set-aside it accrued. Whether a bill is funded is now its envelope Balance,
 * read straight off the budget fold; this module only ever answers "what does it cost" and
 * "when is it next due", neither of which depends on the budget at all.
 */
export type BillRow = StoredBillRow & {
  /**
   * When the next charge is expected. Null for an unscheduled bill (propane) — a projected
   * date there would read as knowledge the user never gave.
   */
  nextDueKey: string | null;
  /** `expectedCents`, or zero — the grid's money input has nothing to render for null. */
  amountCents: number;
  /** What it costs over twelve months. Zero without a declared amount. */
  annualCostCents: number;
  /** `annualCostCents / 12` — comparable across cadences. The Amount column is not. */
  monthlyCents: number;
  /** The next due date has already passed and nothing has posted since. */
  overdue: boolean;
};

/** The last posted charge for a bill, or null. */
function lastChargeOn(
  bill: StoredBillRow,
  charges: readonly BillCharge[],
): string | null {
  const mine = charges
    .filter((charge) =>
      charge.billId ? charge.billId === bill.id : charge.name === bill.name,
    )
    .map((charge) => charge.dateKey)
    .sort();
  return mine.length > 0 ? mine[mine.length - 1] : null;
}

/**
 * Every bill envelope, with its cost columns and next-due date resolved.
 *
 * `todayKey` null is the pre-hydration state: no date means no due date, rather than a due
 * date computed against the server's idea of today.
 */
export function billRows(
  bills: readonly StoredBillRow[],
  charges: readonly BillCharge[],
  todayKey: string | null,
): BillRow[] {
  return bills.map((bill) => {
    const amountCents = bill.expectedCents ?? 0;
    const lastPosted = lastChargeOn(bill, charges);
    const annualCostCents =
      amountCents > 0 ? annualCents(amountCents, cadenceOf(bill)) : 0;
    const anchor =
      todayKey === null || !bill.scheduled
        ? null
        : billAnchor(bill, lastPosted, todayKey);
    return {
      ...bill,
      amountCents,
      annualCostCents,
      monthlyCents: Math.round(annualCostCents / 12),
      // The editable "Next charge" column: always today or later. `expectedKey` below is the
      // one that can sit in the past — that is exactly what "overdue" means.
      nextDueKey: anchor?.nextDueKey ?? null,
      overdue:
        bill.status === "active" &&
        anchor?.expectedKey !== null &&
        anchor?.expectedKey !== undefined &&
        todayKey !== null &&
        anchor.expectedKey < todayKey,
    };
  });
}

export type MoneyTotals = {
  annualCents: number;
  monthlyCents: number;
  weeklyCents: number;
};

/**
 * Expected bills against expected income, on the months and year the budget shares.
 *
 * Lives beside `MoneyTotals` because that is the only shape it adds to. The function that
 * once built it is gone: `dashboardQueries.ts` constructs the value from the budget's own
 * income plan, which was already what the page showed — the builder was a second, quietly
 * disagreeing answer to the same question (it used the median-paycheck series instead).
 */
export type SpendingVsIncome = {
  bills: MoneyTotals;
  income: {
    medianPaycheckCents: number;
    monthlyCents: number;
    annualCents: number;
  };
  remainder: {
    monthlyCents: number;
    annualCents: number;
  };
};

/** Active bills, summed on the columns that share a period. Amount is excluded on purpose. */
export function activeBillTotals(rows: readonly BillRow[]): MoneyTotals {
  return sumMoney(
    rows.filter((row) => row.status === "active"),
    (row) => ({
      annualCents: row.annualCostCents,
      monthlyCents: row.monthlyCents,
      weeklyCents: 0,
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
        weeklyCents: total.weeklyCents + cents.weeklyCents,
      };
    },
    { annualCents: 0, monthlyCents: 0, weeklyCents: 0 },
  );
}
