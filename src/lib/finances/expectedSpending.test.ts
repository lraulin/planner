import { describe, expect, it } from "vitest";
import type { Payday } from "./classify/income";
import { billRows } from "./commitmentRows";
import { spendingVsIncome } from "./expectedSpending";
import type { StoredBillRow } from "./commitments";

function payday(dateKey: string, amountCents = 200_000): Payday {
  return { dateKey, employer: "ACME", amountCents, transactionIds: [] };
}

function bill(over: Partial<StoredBillRow> = {}): StoredBillRow {
  return {
    id: "bill-1",
    name: "Rent",
    payees: [],
    payeeIds: [],
    status: "active",
    cancelledOn: null,
    url: "",
    cadenceMonths: 1,
    expectedCents: 210_000,
    anchorDate: null,
    scheduled: true,
    dueDay: 1,
    ...over,
  };
}

describe("spendingVsIncome", () => {
  it("subtracts active bills from the typical paycheck, not cancelled ones", () => {
    // $2,100/mo rent against a $2,000 paycheck. A cancelled Paramount+ of $12/mo must not
    // shrink the remainder — that was the dashboard's original bug in miniature, and it would
    // look like a comfortable surplus that is not there.
    const bills = billRows(
      [
        bill(),
        bill({
          id: "bill-2",
          name: "Paramount+",
          expectedCents: 1200,
          cadenceMonths: 1,
          status: "cancelled",
        }),
      ],
      [{ name: "Rent", dateKey: "2026-05-01" }],
      "2026-05-10",
    );
    const result = spendingVsIncome(bills, [
      payday("2026-05-08"),
      payday("2026-05-22"),
    ]);

    expect(result.bills.monthlyCents).toBe(210_000);
    expect(result.income.paycheckCents).toBe(200_000);
    expect(result.remainder.paycheckCents).toBe(200_000 - result.bills.paycheckCents);
    expect(result.remainder.monthlyCents).toBe(
      result.income.monthlyCents - result.bills.monthlyCents,
    );
  });

  it("reports zero income when no paydays have been detected", () => {
    const result = spendingVsIncome([], []);
    expect(result.income).toEqual({
      medianPaycheckCents: 0,
      monthlyCents: 0,
      paycheckCents: 0,
      annualCents: 0,
    });
    expect(result.remainder.monthlyCents).toBe(0);
  });
});
