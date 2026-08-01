import { describe, expect, it } from "vitest";
import {
  describeRule,
  nextOccurrence,
  nthWeekdayOfMonth,
  type RecurrenceRule,
} from "./pattern";

/** Local midnight, the same thing `DateField` writes and the engine returns. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function key(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function rule(over: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    frequency: "daily",
    interval: 1,
    pattern: "interval",
    byWeekday: null,
    monthDay: null,
    ordinal: null,
    weekday: null,
    month: null,
    ...over,
  };
}

describe("nextOccurrence", () => {
  it("does not repeat when the frequency is none", () => {
    expect(nextOccurrence(rule({ frequency: "none" }), day("2026-08-01"))).toBeNull();
  });

  it("never returns the day it was given", () => {
    // The boundary the whole feature rests on: a routine ticked today is not back today.
    // Every pattern that could land on `from` itself is checked here, because the naive
    // "first date matching the rule" returns `from` for all of them.
    const cases: RecurrenceRule[] = [
      rule({ frequency: "daily" }),
      rule({ frequency: "weekly", pattern: "by_weekday", byWeekday: [6] }),
      rule({ frequency: "monthly", pattern: "by_month_day", monthDay: 1 }),
      rule({ frequency: "monthly", pattern: "by_ordinal", ordinal: 1, weekday: 6 }),
      rule({ frequency: "yearly", pattern: "by_month_day", month: 8, monthDay: 1 }),
      rule({
        frequency: "yearly",
        pattern: "by_ordinal",
        month: 8,
        ordinal: 1,
        weekday: 6,
      }),
    ];

    // 2026-08-01 is the first Saturday of August, so it satisfies every rule above.
    for (const r of cases) {
      expect(key(nextOccurrence(r, day("2026-08-01")))).not.toBe("2026-08-01");
    }
  });

  it("ignores the time of day and returns local midnight", () => {
    const evening = new Date("2026-08-01T21:45:00");
    const next = nextOccurrence(rule({ frequency: "daily" }), evening)!;
    expect(key(next)).toBe("2026-08-02");
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
  });

  it("floors an interval below 1 rather than standing still", () => {
    expect(key(nextOccurrence(rule({ interval: 0 }), day("2026-08-01")))).toBe(
      "2026-08-02",
    );
  });

  describe("daily", () => {
    it("steps by the interval", () => {
      expect(key(nextOccurrence(rule({ interval: 3 }), day("2026-08-01")))).toBe(
        "2026-08-04",
      );
    });

    it("skips the weekend for every weekday", () => {
      const r = rule({ pattern: "weekday" });
      expect(key(nextOccurrence(r, day("2026-08-07")))).toBe("2026-08-10"); // Fri → Mon
      expect(key(nextOccurrence(r, day("2026-08-10")))).toBe("2026-08-11"); // Mon → Tue
    });

    it("takes only Saturday and Sunday for every weekend", () => {
      const r = rule({ pattern: "weekend" });
      expect(key(nextOccurrence(r, day("2026-08-01")))).toBe("2026-08-02"); // Sat → Sun
      expect(key(nextOccurrence(r, day("2026-08-02")))).toBe("2026-08-08"); // Sun → Sat
    });
  });

  describe("weekly", () => {
    it("takes the next ticked day later in the same week", () => {
      // Mon/Wed/Fri from a Wednesday is Friday, not next Monday — the mistake that turns
      // a three-day-a-week routine into a weekly one.
      const r = rule({
        frequency: "weekly",
        pattern: "by_weekday",
        byWeekday: [1, 3, 5],
      });
      expect(key(nextOccurrence(r, day("2026-08-05")))).toBe("2026-08-07");
    });

    it("jumps the full interval once the week is used up", () => {
      // Every 2 weeks on Mon & Thu: Thu → the Monday 11 days later, not the next Monday.
      const r = rule({
        frequency: "weekly",
        interval: 2,
        pattern: "by_weekday",
        byWeekday: [1, 4],
      });
      expect(key(nextOccurrence(r, day("2026-08-06")))).toBe("2026-08-17");
    });

    it("gives up on an empty weekday set instead of looping", () => {
      const r = rule({ frequency: "weekly", pattern: "by_weekday", byWeekday: [] });
      expect(nextOccurrence(r, day("2026-08-01"))).toBeNull();
    });

    it("steps whole weeks when no days are picked", () => {
      expect(
        key(
          nextOccurrence(rule({ frequency: "weekly", interval: 2 }), day("2026-08-01")),
        ),
      ).toBe("2026-08-15");
    });
  });

  describe("monthly", () => {
    it("holds the day of the month across the interval", () => {
      const r = rule({
        frequency: "monthly",
        interval: 2,
        pattern: "by_month_day",
        monthDay: 15,
      });
      expect(key(nextOccurrence(r, day("2026-08-15")))).toBe("2026-10-15");
    });

    it("clamps day 31 to the last day of a short month, then recovers", () => {
      // The clamp must not become the new pattern: September's 30th still leads to the 31st.
      const r = rule({ frequency: "monthly", pattern: "by_month_day", monthDay: 31 });
      expect(key(nextOccurrence(r, day("2026-08-31")))).toBe("2026-09-30");
      expect(key(nextOccurrence(r, day("2026-09-30")))).toBe("2026-10-31");
    });

    it("clamps day 30 to February in a common year and a leap year", () => {
      const r = rule({ frequency: "monthly", pattern: "by_month_day", monthDay: 30 });
      expect(key(nextOccurrence(r, day("2026-01-30")))).toBe("2026-02-28");
      expect(key(nextOccurrence(r, day("2028-01-30")))).toBe("2028-02-29");
    });

    it("finds the ordinal weekday", () => {
      // The first Saturday of September 2026 is the 5th.
      const r = rule({
        frequency: "monthly",
        pattern: "by_ordinal",
        ordinal: 1,
        weekday: 6,
      });
      expect(key(nextOccurrence(r, day("2026-08-01")))).toBe("2026-09-05");
    });

    it("counts 'last' from the end, not as the fourth", () => {
      // August 2026 has five Saturdays: 1, 8, 15, 22, 29. "Last" is the 29th; a
      // fourth-or-fifth implementation would say the 22nd.
      const r = rule({
        frequency: "monthly",
        pattern: "by_ordinal",
        ordinal: -1,
        weekday: 6,
      });
      expect(key(nextOccurrence(r, day("2026-07-25")))).toBe("2026-08-29");
    });
  });

  describe("yearly", () => {
    it("holds the month and day", () => {
      const r = rule({
        frequency: "yearly",
        pattern: "by_month_day",
        month: 8,
        monthDay: 1,
      });
      expect(key(nextOccurrence(r, day("2026-08-01")))).toBe("2027-08-01");
    });

    it("finds this year's occurrence when the rule was just switched on", () => {
      const r = rule({
        frequency: "yearly",
        pattern: "by_month_day",
        month: 12,
        monthDay: 25,
      });
      expect(key(nextOccurrence(r, day("2026-08-01")))).toBe("2026-12-25");
    });

    it("clamps Feb 29 to Feb 28 in a common year", () => {
      const r = rule({
        frequency: "yearly",
        pattern: "by_month_day",
        month: 2,
        monthDay: 29,
      });
      expect(key(nextOccurrence(r, day("2028-02-29")))).toBe("2029-02-28");
    });

    it("finds the ordinal weekday of a month", () => {
      // The third Thursday of November 2026 is the 19th.
      const r = rule({
        frequency: "yearly",
        pattern: "by_ordinal",
        month: 11,
        ordinal: 3,
        weekday: 4,
      });
      expect(key(nextOccurrence(r, day("2026-08-01")))).toBe("2026-11-19");
    });
  });

  it("keeps local midnight across a spring-forward", () => {
    // 2027-03-14 is the US spring-forward. A millisecond-based step would land at 01:00.
    const next = nextOccurrence(rule({ frequency: "daily" }), day("2027-03-13"))!;
    expect(key(next)).toBe("2027-03-14");
    expect(next.getHours()).toBe(0);
  });

  it("returns null for a pattern whose fields were never filled in", () => {
    expect(
      nextOccurrence(
        rule({ frequency: "monthly", pattern: "by_ordinal" }),
        day("2026-08-01"),
      ),
    ).toBeNull();
    expect(
      nextOccurrence(
        rule({ frequency: "yearly", pattern: "by_month_day" }),
        day("2026-08-01"),
      ),
    ).toBeNull();
  });
});

describe("nthWeekdayOfMonth", () => {
  it("finds the first of a weekday that opens the month", () => {
    expect(key(nthWeekdayOfMonth(2026, 8, 1, 6))).toBe("2026-08-01");
  });

  it("finds the last when the month has five", () => {
    expect(key(nthWeekdayOfMonth(2026, 8, -1, 6))).toBe("2026-08-29");
  });

  it("finds the last when the month has four", () => {
    // September 2026 has four Saturdays: 5, 12, 19, 26.
    expect(key(nthWeekdayOfMonth(2026, 9, -1, 6))).toBe("2026-09-26");
  });
});

describe("describeRule", () => {
  it("names a regenerating rule by its span, not its pattern", () => {
    expect(describeRule(rule({ frequency: "weekly", interval: 2 }), "regenerate")).toBe(
      "2 weeks after each completion",
    );
    expect(describeRule(rule({ frequency: "daily" }), "regenerate")).toBe(
      "1 day after each completion",
    );
  });

  it("lists the ticked days", () => {
    expect(
      describeRule(
        rule({
          frequency: "weekly",
          interval: 2,
          pattern: "by_weekday",
          byWeekday: [3, 1],
        }),
        "scheduled",
      ),
    ).toBe("Every 2 weeks on Mon, Wed");
  });

  it("names an ordinal in words", () => {
    expect(
      describeRule(
        rule({ frequency: "monthly", pattern: "by_ordinal", ordinal: -1, weekday: 6 }),
        "scheduled",
      ),
    ).toBe("Every month on the last Sat");
  });

  it("names a yearly date", () => {
    expect(
      describeRule(
        rule({ frequency: "yearly", pattern: "by_month_day", month: 8, monthDay: 1 }),
        "scheduled",
      ),
    ).toBe("Every year on August 1");
  });
});
