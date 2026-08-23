import { describe, expect, it } from "vitest";
import { weekdayOfDateKey } from "@/lib/schedule/geometry";
import { applySkipWeekend, occurrences, type RecurConfig } from "./recur";

function monthly(overrides: Partial<RecurConfig> = {}): RecurConfig {
  return { frequency: "monthly", start: "2026-01-15", ...overrides };
}

describe("occurrences", () => {
  it("anchors interval on config.start, never on the read date", () => {
    // A bimonthly that began in January (odd) must still land on odd months when asked
    // in August. Counting interval from `fromKey` would flip the parity.
    const config = monthly({ interval: 2, start: "2026-01-15" });
    expect(occurrences(config, "2026-08-01", 3)).toEqual([
      "2026-09-15",
      "2026-11-15",
      "2027-01-15",
    ]);
  });

  it("skips a day-31 pattern in a 30-day month rather than clamping", () => {
    // rschedule / RFC 5545 drop recurrence instances whose date does not exist.
    // Actual's discover even refuses monthly day > 28 so it will not silently skip
    // (`find-schedules.ts`). Clamping to the 30th would be `shiftDateKeyMonths`,
    // which is the bill-cadence answer and the wrong one here.
    const config = monthly({
      start: "2026-01-31",
      patterns: [{ type: "day", value: 31 }],
    });
    expect(occurrences(config, "2026-01-01", 4)).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });

  it("expands last-day-of-month and nth-weekday-from-end patterns", () => {
    expect(
      occurrences(
        monthly({
          start: "2026-01-01",
          patterns: [{ type: "day", value: -1 }],
        }),
        "2026-01-01",
        3,
      ),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);

    // February 2026: last Tuesday is the 24th.
    expect(
      occurrences(
        monthly({
          start: "2026-02-01",
          patterns: [{ type: "TU", value: -1 }],
        }),
        "2026-02-01",
        1,
      ),
    ).toEqual(["2026-02-24"]);
  });

  it("lists the 2nd Tuesday of every other month", () => {
    // January 2026: 2nd Tuesday is the 13th. Interval 2 keeps March, May, …
    const config = monthly({
      start: "2026-01-01",
      interval: 2,
      patterns: [{ type: "TU", value: 2 }],
    });
    expect(occurrences(config, "2026-01-01", 3)).toEqual([
      "2026-01-13",
      "2026-03-10",
      "2026-05-12",
    ]);
  });

  it("moves a weekend occurrence into the prior month when solving before", () => {
    // 1 Nov 2026 is a Sunday. `before` walks to Friday 30 October.
    expect(applySkipWeekend("2026-11-01", "before")).toBe("2026-10-30");

    const config = monthly({
      start: "2026-11-01",
      skipWeekend: true,
      weekendSolveMode: "before",
      patterns: [{ type: "day", value: 1 }],
    });
    // fromKey has to sit before the solved date; asking from 1 Nov would drop 30 Oct
    // as already past, which is the cursor's problem, not generation's.
    const next = occurrences(config, "2026-10-01", 1);
    expect(next).toEqual(["2026-10-30"]);
    expect(weekdayOfDateKey(next[0] ?? "")).toBe(5);
  });

  it("treats endDate as inclusive, and counts after_n_occurrences before weekend-solve", () => {
    const until = monthly({
      start: "2026-01-15",
      endMode: "on_date",
      endDate: "2026-03-15",
    });
    expect(occurrences(until, "2026-01-01", 10)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);

    // Three Saturdays starting 2026-01-03, solved `before` to Fridays. The count is the
    // raw rrule `count` (Actual's `endOccurrences` maps to rschedule `count`); skipWeekend
    // runs after generation, so a fourth Friday must not appear.
    const counted: RecurConfig = {
      frequency: "weekly",
      start: "2026-01-03",
      endMode: "after_n_occurrences",
      endOccurrences: 3,
      skipWeekend: true,
      weekendSolveMode: "before",
    };
    expect(occurrences(counted, "2026-01-01", 10)).toEqual([
      "2026-01-02",
      "2026-01-09",
      "2026-01-16",
    ]);
  });

  it("returns the last occurrence of an exhausted bounded schedule, not empty", () => {
    // Actual's `getNextDate` falls back to a reverse take when the forward take is empty.
    const config = monthly({
      start: "2026-01-15",
      endMode: "after_n_occurrences",
      endOccurrences: 2,
    });
    expect(occurrences(config, "2026-06-01", 1)).toEqual(["2026-02-15"]);
    expect(occurrences(config, "2026-06-01", 1, { reverse: true })).toEqual([
      "2026-02-15",
    ]);
  });

  it("floors a missing or zero interval to 1", () => {
    expect(
      occurrences(monthly({ interval: 0, start: "2026-01-15" }), "2026-01-15", 2),
    ).toEqual(["2026-01-15", "2026-02-15"]);
  });

  it("skips 29 February in common years on a yearly schedule", () => {
    const config: RecurConfig = { frequency: "yearly", start: "2024-02-29" };
    expect(occurrences(config, "2024-02-29", 3)).toEqual([
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
  });
});

describe("applySkipWeekend", () => {
  it("leaves weekdays alone", () => {
    expect(applySkipWeekend("2026-08-21", "before")).toBe("2026-08-21");
    expect(applySkipWeekend("2026-08-21", "after")).toBe("2026-08-21");
  });

  it("moves Saturday and Sunday to Friday or Monday", () => {
    expect(applySkipWeekend("2026-08-22", "before")).toBe("2026-08-21");
    expect(applySkipWeekend("2026-08-23", "before")).toBe("2026-08-21");
    expect(applySkipWeekend("2026-08-22", "after")).toBe("2026-08-24");
    expect(applySkipWeekend("2026-08-23", "after")).toBe("2026-08-24");
  });
});
