import { describe, expect, it } from "vitest";
import type { Payday } from "./classify/income";
import { billRows, spendRows } from "./commitmentRows";
import { spendingVsIncome } from "./expectedSpending";
import type { StoredBillRow, StoredSpend } from "./commitments";

function payday(dateKey: string, amountCents = 200_000): Payday {
  return { dateKey, employer: "ACME", amountCents, transactionIds: [] };
}

function bill(over: Partial<StoredBillRow> = {}): StoredBillRow {
  return {
    id: "bill-1",
    name: "Rent",
    matchers: ["RENT"],
    status: "active",
    cancelledOn: null,
    url: "",
    category: "",
    cadenceMonths: 1,
    expectedCents: 210_000,
    anchorDate: null,
    scheduled: true,
    dueDay: 1,
    ...over,
  };
}

function spend(over: Partial<StoredSpend> = {}): StoredSpend {
  return {
    id: "spend-1",
    name: "Groceries",
    matchers: ["WALMART"],
    period: "week",
    amountSource: "pinned",
    expectedCents: 15_000,
    active: true,
    category: "",
    ...over,
  };
}

describe("spendingVsIncome", () => {
  it("subtracts active commitments from the typical paycheck, not cancelled ones", () => {
    // $2,100/mo rent + $150/wk groceries against a $2,000 paycheck. A cancelled Paramount+
    // of $12/mo must not shrink the remainder — that was the dashboard's original bug in
    // miniature, and it would look like a comfortable surplus that is not there.
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
      [payday("2026-05-08"), payday("2026-05-22")],
      "2026-05-10",
    );
    const groups = spendRows([spend()], {}, "2026-05-10", "2026-05-22");
    const result = spendingVsIncome(bills, groups, [
      payday("2026-05-08"),
      payday("2026-05-22"),
    ]);

    expect(result.bills.monthlyCents).toBe(210_000);
    expect(result.spend.weeklyCents).toBe(15_000);
    expect(result.income.paycheckCents).toBe(200_000);
    expect(result.remainder.paycheckCents).toBe(
      200_000 - result.spending.paycheckCents,
    );
    expect(result.remainder.monthlyCents).toBe(
      result.income.monthlyCents - result.spending.monthlyCents,
    );
  });

  it("reports zero income when no paydays have been detected", () => {
    const result = spendingVsIncome([], [], []);
    expect(result.income).toEqual({
      medianPaycheckCents: 0,
      monthlyCents: 0,
      paycheckCents: 0,
      annualCents: 0,
    });
    expect(result.remainder.monthlyCents).toBe(0);
  });
});
