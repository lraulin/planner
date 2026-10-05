import { describe, expect, it } from "vitest";
import {
  completedMonthAverages,
  reportMonthlySeries,
  reportRange,
  spendingContributions,
  type EnvelopeReportRow,
} from "../reports";
import { averageOver, groupAverage, spendingActuals } from "./actuals";

const TODAY = "2026-10-04";

function spend(
  envelope: string,
  cents: number,
  date: string,
  over: Partial<EnvelopeReportRow> = {},
): EnvelopeReportRow {
  return {
    id: `${envelope}-${date}-${cents}`,
    accountId: "checking",
    accountName: "Checking",
    accountKind: "checking",
    transactionDate: date,
    description: envelope,
    amountCents: -cents,
    sourceCategory: "",
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,
    payeeId: null,
    payeeName: null,
    budgetCategoryId: envelope,
    groupId: null,
    envelopeKind: "spending",
    incomeRole: "other",
    accountOffBudget: false,
    contributesToBudget: true,
    ...over,
  };
}

/** A year of history so the window is a full twelve completed months. */
function history(rows: EnvelopeReportRow[]): EnvelopeReportRow[] {
  return [spend("anchor", 1, "2025-09-15"), ...rows].sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate),
  );
}

describe("spendingActuals", () => {
  it("averages over twelve completed months and leaves the partial month out", () => {
    const rows = history([
      spend("food", 120000, "2025-12-10"),
      spend("food", 99999, "2026-10-02"), // this month: not complete, not counted
    ]);
    const actuals = spendingActuals(rows, TODAY);
    expect(actuals.months).toBe(12);
    expect(averageOver(actuals, ["food"])).toBe(10000);
  });

  it("agrees with Insights' own series and 12-month average", () => {
    const rows = history([
      spend("food", 41234, "2025-11-03"),
      spend("food", 7777, "2026-02-14"),
      spend("food", 20001, "2026-09-30"),
      spend("gas", 5000, "2026-03-01"),
      spend("food", -3000, "2026-04-04"), // a refund lowers the total
    ]);
    const range = reportRange("12m", TODAY, rows[0].transactionDate);
    const only = rows.filter((row) => row.budgetCategoryId === "food");
    const points = reportMonthlySeries(only, "all", range, TODAY);
    const insights = completedMonthAverages(points, TODAY).find((a) => a.months === 12);

    expect(averageOver(spendingActuals(rows, TODAY), ["food"])).toBe(
      insights?.spendCents,
    );
  });

  it("averages over only the months the history covers", () => {
    const rows = [
      spend("food", 30000, "2026-07-10"),
      spend("food", 30000, "2026-08-10"),
      spend("food", 30000, "2026-09-10"),
    ];
    const actuals = spendingActuals(rows, TODAY);
    expect(actuals.months).toBe(3);
    expect(averageOver(actuals, ["food"])).toBe(30000);
  });

  it("reports an unknown, not a zero, when there is no completed month", () => {
    const rows = [spend("food", 5000, "2026-10-02")];
    const actuals = spendingActuals(rows, TODAY);
    expect(actuals.months).toBe(0);
    expect(averageOver(actuals, ["food"])).toBeNull();
    expect(averageOver(spendingActuals([], TODAY), ["food"])).toBeNull();
  });

  it("ignores rows that do not contribute to the budget and income rows", () => {
    const rows = history([
      spend("food", 12000, "2026-01-05", { contributesToBudget: false }),
      spend("pay", -500000, "2026-01-06", { envelopeKind: "income" }),
      spend("food", 24000, "2026-01-07"),
    ]);
    expect(averageOver(spendingActuals(rows, TODAY), ["food"])).toBe(2000);
    expect(averageOver(spendingActuals(rows, TODAY), ["pay"])).toBe(0);
    expect(
      spendingContributions(rows, "all").some((r) => r.envelopeKind === "income"),
    ).toBe(false);
  });

  it("rounds once over a set, not once per envelope", () => {
    // 5 and 5 cents over 12 months: 0.4167 each rounds to 0 apiece, but 10/12 rounds to 1.
    const rows = history([spend("a", 5, "2026-01-05"), spend("b", 5, "2026-01-06")]);
    const actuals = spendingActuals(rows, TODAY);
    expect(averageOver(actuals, ["a"])).toBe(0);
    expect(averageOver(actuals, ["a", "b"])).toBe(1);
  });
});

describe("groupAverage", () => {
  it("includes envelopes in nested groups", () => {
    const rows = history([
      spend("milk", 12000, "2026-01-05"),
      spend("beef", 24000, "2026-02-05"),
      spend("fun", 6000, "2026-03-05"),
    ]);
    const groups = [
      { id: "food", parentGroupId: null },
      { id: "meat", parentGroupId: "food" },
    ];
    const categories = [
      { id: "milk", groupId: "food" },
      { id: "beef", groupId: "meat" },
      { id: "fun", groupId: null },
    ];
    expect(groupAverage(spendingActuals(rows, TODAY), groups, categories, "food")).toBe(
      3000,
    );
  });
});
