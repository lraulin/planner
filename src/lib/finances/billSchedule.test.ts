import { describe, expect, it } from "vitest";
import { daysBetweenKeys } from "@/lib/schedule/geometry";
import {
  declaredSeries,
  declaresSchedule,
  firstOccurrenceFrom,
  nearestOccurrence,
  nextOccurrenceAfter,
  occurrenceAt,
  suggestLeadDays,
  type SchedulableBill,
} from "./billSchedule";

function bill(overrides: Partial<SchedulableBill> = {}): SchedulableBill {
  return {
    cadenceMonths: 1,
    cadenceDays: null,
    dueDay: 1,
    leadDays: 0,
    scheduled: true,
    ...overrides,
  };
}

/**
 * Rent's real postings, 2024-09-26 → 2026-08-26, read out of the live database during
 * shaping. Due the 1st, autopay seven days ahead, and the bank posts on whatever business
 * day that lands on — day of the month spans the 17th to the 31st, which is why a walk from
 * the last posting flagged 16 of these 24 as never having arrived.
 */
const RENT_POSTINGS = [
  "2024-09-26",
  "2024-10-28",
  "2024-11-25",
  "2024-12-23",
  "2025-01-31",
  "2025-02-28",
  "2025-03-26",
  "2025-04-17",
  "2025-05-27",
  "2025-06-24",
  "2025-07-25",
  "2025-08-25",
  "2025-09-24",
  "2025-10-27",
  "2025-11-24",
  "2025-12-26",
  "2026-01-26",
  "2026-02-23",
  "2026-03-25",
  "2026-04-27",
  "2026-05-26",
  "2026-06-29",
  "2026-07-31",
  "2026-08-26",
] as const;

const RENT = bill({ dueDay: 1, leadDays: 7 });

describe("declaresSchedule", () => {
  it("needs a due day, a month cadence and a predictable date", () => {
    expect(declaresSchedule(bill({ dueDay: 1 }))).toBe(true);
    expect(declaresSchedule(bill({ dueDay: null }))).toBe(false);
    // Vetsource ships every 28 days; the day of the month marches backwards, so a due day
    // would be a lie about it.
    expect(declaresSchedule(bill({ dueDay: 1, cadenceDays: 28 }))).toBe(false);
    // Propane: the yearly cost is knowable, the delivery date is a tank sensor.
    expect(declaresSchedule(bill({ dueDay: 1, scheduled: false }))).toBe(false);
  });
});

describe("occurrenceAt", () => {
  it("splits the contract date from the cash flow", () => {
    const series = declaredSeries(RENT, "2026-08-26");
    expect(series).not.toBeNull();
    const occurrence = occurrenceAt(series!, 0);
    expect(occurrence.dueKey).toBe("2026-09-01");
    expect(occurrence.expectedKey).toBe("2026-08-25");
  });

  it("clamps a 31st into short months without the clamp sticking", () => {
    const series = declaredSeries(bill({ dueDay: 31 }), "2026-01-31")!;
    // The walk answer is Jan 31, Feb 28, Mar 28, Apr 28 — a bill that arrives three days
    // early forever after one February.
    expect(occurrenceAt(series, 0).dueKey).toBe("2026-01-31");
    expect(occurrenceAt(series, 1).dueKey).toBe("2026-02-28");
    expect(occurrenceAt(series, 2).dueKey).toBe("2026-03-31");
    expect(occurrenceAt(series, 3).dueKey).toBe("2026-04-30");
    expect(occurrenceAt(series, 4).dueKey).toBe("2026-05-31");
  });

  it("does not stick even when the seed month is the short one", () => {
    const series = declaredSeries(bill({ dueDay: 31 }), "2026-02-15")!;
    expect(occurrenceAt(series, 0).dueKey).toBe("2026-02-28");
    expect(occurrenceAt(series, 1).dueKey).toBe("2026-03-31");
  });

  it("gives February its extra day in a leap year", () => {
    const series = declaredSeries(bill({ dueDay: 30 }), "2028-01-30")!;
    expect(occurrenceAt(series, 1).dueKey).toBe("2028-02-29");
    const common = declaredSeries(bill({ dueDay: 30 }), "2027-01-30")!;
    expect(occurrenceAt(common, 1).dueKey).toBe("2027-02-28");
  });

  it("keeps a semi-annual bill's phase", () => {
    const semi = bill({ cadenceMonths: 6, dueDay: 15 });
    const series = declaredSeries(semi, "2026-03-15")!;
    expect(occurrenceAt(series, 0).dueKey).toBe("2026-03-15");
    expect(occurrenceAt(series, 1).dueKey).toBe("2026-09-15");
    expect(occurrenceAt(series, 2).dueKey).toBe("2027-03-15");
    // Not September/March — a semi-annual bill is not "every 182 days".
    expect(occurrenceAt(series, -1).dueKey).toBe("2025-09-15");
  });

  it("phases a semi-annual bill by the month the charge paid, not the month it posted", () => {
    // The charge posts a week early and lands in the previous calendar month; the series it
    // belongs to is still March/September.
    const semi = bill({ cadenceMonths: 6, dueDay: 1, leadDays: 7 });
    const series = declaredSeries(semi, "2026-02-24")!;
    expect(occurrenceAt(series, 0).dueKey).toBe("2026-03-01");
    expect(occurrenceAt(series, 1).dueKey).toBe("2026-09-01");
  });
});

describe("nearestOccurrence", () => {
  it("matches a charge that arrived early to the occurrence it paid", () => {
    const series = declaredSeries(RENT, "2026-08-26")!;
    // Expected 2025-04-24, posted a week ahead of it. The walk called this the March
    // occurrence's charge and then expected May's on the 17th.
    const matched = nearestOccurrence(series, "2025-04-17");
    expect(matched.dueKey).toBe("2025-05-01");
    expect(matched.expectedKey).toBe("2025-04-24");
  });

  it("matches a charge that arrived late to the occurrence it paid", () => {
    const series = declaredSeries(RENT, "2026-08-26")!;
    const matched = nearestOccurrence(series, "2025-01-31");
    expect(matched.dueKey).toBe("2025-02-01");
    expect(matched.expectedKey).toBe("2025-01-25");
  });

  it("breaks a tie toward the occurrence already owed", () => {
    const monthly = declaredSeries(bill({ dueDay: 15 }), "2026-01-15")!;
    // 2026-01-30 is 15 days after January's and 16 before February's.
    expect(nearestOccurrence(monthly, "2026-01-30").dueKey).toBe("2026-01-15");
  });

  it("reaches an occurrence years from the seed", () => {
    const series = declaredSeries(RENT, "2026-08-26")!;
    expect(nearestOccurrence(series, "2019-03-02").dueKey).toBe("2019-03-01");
    expect(nearestOccurrence(series, "2031-11-27").dueKey).toBe("2031-12-01");
  });
});

describe("the real rent history", () => {
  const series = declaredSeries(RENT, "2026-08-26")!;

  it("matches all 24 postings to 24 distinct occurrences", () => {
    const matched = RENT_POSTINGS.map(
      (posting) => nearestOccurrence(series, posting).index,
    );
    expect(new Set(matched).size).toBe(RENT_POSTINGS.length);
    // Consecutive, in order: no month is skipped and none is paid twice.
    for (let i = 1; i < matched.length; i++) {
      expect(matched[i]).toBe(matched[i - 1] + 1);
    }
  });

  it("keeps every deviation inside a 7-day grace", () => {
    const deviations = RENT_POSTINGS.map((posting) =>
      Math.abs(
        daysBetweenKeys(nearestOccurrence(series, posting).expectedKey, posting),
      ),
    );
    // 7 is the worst (2025-04-17, a week early); grace 5 would flag three of these.
    expect(Math.max(...deviations)).toBe(7);
  });

  it("expects the next charge on 2026-09-24 for a 2026-10-01 due date", () => {
    const last = nearestOccurrence(series, "2026-08-26");
    const next = nextOccurrenceAfter(series, last);
    expect(next.expectedKey).toBe("2026-09-24");
    expect(next.dueKey).toBe("2026-10-01");
  });
});

describe("firstOccurrenceFrom", () => {
  it("keeps an occurrence expected today", () => {
    const series = declaredSeries(RENT, "2026-08-26")!;
    expect(firstOccurrenceFrom(series, "2026-09-24").expectedKey).toBe("2026-09-24");
  });

  it("steps past one already expected", () => {
    const series = declaredSeries(RENT, "2026-08-26")!;
    expect(firstOccurrenceFrom(series, "2026-09-25").expectedKey).toBe("2026-10-25");
  });
});

describe("suggestLeadDays", () => {
  const monthly = { unit: "month", n: 1 } as const;

  it("reads rent's seven-day autopay out of its own history", () => {
    expect(suggestLeadDays(1, RENT_POSTINGS, monthly)).toBe(6);
  });

  it("ignores one wild charge, which a mean would not", () => {
    // Four charges a week ahead of the 15th, and one that a bank holiday pushed a week past
    // it. The mean is 4; the median is the arrangement that actually holds.
    const keys = ["2026-01-08", "2026-02-08", "2026-03-08", "2026-04-08", "2026-05-22"];
    expect(suggestLeadDays(15, keys, monthly)).toBe(7);
  });

  it("clamps a bill that posts after its due date to no lead at all", () => {
    // Lateness is what grace is for; a negative lead would move the whole series.
    expect(
      suggestLeadDays(1, ["2026-01-05", "2026-02-04", "2026-03-06"], monthly),
    ).toBe(0);
  });

  it("declines to guess from one charge, or from a day cadence", () => {
    expect(suggestLeadDays(1, ["2026-01-25"], monthly)).toBeNull();
    expect(suggestLeadDays(1, RENT_POSTINGS, { unit: "day", n: 28 })).toBeNull();
  });
});
