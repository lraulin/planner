import { describe, expect, it } from "vitest";
import {
  billAnchor,
  nextChargeWriteError,
  periodIndex,
  projectForwardMonths,
  upcomingBillOccurrences,
  billsNeedingReview,
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
    leadDays: 0,
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
});

describe("billsNeedingReview", () => {
  /** The panel's real composition: server-resolved anchors, then the grace check. */
  const reviews = (
    bills: readonly StoredBillRow[],
    lastCharge: string | null,
    todayKey: string,
  ) =>
    billsNeedingReview(
      bills.map((row) => ({ ...row, ...billAnchor(row, lastCharge, todayKey) })),
      todayKey,
    );

  it("flags a monthly subscription whose charge never arrived", () => {
    // The Disney+/Paramount+/HBO Max case: still on the list, no longer billing.
    const monthly = bill({ name: "Netflix", cadenceMonths: 1, expectedCents: 1599 });
    const [stale] = reviews([monthly], "2026-06-01", "2026-08-16");

    expect(stale).toMatchObject({ name: "Netflix", expectedOn: "2026-07-01" });
    expect(stale.overdueDays).toBe(46);
  });

  it("leaves a charge that is merely a few days late alone", () => {
    // Weekend drift on a monthly bill is not a cancelled subscription.
    const monthly = bill({ name: "Netflix", cadenceMonths: 1 });
    expect(reviews([monthly], "2026-07-14", "2026-08-16")).toEqual([]);
  });

  it("holds a monthly bill six days late, which grace 5 would have flagged", () => {
    // The floor is 7 because rent's worst real lateness against its calendar occurrence was
    // six days. Grace 5 put three of its 24 cycles on the review list for a day each.
    const monthly = bill({ name: "Netflix", cadenceMonths: 1 });
    expect(reviews([monthly], "2026-07-10", "2026-08-16")).toEqual([]);
    expect(reviews([monthly], "2026-07-08", "2026-08-16")).toHaveLength(1);
  });

  it("scales the grace period with the cadence", () => {
    // Five days late on a yearly bill is nothing; the same lateness on a monthly one is not.
    const yearly = bill({ name: "Netflix", cadenceMonths: 12 });
    expect(reviews([yearly], "2025-08-06", "2026-08-16")).toEqual([]);
  });

  it("says nothing about a cancelled or unscheduled bill", () => {
    for (const overrides of [{ status: "cancelled" as const }, { scheduled: false }]) {
      expect(
        reviews(
          [bill({ name: "Netflix", cadenceMonths: 1, ...overrides })],
          "2026-01-01",
          "2026-08-16",
        ),
      ).toEqual([]);
    }
  });

  it("skips a bill with no charge and no anchor rather than inventing a due date", () => {
    // "Overdue" computed from a date nobody observed is a guess wearing a fact's clothes.
    const never = bill({ name: "Netflix", cadenceMonths: 1, anchorDate: null });
    expect(reviews([never], null, "2026-08-16")).toEqual([]);
  });

  it("falls back to the declared anchor when history does not reach the bill", () => {
    const anchored = bill({
      name: "Netflix",
      cadenceMonths: 1,
      anchorDate: "2026-05-10",
    });
    const [stale] = reviews([anchored], null, "2026-08-16");

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
    expect(reviews([onePassword], "2025-03-30", "2026-08-16")).toEqual([]);
  });

  it("names the due date a declared bill's late charge pays", () => {
    const rent = bill({ name: "Rent", cadenceMonths: 1, dueDay: 1, leadDays: 7 });
    const [stale] = reviews([rent], "2026-06-26", "2026-08-16");

    expect(stale).toMatchObject({ expectedOn: "2026-07-25", dueOn: "2026-08-01" });
  });

  it("clears rent off the list, which the walk kept it on", () => {
    // Posted 2026-08-26 for the 2026-09-01 due date; the walk expected 2026-09-26 and
    // reported the 2026-09-24 charge as never having arrived.
    const rent = bill({ name: "Rent", cadenceMonths: 1, dueDay: 1, leadDays: 7 });
    expect(reviews([rent], "2026-08-26", "2026-09-05")).toEqual([]);
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

describe("billAnchor", () => {
  const monthly = bill({ cadenceMonths: 1 });

  it("reads an anchor later than the last charge as the charge being waited for", () => {
    expect(
      billAnchor({ ...monthly, anchorDate: "2026-09-01" }, null, "2026-08-21"),
    ).toEqual({
      periodStartKey: "2026-08-01",
      expectedKey: "2026-09-01",
      nextDueKey: "2026-09-01",
      dueKey: null,
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
      dueKey: null,
    });
  });

  it("prefers the last posted charge over a stale anchor", () => {
    expect(
      billAnchor({ ...monthly, anchorDate: "2026-01-01" }, "2026-08-03", "2026-08-21"),
    ).toEqual({
      periodStartKey: "2026-08-03",
      expectedKey: "2026-09-03",
      nextDueKey: "2026-09-03",
      dueKey: null,
    });
  });

  it("has nothing to say with neither a charge nor an anchor", () => {
    expect(billAnchor({ ...monthly, anchorDate: null }, null, "2026-08-21")).toEqual({
      periodStartKey: null,
      expectedKey: null,
      nextDueKey: null,
      dueKey: null,
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

  // — With a declared due day, the dates come from the calendar ————————————————

  const rent = bill({ cadenceMonths: 1, dueDay: 1, leadDays: 7 });

  it("matches the last charge to the occurrence it paid and waits for the next", () => {
    // Posted 2026-08-26 against a 2026-08-25 expectation, for the 2026-09-01 due date.
    expect(billAnchor(rent, "2026-08-26", "2026-09-05")).toEqual({
      periodStartKey: "2026-08-25",
      expectedKey: "2026-09-24",
      nextDueKey: "2026-09-24",
      dueKey: "2026-10-01",
    });
  });

  it("does not let an early charge drag the expectation forward", () => {
    // The walk answered 2026-05-17 here, and then read the ordinary 2026-05-27 payment as
    // ten days late. The calendar series re-anchors instead of absorbing the deviation.
    expect(billAnchor(rent, "2025-04-17", "2025-05-01")).toMatchObject({
      expectedKey: "2025-05-25",
      dueKey: "2025-06-01",
    });
  });

  it("projects from the due day alone when nothing has posted yet", () => {
    // The walk had nothing to say without history; a declared due day is itself an anchor.
    expect(billAnchor(rent, null, "2026-09-05")).toMatchObject({
      expectedKey: "2026-09-24",
      dueKey: "2026-10-01",
    });
  });

  it("keeps walking a bill that declares no due day", () => {
    // The regression that would be invisible: every existing bill has `dueDay: null`.
    expect(billAnchor({ ...rent, dueDay: null }, "2026-08-26", "2026-09-05")).toEqual(
      billAnchor(monthly, "2026-08-26", "2026-09-05"),
    );
  });

  it("ignores a due day on a day cadence or an unscheduled bill", () => {
    for (const overrides of [{ cadenceDays: 28 }, { scheduled: false }]) {
      expect(
        billAnchor({ ...rent, ...overrides }, "2026-08-26", "2026-09-05").dueKey,
      ).toBeNull();
    }
  });
});

describe("nextChargeWriteError", () => {
  it("allows any date when nothing has posted yet", () => {
    expect(nextChargeWriteError("2026-01-01", null)).toBeNull();
  });

  it("allows clearing the override whether or not there is a last charge", () => {
    expect(nextChargeWriteError(null, null)).toBeNull();
    expect(nextChargeWriteError(null, "2026-08-04")).toBeNull();
  });

  it("allows a date after the last posted charge", () => {
    expect(nextChargeWriteError("2026-08-05", "2026-08-04")).toBeNull();
  });

  it("refuses a date on the last posted charge, not only one before it", () => {
    // `billAnchor` treats equal as "already had", so storing the same day would
    // look like the save bounced. `<` instead of `<=` would let that through.
    expect(nextChargeWriteError("2026-08-04", "2026-08-04")).toBe(
      "Next charge must be after the last posted charge (2026-08-04).",
    );
    expect(nextChargeWriteError("2026-08-03", "2026-08-04")).toBe(
      "Next charge must be after the last posted charge (2026-08-04).",
    );
  });
});
