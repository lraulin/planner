import { incomeFromPaydays, type Payday } from "./classify/income";
import {
  activeBillTotals,
  activeSpendTotals,
  type BillRow,
  type MoneyTotals,
  type SpendRow,
} from "./commitmentRows";

export type SpendingVsIncome = {
  bills: MoneyTotals;
  spend: MoneyTotals;
  spending: MoneyTotals;
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

function addTotals(left: MoneyTotals, right: MoneyTotals): MoneyTotals {
  return {
    annualCents: left.annualCents + right.annualCents,
    monthlyCents: left.monthlyCents + right.monthlyCents,
    paycheckCents: left.paycheckCents + right.paycheckCents,
    weeklyCents: left.weeklyCents + right.weeklyCents,
  };
}

/**
 * Expected commitments against expected income, on the three periods the grids share.
 *
 * Income is the detected biweekly series already on the page (`paydays`), not a second
 * detector pass. Remainder is income minus spending; negative means the declared
 * commitments cost more than a typical paycheck covers.
 */
export function spendingVsIncome(
  bills: readonly BillRow[],
  spend: readonly SpendRow[],
  paydays: readonly Payday[],
): SpendingVsIncome {
  const billTotals = activeBillTotals(bills);
  const spendTotals = activeSpendTotals(spend);
  const spending = addTotals(billTotals, spendTotals);
  const income = incomeFromPaydays(paydays);
  return {
    bills: billTotals,
    spend: spendTotals,
    spending,
    income: {
      medianPaycheckCents: income.medianPaycheckCents,
      monthlyCents: income.monthlyCents,
      paycheckCents: income.medianPaycheckCents,
      annualCents: income.annualCents,
    },
    remainder: {
      monthlyCents: income.monthlyCents - spending.monthlyCents,
      paycheckCents: income.medianPaycheckCents - spending.paycheckCents,
      annualCents: income.annualCents - spending.annualCents,
    },
  };
}
