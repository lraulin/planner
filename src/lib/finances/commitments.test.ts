import { describe, expect, it } from "vitest";
import {
  billAnchor,
  nextChargeWriteError,
  periodIndex,
  projectForwardMonths,
  billsNeedingReview,
  billsNeedingAmountReview,
  suggestCommitmentName,
  unclaimedMerchants,
  type StoredBillRow,
} from "./commitments";
import { type Cadence } from "./recurringBills";

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
    // Seven days is still inside the grace; the question starts on the eighth.
    expect(reviews([monthly], "2026-07-09", "2026-08-16")).toEqual([]);
  });

  it("lists the longest-missing bill first", () => {
    const listed = billsNeedingReview(
      [
        {
          ...bill({ id: "a", name: "Recent", cadenceMonths: 1 }),
          expectedKey: "2026-08-01",
          dueKey: null,
        },
        {
          ...bill({ id: "b", name: "Oldest", cadenceMonths: 1 }),
          expectedKey: "2026-06-01",
          dueKey: null,
        },
      ],
      "2026-08-16",
    );
    expect(listed.map((row) => row.name)).toEqual(["Oldest", "Recent"]);
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

describe("billsNeedingAmountReview", () => {
  const charges = (
    billId: string,
    amounts: readonly { dateKey: string; costCents: number }[],
  ) => new Map([[billId, amounts]]);

  it("proposes SimpliSafe's settled $34.97 against a declared $31.79", () => {
    const simplisafe = bill({
      id: "simplisafe",
      name: "Home Security (SimpliSafe)",
      cadenceMonths: 1,
      expectedCents: 3179,
    });
    const [row] = billsNeedingAmountReview(
      [simplisafe],
      charges("simplisafe", [
        { dateKey: "2026-04-17", costCents: 3497 },
        { dateKey: "2026-05-17", costCents: 3497 },
        { dateKey: "2026-06-17", costCents: 3497 },
        { dateKey: "2026-07-17", costCents: 3497 },
        { dateKey: "2026-08-17", costCents: 3497 },
      ]),
    );
    expect(row).toMatchObject({
      billId: "simplisafe",
      declaredCents: 3179,
      observedCents: 3497,
    });
  });

  it("does not propose a SMECO-shaped disagreement", () => {
    const smeco = bill({
      id: "smeco",
      name: "Electricity (SMECO)",
      cadenceMonths: 1,
      expectedCents: 17794,
    });
    expect(
      billsNeedingAmountReview(
        [smeco],
        charges("smeco", [
          { dateKey: "2026-06-01", costCents: 12000 },
          { dateKey: "2026-07-01", costCents: 21000 },
          { dateKey: "2026-08-01", costCents: 8900 },
        ]),
      ),
    ).toEqual([]);
  });

  it("reads the three most recent charges, so an old price does not outvote a new one", () => {
    const streaming = bill({
      id: "tv",
      name: "TV",
      cadenceMonths: 1,
      expectedCents: 1_599,
    });
    const [row] = billsNeedingAmountReview(
      [streaming],
      charges("tv", [
        { dateKey: "2026-02-01", costCents: 1_599 },
        { dateKey: "2026-03-01", costCents: 1_599 },
        { dateKey: "2026-04-01", costCents: 1_599 },
        { dateKey: "2026-06-01", costCents: 1_899 },
        { dateKey: "2026-07-01", costCents: 1_899 },
        { dateKey: "2026-08-01", costCents: 1_899 },
      ]),
    );
    expect(row).toMatchObject({ declaredCents: 1_599, observedCents: 1_899 });
  });

  it("waits for three charges before proposing a new amount", () => {
    const streaming = bill({
      id: "tv",
      name: "TV",
      cadenceMonths: 1,
      expectedCents: 1_599,
    });
    expect(
      billsNeedingAmountReview(
        [streaming],
        charges("tv", [
          { dateKey: "2026-07-01", costCents: 1_899 },
          { dateKey: "2026-08-01", costCents: 1_899 },
        ]),
      ),
    ).toEqual([]);
  });

  it("does not propose a bill that declares no amount", () => {
    const open = bill({
      id: "open",
      name: "Open",
      cadenceMonths: 1,
      expectedCents: null,
    });
    expect(
      billsNeedingAmountReview(
        [open],
        charges("open", [
          { dateKey: "2026-06-01", costCents: 1000 },
          { dateKey: "2026-07-01", costCents: 1000 },
          { dateKey: "2026-08-01", costCents: 1000 },
        ]),
      ),
    ).toEqual([]);
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

  it("keeps a month-end bill on the month's end after a short month", () => {
    // SMECO, anchored Aug 31. Each step used to start from the last one's clamped date, so
    // Sep 30 became Oct 30 and Feb 28 became Mar 28 for the rest of the year.
    const smeco = bill({
      name: "SMECO",
      cadenceMonths: 1,
      expectedCents: 17_794,
      anchorDate: "2026-08-31",
    });
    const dates = projectForwardMonths([smeco], new Map(), "2026-09-10").flatMap(
      (month) => month.items.map((item) => item.dateKey),
    );

    expect(dates.slice(0, 7)).toEqual([
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });

  it("projects a day-cadence bill in days, not months", () => {
    // Every 28 days: after the first charge the walk used to step by `cadenceMonths` (1).
    const vetsource = bill({
      name: "Vetsource",
      cadenceMonths: 1,
      cadenceDays: 28,
      expectedCents: 4_500,
      anchorDate: "2026-09-14",
    });
    const dates = projectForwardMonths([vetsource], new Map(), "2026-09-10").flatMap(
      (month) => month.items.map((item) => item.dateKey),
    );

    expect(dates.slice(0, 3)).toEqual(["2026-09-14", "2026-10-12", "2026-11-09"]);
  });

  const datesOf = (
    row: StoredBillRow,
    charges: { dateKey: string; costCents: number }[],
    todayKey: string,
  ) =>
    projectForwardMonths([row], new Map([[row.id, charges]]), todayKey).flatMap(
      (month) => month.items.map((item) => item.dateKey),
    );

  it("walks from the latest charge on file, not the first", () => {
    const monthly = bill({ cadenceMonths: 1, expectedCents: 1_000 });
    const charges = [
      { dateKey: "2026-06-03", costCents: 1_000 },
      { dateKey: "2026-08-15", costCents: 1_000 },
    ];
    expect(datesOf(monthly, charges, "2026-08-16")[0]).toBe("2026-09-15");
  });

  it("lets a charge newer than the anchor move the series", () => {
    // Anchored May 10, but it last charged Aug 20: the bank's date is the newer fact.
    const monthly = bill({
      cadenceMonths: 1,
      expectedCents: 1_000,
      anchorDate: "2026-05-10",
    });
    const charges = [{ dateKey: "2026-08-20", costCents: 1_000 }];
    expect(datesOf(monthly, charges, "2026-08-21")[0]).toBe("2026-09-20");
  });

  it("counts a charge due today as ahead, not behind", () => {
    const monthly = bill({
      cadenceMonths: 1,
      expectedCents: 1_000,
      anchorDate: "2026-09-10",
    });
    expect(datesOf(monthly, [], "2026-09-10")[0]).toBe("2026-09-10");
  });

  it("still projects a whole year from a charge eighteen months old", () => {
    const monthly = bill({ cadenceMonths: 1, expectedCents: 1_000 });
    const charges = [{ dateKey: "2025-03-15", costCents: 1_000 }];
    const dates = datesOf(monthly, charges, "2026-09-16");
    expect(dates[0]).toBe("2026-10-15");
    expect(dates).toHaveLength(11);
  });

  it("phases a declared bill by its anchor, not by an older charge", () => {
    const quarterly = bill({
      cadenceMonths: 3,
      expectedCents: 1_000,
      dueDay: 1,
      anchorDate: "2026-10-01",
    });
    const charges = [{ dateKey: "2026-08-01", costCents: 1_000 }];
    expect(datesOf(quarterly, charges, "2026-09-10")[0]).toBe("2026-10-01");
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

  it("reads an anchor of today as due today, not next cycle", () => {
    expect(
      billAnchor({ ...monthly, anchorDate: "2026-08-21" }, null, "2026-08-21")
        .nextDueKey,
    ).toBe("2026-08-21");
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

  it("a charge that posted a day early retires the date predicted for it", () => {
    // Dropbox: yearly, predicted 2026-09-06, charged 2026-09-05.
    expect(
      billAnchor(
        bill({ cadenceMonths: 12, anchorDate: "2026-09-06" }),
        "2026-09-05",
        "2026-09-06",
      ),
    ).toMatchObject({ expectedKey: "2027-09-05", nextDueKey: "2027-09-05" });
  });

  it("a charge a month before a monthly anchor does not", () => {
    // Claude (31 days) and Chewy (27): half a cadence is ~15 days, so these keep
    // the stored date. A tuned-constant band would have made Chewy a coin flip.
    expect(
      billAnchor(
        bill({ cadenceMonths: 1, anchorDate: "2026-09-08" }),
        "2026-08-08",
        "2026-09-06",
      ).expectedKey,
    ).toBe("2026-09-08");
    expect(
      billAnchor(
        bill({ cadenceMonths: 1, anchorDate: "2026-10-01" }),
        "2026-09-04",
        "2026-09-06",
      ).expectedKey,
    ).toBe("2026-10-01");
  });

  it("a stray charge nowhere near the anchor retires nothing", () => {
    // A $12 CVS row hand-filed onto Geico must not retire the December prediction.
    expect(
      billAnchor(
        bill({ cadenceMonths: 6, anchorDate: "2026-12-26" }),
        "2026-08-20",
        "2026-09-06",
      ).expectedKey,
    ).toBe("2026-12-26");
  });

  it("a bill with no anchor still walks", () => {
    const undeclared = bill({ cadenceMonths: 1, anchorDate: null });
    expect(billAnchor(undeclared, "2026-08-26", "2026-09-06")).toEqual(
      billAnchor(
        { ...undeclared, anchorDate: "2026-01-01" },
        "2026-08-26",
        "2026-09-06",
      ),
    );
  });
});

/**
 * Production, 2026-09-06, 33 non-cancelled bill envelopes. `lastCharge` is what the
 * payee-claim reader returned that day — Task 3 changes the basis, not these dates.
 * `shown` is `expectedKey` under the old "anchor later than last charge" rule.
 */
const LIVE_BILLS_2026_09_06: readonly {
  name: string;
  cadenceMonths: number;
  cadenceDays?: number | null;
  scheduled: boolean;
  anchorDate: string | null;
  lastCharge: string | null;
  shown: string | null;
}[] = [
  {
    name: "Amazon Prime Membership",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-18",
    lastCharge: null,
    shown: "2026-09-18",
  },
  {
    name: "CVS ExtraCare",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-21",
    lastCharge: null,
    shown: "2026-09-21",
  },
  {
    name: "Car Insurance (Geico)",
    cadenceMonths: 6,
    scheduled: true,
    anchorDate: "2024-12-26",
    lastCharge: "2026-06-26",
    shown: "2026-12-26",
  },
  {
    name: "ChatGPT",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-05",
    lastCharge: "2026-09-05",
    shown: "2026-10-05",
  },
  {
    name: "Chewy",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-10-01",
    lastCharge: "2026-09-04",
    shown: "2026-10-01",
  },
  {
    name: "Claude",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-08",
    lastCharge: "2026-08-08",
    shown: "2026-09-08",
  },
  {
    name: "Curiosity Stream",
    cadenceMonths: 12,
    scheduled: true,
    anchorDate: "2027-01-09",
    lastCharge: "2026-01-09",
    shown: "2027-01-09",
  },
  {
    name: "Dante's Meds (VetSource)",
    cadenceMonths: 1,
    cadenceDays: 28,
    scheduled: true,
    anchorDate: "2026-09-10",
    lastCharge: "2026-08-13",
    shown: "2026-09-10",
  },
  {
    name: "Domain Name (Go Daddy)",
    cadenceMonths: 12,
    scheduled: true,
    anchorDate: "2027-08-22",
    lastCharge: "2026-08-24",
    shown: "2027-08-22",
  },
  {
    name: "Dropbox",
    cadenceMonths: 12,
    scheduled: true,
    anchorDate: "2026-09-06",
    lastCharge: "2026-09-05",
    shown: "2026-09-06",
  },
  {
    name: "Electricity (SMECO)",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-08-31",
    lastCharge: "2026-09-01",
    shown: "2026-10-01",
  },
  {
    name: "GRAY MIRROR",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-06",
    lastCharge: "2026-08-06",
    shown: "2026-09-06",
  },
  {
    name: "Grok",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-08-27",
    lastCharge: "2026-08-28",
    shown: "2026-09-28",
  },
  {
    name: "Home Security (SimpliSafe)",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-17",
    lastCharge: "2026-08-17",
    shown: "2026-09-17",
  },
  {
    name: "Huel",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-10-01",
    lastCharge: null,
    shown: "2026-10-01",
  },
  {
    name: "Internet (Comcast)",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-21",
    lastCharge: "2026-08-21",
    shown: "2026-09-21",
  },
  {
    name: "Lotus Eaters",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-22",
    lastCharge: "2026-08-24",
    shown: "2026-09-22",
  },
  {
    name: "Neon Database",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-10-01",
    lastCharge: "2026-09-01",
    shown: "2026-10-01",
  },
  {
    name: "Paste",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-07",
    lastCharge: null,
    shown: "2026-09-07",
  },
  {
    name: "Pet Insurance (MetLife)",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-21",
    lastCharge: "2026-08-21",
    shown: "2026-09-21",
  },
  {
    name: "Phone (Mint Mobile)",
    cadenceMonths: 3,
    scheduled: true,
    anchorDate: "2026-10-21",
    lastCharge: null,
    shown: "2026-10-21",
  },
  {
    name: "Propane (Taylor Gas)",
    cadenceMonths: 12,
    scheduled: false,
    anchorDate: null,
    lastCharge: "2025-10-24",
    shown: null,
  },
  {
    name: "Rent",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-05",
    lastCharge: "2026-08-26",
    shown: "2026-09-05",
  },
  {
    name: "Rent Reporting",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-09",
    lastCharge: "2026-08-09",
    shown: "2026-09-09",
  },
  {
    name: "Renter's Insurance (Sure)",
    cadenceMonths: 12,
    scheduled: true,
    anchorDate: "2026-12-12",
    lastCharge: "2025-12-12",
    shown: "2026-12-12",
  },
  {
    name: "Robokiller",
    cadenceMonths: 12,
    scheduled: true,
    anchorDate: "2026-09-20",
    lastCharge: null,
    shown: "2026-09-20",
  },
  {
    name: "SimpleFIN",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-17",
    lastCharge: "2026-08-17",
    shown: "2026-09-17",
  },
  {
    name: "Sky Tonight",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-20",
    lastCharge: null,
    shown: "2026-09-20",
  },
  {
    name: "Spotify",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-13",
    lastCharge: "2026-08-13",
    shown: "2026-09-13",
  },
  {
    name: "Trash (Evergreen Disposal)",
    cadenceMonths: 3,
    scheduled: true,
    anchorDate: "2026-10-05",
    lastCharge: "2026-07-05",
    shown: "2026-10-05",
  },
  {
    name: "Water & Sewer (St Mary's County)",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-22",
    lastCharge: "2026-08-25",
    shown: "2026-09-22",
  },
  {
    name: "YouTube",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-19",
    lastCharge: "2026-08-19",
    shown: "2026-09-19",
  },
  {
    name: "iCloud+",
    cadenceMonths: 1,
    scheduled: true,
    anchorDate: "2026-09-11",
    lastCharge: null,
    shown: "2026-09-11",
  },
];

describe("billAnchor over the 33 live bills", () => {
  it("retires only Dropbox and Rent", () => {
    const todayKey = "2026-09-06";
    const moved: string[] = [];
    for (const row of LIVE_BILLS_2026_09_06) {
      const after = row.scheduled
        ? billAnchor(
            bill({
              name: row.name,
              cadenceMonths: row.cadenceMonths,
              cadenceDays: row.cadenceDays,
              scheduled: row.scheduled,
              anchorDate: row.anchorDate,
            }),
            row.lastCharge,
            todayKey,
          ).expectedKey
        : null;
      if (after !== row.shown) moved.push(row.name);
    }
    expect(moved).toEqual(["Dropbox", "Rent"]);
    expect(
      billAnchor(
        bill({ cadenceMonths: 12, scheduled: true, anchorDate: "2026-09-06" }),
        "2026-09-05",
        todayKey,
      ).expectedKey,
    ).toBe("2027-09-05");
    expect(
      billAnchor(
        bill({ cadenceMonths: 1, scheduled: true, anchorDate: "2026-09-05" }),
        "2026-08-26",
        todayKey,
      ).expectedKey,
    ).toBe("2026-09-26");
  });
});

describe("nextChargeWriteError", () => {
  const monthly: Cadence = { unit: "month", n: 1 };
  const yearly: Cadence = { unit: "month", n: 12 };
  const semiAnnual: Cadence = { unit: "month", n: 6 };

  it("allows any date when nothing has posted yet", () => {
    expect(nextChargeWriteError("2026-01-01", null, monthly)).toBeNull();
  });

  it("allows clearing the override whether or not there is a last charge", () => {
    expect(nextChargeWriteError(null, null, monthly)).toBeNull();
    expect(nextChargeWriteError(null, "2026-08-04", monthly)).toBeNull();
  });

  it("allows a date a full cadence out", () => {
    expect(nextChargeWriteError("2026-09-04", "2026-08-04", monthly)).toBeNull();
    expect(nextChargeWriteError("2027-09-05", "2026-09-05", yearly)).toBeNull();
  });

  it("refuses a date the last posted charge already covers", () => {
    expect(nextChargeWriteError("2026-08-04", "2026-08-04", monthly)).toBe(
      "The charge on 2026-08-04 already covers that date.",
    );
    expect(nextChargeWriteError("2026-08-03", "2026-08-04", monthly)).toBe(
      "The charge on 2026-08-04 already covers that date.",
    );
    // Dropbox: typing the predicted date after a charge that posted a day early.
    expect(nextChargeWriteError("2026-09-06", "2026-09-05", yearly)).toBe(
      "The charge on 2026-09-05 already covers that date.",
    );
    // A Next charge nine days after a semi-annual bill's posted charge.
    expect(nextChargeWriteError("2026-08-10", "2026-08-01", semiAnnual)).toBe(
      "The charge on 2026-08-01 already covers that date.",
    );
  });
});
