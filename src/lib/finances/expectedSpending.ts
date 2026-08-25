import { incomeFromPaydays, type Payday } from "./classify/income";
import { activeBillTotals, type BillRow, type MoneyTotals } from "./commitmentRows";

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

/**
 * Expected bills against expected income, on the months and year the budget shares.
 *
 * **Recurring spend dropped out of this comparison** when
 * `agent-os/specs/2026-08-23-2313-one-budget/` retired the tier — pizza and groceries are
 * ordinary envelopes now. The pay-period column left with
 * `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` D5.
 *
 * Income is the detected series already on the page (`paydays`), annualized to a month.
 * Remainder is income minus bills; negative means declared bills cost more than typical
 * monthly income covers.
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
      annualCents: income.annualCents,
    },
    remainder: {
      monthlyCents: income.monthlyCents - billTotals.monthlyCents,
      annualCents: income.annualCents - billTotals.annualCents,
    },
  };
}
