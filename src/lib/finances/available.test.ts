import { describe, expect, it } from "vitest";
import { nextPayday, paydaysPerCadence } from "./available";
import type { Payday } from "./classify/income";

/**
 * These tests exist because a payday projected off the wrong anchor produces a day count
 * that looks like knowledge and is not.
 */

const NO_OVERRIDE = { anchorDate: null, cadenceDays: null };

function payday(dateKey: string): Payday {
  return { dateKey, employer: "TrustedQA", amountCents: 247433, transactionIds: [] };
}

describe("nextPayday", () => {
  const series = [payday("2026-07-24"), payday("2026-08-07")];

  it("projects the next fortnight from the newest payday", () => {
    expect(nextPayday(series, NO_OVERRIDE, "2026-08-16")).toEqual({
      dateKey: "2026-08-21",
      daysAway: 5,
      source: "detected",
    });
  });

  it("crosses a month boundary without drifting", () => {
    expect(nextPayday(series, NO_OVERRIDE, "2026-08-25").dateKey).toBe("2026-09-04");
  });

  it("reports zero days when payday is today", () => {
    // Not 14. A payday that has arrived is today's payday until the day turns over.
    expect(nextPayday(series, NO_OVERRIDE, "2026-08-21")).toMatchObject({
      dateKey: "2026-08-21",
      daysAway: 0,
    });
  });

  it("uses the median gap, so a job-change hole does not drag the projection late", () => {
    // 77 days between Endava's last check and TrustedQA's first — a real gap from the data.
    const withHole = [
      payday("2026-05-08"),
      payday("2026-07-24"),
      payday("2026-08-07"),
      payday("2026-08-21"),
    ];
    // Gaps are 77, 14, 14 → median 14. A mean would give 35 and put payday in late September.
    expect(nextPayday(withHole, NO_OVERRIDE, "2026-08-25").dateKey).toBe("2026-09-04");
  });

  it("ignores a zero gap from two employers paying on the same day", () => {
    const sameDay = [
      { ...payday("2026-08-07"), employer: "TrustedQA" },
      { ...payday("2026-08-07"), employer: "VA" },
      payday("2026-08-21"),
    ];
    expect(nextPayday(sameDay, NO_OVERRIDE, "2026-08-25").dateKey).toBe("2026-09-04");
  });

  it("lets the override win and says so", () => {
    expect(
      nextPayday(series, { anchorDate: "2026-08-03", cadenceDays: 14 }, "2026-08-16"),
    ).toEqual({ dateKey: "2026-08-17", daysAway: 1, source: "override" });
  });

  it("falls back to detection when the override is half-filled", () => {
    // An anchor with no cadence is not a schedule, and defaulting the cadence would invent one.
    expect(
      nextPayday(series, { anchorDate: "2026-08-03", cadenceDays: null }, "2026-08-16")
        .source,
    ).toBe("detected");
  });

  it("reports unknown rather than guessing from an empty series", () => {
    expect(nextPayday([], NO_OVERRIDE, "2026-08-16")).toEqual({
      dateKey: null,
      daysAway: null,
      source: "unknown",
    });
  });

  it("assumes a fortnight from a single payday", () => {
    expect(nextPayday([payday("2026-08-07")], NO_OVERRIDE, "2026-08-16").dateKey).toBe(
      "2026-08-21",
    );
  });
});

describe("paydaysPerCadence", () => {
  it("gives a monthly bill two paychecks and a yearly one twenty-six", () => {
    expect(paydaysPerCadence({ unit: "month", n: 1 })).toBe(2);
    expect(paydaysPerCadence({ unit: "month", n: 3 })).toBe(7);
    expect(paydaysPerCadence({ unit: "month", n: 6 })).toBe(13);
    expect(paydaysPerCadence({ unit: "month", n: 12 })).toBe(26);
  });
});
