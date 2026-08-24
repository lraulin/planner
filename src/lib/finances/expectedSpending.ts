import { incomeFromPaydays, type Payday } from "./classify/income";
import { activeBillTotals, type BillRow, type MoneyTotals } from "./commitmentRows";

export type SpendingVsIncome = {
  bills: MoneyTotals;
  income: {
    medianPaycheckCents: number;
    monthlyCents: number;
    paycheckCents: number;
    annualCents: number;
  };
  remainder: {
    monthlyCents: number;
    paycheckCents: number;
    annualCents: number;
  };
};

/**
 * Expected bills against expected income, on the three periods the grid shares.
 *
 * **Recurring spend dropped out of this comparison** when
 * `agent-os/specs/2026-08-23-2313-one-budget/` retired the tier — pizza and groceries are
 * ordinary envelopes now, tracked by the budget's own Ready to Assign rather than by a second
 * income comparison. What remains is bills vs. income, unchanged.
 *
 * Income is the detected biweekly series already on the page (`paydays`), not a second
 * detector pass. Remainder is income minus bills; negative means declared bills cost more
 * than a typical paycheck covers.
 */
export function spendingVsIncome(
  bills: readonly BillRow[],
  paydays: readonly Payday[],
): SpendingVsIncome {
  const billTotals = activeBillTotals(bills);
  const income = incomeFromPaydays(paydays);
  return {
    bills: billTotals,
    income: {
      medianPaycheckCents: income.medianPaycheckCents,
      monthlyCents: income.monthlyCents,
      paycheckCents: income.medianPaycheckCents,
      annualCents: income.annualCents,
    },
    remainder: {
      monthlyCents: income.monthlyCents - billTotals.monthlyCents,
      paycheckCents: income.medianPaycheckCents - billTotals.paycheckCents,
      annualCents: income.annualCents - billTotals.annualCents,
    },
  };
}
