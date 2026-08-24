import { describe, expect, it } from "vitest";
import {
  aliasOverlap,
  billAnchor,
  periodIndex,
  periodLengthDays,
  periodStartKey,
  projectForwardMonths,
  upcomingBillOccurrences,
  staleSubscriptions,
  suggestCommitmentName,
  unclaimedMerchants,
  type StoredBillRow,
} from "./commitments";

function bill(overrides: Partial<StoredBillRow> = {}): StoredBillRow {
  return {
    id: "bill-1",
    name: "Geico",
    payees: [],
    payeeIds: [],
    status: "active",
    cancelledOn: null,
    url: "",
    cadenceMonths: 6,
    expectedCents: 59498,
    anchorDate: null,
    scheduled: true,
    dueDay: null,
    ...overrides,
  };
}

describe("periodIndex", () => {
  it("gives one index per calendar week, changing on the Monday", () => {
    // 2026-08-16 is a Sunday; 2026-08-17 is the Monday that starts the next week.
    expect(periodIndex("2026-08-16", "week")).toBe(periodIndex("2026-08-10", "week"));
    expect(periodIndex("2026-08-17", "week")).toBe(
      periodIndex("2026-08-16", "week") + 1,
    );
  });

  it("does not shift when today does", () => {
    // A rolling seven-day window would; the rate and the "spent so far" figure must agree on
    // which week a charge is in, and they are computed at different call sites.
    expect(periodIndex("2026-08-14", "week")).toBe(periodIndex("2026-08-14", "week"));
    expect(periodIndex("2026-01-05", "month")).toBe(periodIndex("2026-01-31", "month"));
    expect(periodIndex("2026-02-01", "month")).toBe(
      periodIndex("2026-01-31", "month") + 1,
    );
  });

  it("round-trips through periodStartKey, December included", () => {
    // December is `year × 12 + 12`, which is the year's own multiple — the case that folds
    // into next January if the inverse is written the obvious way.
    for (const key of ["2026-08-16", "2025-12-31", "2026-01-01", "2024-02-29"]) {
      const monthly = periodIndex(key, "month");
      expect(periodStartKey(monthly, "month")).toBe(`${key.slice(0, 7)}-01`);

      const weekly = periodIndex(key, "week");
      expect(periodIndex(periodStartKey(weekly, "week"), "week")).toBe(weekly);
    }
  });

  it("measures a month's real length, February included", () => {
    expect(periodLengthDays(periodIndex("2026-02-10", "month"), "month")).toBe(28);
    expect(periodLengthDays(periodIndex("2024-02-10", "month"), "month")).toBe(29);
    expect(periodLengthDays(periodIndex("2026-08-10", "month"), "month")).toBe(31);
    expect(periodLengthDays(periodIndex("2026-08-10", "week"), "week")).toBe(7);
  });
});

describe("staleSubscriptions", () => {
  const charges = (dateKey: string) =>
    new Map([["Netflix", [{ dateKey, costCents: 1599 }]]]);

  it("flags a monthly subscription whose charge never arrived", () => {
    // The Disney+/Paramount+/HBO Max case: still on the list, no longer billing.
    const monthly = bill({ name: "Netflix", cadenceMonths: 1, expectedCents: 1599 });
    const [stale] = staleSubscriptions([monthly], charges("2026-06-01"), "2026-08-16");

    expect(stale).toMatchObject({ name: "Netflix", expectedOn: "2026-07-01" });
    expect(stale.overdueDays).toBe(46);
  });

  it("leaves a charge that is merely a few days late alone", () => {
    // Weekend drift on a monthly bill is not a cancelled subscription.
    const monthly = bill({ name: "Netflix", cadenceMonths: 1 });
    expect(staleSubscriptions([monthly], charges("2026-07-14"), "2026-08-16")).toEqual(
      [],
    );
  });

  it("scales the grace period with the cadence", () => {
    // Five days late on a yearly bill is nothing; the same lateness on a monthly one is not.
    const yearly = bill({ name: "Netflix", cadenceMonths: 12 });
    expect(staleSubscriptions([yearly], charges("2025-08-06"), "2026-08-16")).toEqual(
      [],
    );
  });

  it("says nothing about a cancelled or unscheduled bill", () => {
    const old = charges("2026-01-01");
    for (const overrides of [{ status: "cancelled" as const }, { scheduled: false }]) {
      expect(
        staleSubscriptions(
          [bill({ name: "Netflix", cadenceMonths: 1, ...overrides })],
          old,
          "2026-08-16",
        ),
      ).toEqual([]);
    }
  });

  it("skips a bill with no charge and no anchor rather than inventing a due date", () => {
    // "Overdue" computed from a date nobody observed is a guess wearing a fact's clothes.
    const never = bill({ name: "Netflix", cadenceMonths: 1, anchorDate: null });
    expect(staleSubscriptions([never], new Map(), "2026-08-16")).toEqual([]);
  });

  it("falls back to the declared anchor when history does not reach the bill", () => {
    const anchored = bill({
      name: "Netflix",
      cadenceMonths: 1,
      anchorDate: "2026-05-10",
    });
    const [stale] = staleSubscriptions([anchored], new Map(), "2026-08-16");

    expect(stale.expectedOn).toBe("2026-05-10");
  });

  it("does not flag a bill whose declared next charge is still in the future", () => {
    // 1Password: a 2025 charge is on file, the user set the next one to 2027-03-30.
    const onePassword = bill({
      name: "1Password",
      cadenceMonths: 12,
      expectedCents: 7188,
      anchorDate: "2027-03-30",
    });
    const history = new Map([
      ["1Password", [{ dateKey: "2025-03-30", costCents: 7188 }]],
    ]);
    expect(staleSubscriptions([onePassword], history, "2026-08-16")).toEqual([]);
  });
});

describe("upcomingBillOccurrences", () => {
  it("includes an active scheduled bill due within the horizon", () => {
    const rent = bill({
      name: "Rent",
      cadenceMonths: 1,
      expectedCents: 210_000,
      anchorDate: "2026-08-01",
    });
    const rows = upcomingBillOccurrences([rent], new Map(), "2026-08-16", 30);
    expect(rows).toEqual([
      { name: "Rent", dateKey: "2026-09-01", amountCents: 210_000 },
    ]);
  });

  it("excludes a bill due after the horizon", () => {
    const rent = bill({
      name: "Rent",
      cadenceMonths: 1,
      expectedCents: 210_000,
      anchorDate: "2026-08-01",
    });
    expect(upcomingBillOccurrences([rent], new Map(), "2026-08-16", 7)).toEqual([]);
  });

  it("excludes an unscheduled bill — a projected date would read as knowledge", () => {
    const propane = bill({
      name: "Taylor Gas",
      cadenceMonths: 12,
      expectedCents: 50_000,
      scheduled: false,
    });
    expect(upcomingBillOccurrences([propane], new Map(), "2026-08-16", 365)).toEqual(
      [],
    );
  });

  it("excludes a bill with no declared amount", () => {
    const geico = bill({ expectedCents: null, anchorDate: "2026-08-10" });
    expect(upcomingBillOccurrences([geico], new Map(), "2026-08-16", 30)).toEqual([]);
  });
});

describe("projectForwardMonths", () => {
  it("marks the month of an annual renewal above the 12-month median", () => {
    // The 1Password case: $71.88 due 2027-03-30 is the only dated charge in the year,
    // so March is the one month that sits above a median of zeroes-plus-nothing-else.
    const onePassword = bill({
      name: "1Password",
      cadenceMonths: 12,
      expectedCents: 7188,
      anchorDate: "2026-03-30",
    });
    const months = projectForwardMonths([onePassword], new Map(), "2026-08-16");

    expect(months).toHaveLength(12);
    const march = months.find((month) => month.key === "2027-03");
    expect(march).toMatchObject({
      totalCents: 7188,
      aboveMedian: true,
    });
    expect(march?.items).toEqual([
      { name: "1Password", cents: 7188, dated: true, dateKey: "2027-03-30" },
    ]);
    expect(
      months.filter((month) => month.aboveMedian).map((month) => month.key),
    ).toEqual(["2027-03"]);
  });

  it("adds an unscheduled bill to every month with no dated row", () => {
    const propane = bill({
      name: "Taylor Gas",
      cadenceMonths: 12,
      expectedCents: 50_000,
      scheduled: false,
    });
    const months = projectForwardMonths([propane], new Map(), "2026-08-16");

    expect(months.every((month) => month.totalCents === Math.round(50_000 / 12))).toBe(
      true,
    );
    expect(months[0].items[0]).toMatchObject({ dated: false, dateKey: null });
    expect(months.every((month) => !month.aboveMedian)).toBe(true);
  });

  it("leaves cancelled bills out of the projection", () => {
    const disney = bill({
      name: "Disney+",
      status: "cancelled",
      cadenceMonths: 1,
      expectedCents: 1399,
      anchorDate: "2026-08-01",
    });
    expect(projectForwardMonths([disney], new Map(), "2026-08-16")).toEqual(
      projectForwardMonths([], new Map(), "2026-08-16"),
    );
  });
});

describe("unclaimedMerchants", () => {
  it("drops merchants already claimed", () => {
    expect(
      unclaimedMerchants(
        ["PIZZA HUT", "NETFLIX.COM", "WM SUPERCENTER"],
        ["NETFLIX.COM", "PIZZA HUT"],
      ),
    ).toEqual(["WM SUPERCENTER"]);
  });
});

describe("suggestCommitmentName", () => {
  it("drops the store number, so one branch does not name the commitment", () => {
    expect(suggestCommitmentName("PIZZA HUT #4471")).toBe("Pizza Hut");
    expect(suggestCommitmentName("WM SUPERCENTER  1234")).toBe("Wm Supercenter");
  });

  it("leaves a name someone already typed alone", () => {
    expect(suggestCommitmentName("Comcast / Xfinity")).toBe("Comcast / Xfinity");
    expect(suggestCommitmentName("MetLife Pet")).toBe("MetLife Pet");
  });

  it("title-cases a terminal's shouting", () => {
    expect(suggestCommitmentName("TAYLOR GAS CO")).toBe("Taylor Gas Co");
    // No rule recovers "1Password" from this. The guess is still easier to fix than to retype.
    expect(suggestCommitmentName("1PASSWORDTORONTOON")).toBe("1Passwordtorontoon");
  });

  it("keeps a name that is nothing but digits rather than emptying the field", () => {
    expect(suggestCommitmentName("76767")).toBe("76767");
  });
});

describe("aliasOverlap", () => {
  const monthly = { unit: "month", n: 1 } as const;

  function charges(...keys: string[]) {
    return keys.map((dateKey) => ({ dateKey }));
  }

  it("says nothing when one spelling hands off to the next", () => {
    // The vendor renamed itself in April. Merged, this is one clean monthly series.
    expect(
      aliasOverlap(
        charges("2026-01-04", "2026-02-04", "2026-03-04"),
        charges("2026-04-04", "2026-05-04", "2026-06-04"),
        monthly,
      ),
    ).toEqual([]);
  });

  it("flags two spellings charging inside the same cycle", () => {
    const found = aliasOverlap(
      charges("2026-01-04", "2026-02-04", "2026-03-04"),
      charges("2026-01-19", "2026-02-19", "2026-03-19"),
      monthly,
    );

    expect(found).toHaveLength(3);
    expect(found[0]).toEqual({
      existingKey: "2026-01-04",
      candidateKey: "2026-01-19",
      gapDays: 15,
    });
  });

  it("ignores two charges from the same spelling landing close together", () => {
    // A double charge inside one series is not evidence about the *other* series, which is
    // the only thing this function is being asked about.
    expect(
      aliasOverlap(
        charges("2026-01-04", "2026-01-06", "2026-02-04"),
        charges("2026-03-04"),
        monthly,
      ),
    ).toEqual([]);
  });

  it("scales with the cadence rather than with the calendar month", () => {
    const weekly = { unit: "day", n: 7 } as const;
    // The same five-day gap: an ordinary handoff on a weekly cadence, and two charges in one
    // cycle on a monthly one. Bucketing by calendar month could not tell these apart.
    expect(aliasOverlap(charges("2026-01-04"), charges("2026-01-09"), weekly)).toEqual(
      [],
    );
    expect(
      aliasOverlap(charges("2026-01-04"), charges("2026-01-09"), monthly),
    ).toHaveLength(1);
  });
});

describe("billAnchor", () => {
  const monthly = bill({ cadenceMonths: 1 });

  it("reads an anchor later than the last charge as the charge being waited for", () => {
    expect(
      billAnchor({ ...monthly, anchorDate: "2026-09-01" }, null, "2026-08-21"),
    ).toEqual({
      periodStartKey: "2026-08-01",
      expectedKey: "2026-09-01",
      nextDueKey: "2026-09-01",
    });
  });

  it("keeps an overdue anchor as what is expected, while pointing the next charge past today", () => {
    // The two fields differ on purpose: the accrual and the stale check need the date that
    // has already passed, and the editable column needs the one that has not.
    expect(
      billAnchor({ ...monthly, anchorDate: "2026-07-01" }, null, "2026-08-21"),
    ).toEqual({
      periodStartKey: "2026-06-01",
      expectedKey: "2026-07-01",
      nextDueKey: "2026-09-01",
    });
  });

  it("prefers the last posted charge over a stale anchor", () => {
    expect(
      billAnchor({ ...monthly, anchorDate: "2026-01-01" }, "2026-08-03", "2026-08-21"),
    ).toEqual({
      periodStartKey: "2026-08-03",
      expectedKey: "2026-09-03",
      nextDueKey: "2026-09-03",
    });
  });

  it("has nothing to say with neither a charge nor an anchor", () => {
    expect(billAnchor({ ...monthly, anchorDate: null }, null, "2026-08-21")).toEqual({
      periodStartKey: null,
      expectedKey: null,
      nextDueKey: null,
    });
  });

  it("walks a day cadence in days", () => {
    expect(
      billAnchor(
        bill({ cadenceMonths: 1, cadenceDays: 28, anchorDate: null }),
        "2026-08-14",
        "2026-08-21",
      ),
    ).toMatchObject({ expectedKey: "2026-09-11", nextDueKey: "2026-09-11" });
  });
});
