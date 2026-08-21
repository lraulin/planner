import { describe, expect, it } from "vitest";
import { groupBills, groupSpend } from "./commitmentGrouping";
import type { BillRow, SpendRow } from "./commitmentRows";

function bill(over: Partial<BillRow> & Pick<BillRow, "id" | "name">): BillRow {
  return {
    matchers: [over.name],
    status: "active",
    cancelledOn: null,
    url: "",
    category: "",
    cadenceMonths: 1,
    expectedCents: 1000,
    anchorDate: null,
    scheduled: true,
    dueDay: 1,
    nextDueKey: null,
    amountCents: 1000,
    annualCostCents: 12_000,
    monthlyCents: 1000,
    paycheckCents: 462,
    held: null,
    overdue: false,
    ...over,
  };
}

function spend(over: Partial<SpendRow> & Pick<SpendRow, "id" | "name">): SpendRow {
  return {
    matchers: [over.name],
    period: "week",
    amountSource: "pinned",
    expectedCents: 5000,
    active: true,
    category: "",
    rate: {
      ratePerPeriodCents: 5000,
      observedCents: 5000,
      periodsObserved: 4,
      pinned: true,
      lowCents: 5000,
      highCents: 5000,
      modalDayOfWeek: 5,
    },
    weeklyCents: 5000,
    monthlyCents: 21_667,
    paycheckCents: 10_000,
    held: null,
    ...over,
  };
}

describe("groupBills", () => {
  it("stays a flat list when grouping is off, so turning Group by off is not a no-op", () => {
    const rows = [bill({ id: "a", name: "Rent" }), bill({ id: "b", name: "Geico" })];
    expect(groupBills(rows, []).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("keeps an uncategorised bill in its own bucket rather than inventing a category", () => {
    const grouped = groupBills(
      [
        bill({ id: "a", name: "Rent", category: "Housing" }),
        bill({ id: "b", name: "Geico", category: "" }),
      ],
      ["category"],
    );
    const headers = grouped.filter((entry) => entry.kind === "group");
    expect(headers.map((entry) => entry.label)).toEqual(["(No Category)", "Housing"]);
    expect(headers.map((entry) => entry.count)).toEqual([1, 1]);
  });
});

describe("groupSpend", () => {
  it("splits paused groups from active ones under State", () => {
    const grouped = groupSpend(
      [
        spend({ id: "a", name: "Pizza" }),
        spend({ id: "b", name: "Old gym", active: false }),
      ],
      ["state"],
    );
    const headers = grouped.filter((entry) => entry.kind === "group");
    expect(headers.map((entry) => entry.label)).toEqual(["Active", "Paused"]);
  });
});
