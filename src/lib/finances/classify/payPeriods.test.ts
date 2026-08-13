import { describe, expect, it } from "vitest";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { detectIncome, type Payday } from "./income";
import { buildPayPeriods, periodContaining } from "./payPeriods";

function payday(
  dateKey: string,
  amountCents: number,
  employer = "GA8248 TRUSTEDQA",
  id = dateKey,
): Payday {
  return { dateKey, employer, amountCents, transactionIds: [id] };
}

describe("buildPayPeriods", () => {
  it("gives October 2024 three windows instead of one fat month", () => {
    // The three-paycheck artifact: these three Fridays all sit in October, so a monthly
    // total looks like a raise. Each window holds one check.
    const paydays = [
      payday("2024-10-02", 259352),
      payday("2024-10-16", 259353),
      payday("2024-10-30", 259353),
    ];
    const periods = buildPayPeriods(paydays, {
      startKey: "2024-10-01",
      endKey: "2024-10-31",
    });

    const october = periods.filter(
      (period) => period.paydays.length === 1 && period.startKey.startsWith("2024-10"),
    );
    expect(october).toHaveLength(3);
    expect(october.map((period) => period.paydays[0]?.dateKey)).toEqual([
      "2024-10-02",
      "2024-10-16",
      "2024-10-30",
    ]);
    // A spend on the 20th belongs with the 16th's check, not in a shared October bucket.
    expect(periodContaining("2024-10-20", periods)?.paydays[0]?.dateKey).toBe(
      "2024-10-16",
    );
  });

  it("keeps a holiday-stretched gap as one period", () => {
    // Endava posted 19 days apart in January 2024. That is still the next paycheck.
    const periods = buildPayPeriods(
      [
        payday("2024-01-11", 247894, "ENDAVA INC"),
        payday("2024-01-30", 247894, "ENDAVA INC"),
      ],
      { startKey: "2024-01-11", endKey: "2024-01-29" },
    );

    expect(periods).toHaveLength(1);
    expect(periods[0]?.startKey).toBe("2024-01-11");
    expect(periods[0]?.endKey).toBe("2024-01-29");
    expect(periods[0]?.paydays).toHaveLength(1);
  });

  it("fills the Endava-to-TrustedQA job-change hole with empty windows", () => {
    // 2024-03-14 → 2024-05-30 is 77 days. One period would dump two months of spending
    // against the last Endava check.
    const periods = buildPayPeriods(
      [
        payday("2024-03-14", 768301, "ENDAVA INC"),
        payday("2024-05-30", 312452, "163324 TRUSTEDQA DIR DEP"),
      ],
      { startKey: "2024-03-14", endKey: "2024-05-30" },
    );

    const paid = periods.filter((period) => period.paydays.length > 0);
    const empty = periods.filter((period) => period.paydays.length === 0);
    expect(paid.map((period) => period.startKey)).toEqual(["2024-03-14", "2024-05-30"]);
    expect(empty.length).toBeGreaterThanOrEqual(3);
    expect(empty.every((period) => period.startKey < "2024-05-30")).toBe(true);
    // The windows tile: each end is the day before the next start.
    let previous = periods[0];
    for (const current of periods.slice(1)) {
      if (!previous) break;
      expect(current.startKey > previous.endKey).toBe(true);
      previous = current;
    }
  });

  it("extends inferred windows to cover a range that starts before the first job", () => {
    const periods = buildPayPeriods([payday("2023-08-15", 242438, "ENDAVA INC")], {
      startKey: "2023-07-24",
      endKey: "2023-08-20",
    });

    expect(periods[0]?.startKey).toBe("2023-07-24");
    expect(periods[0]?.paydays).toEqual([]);
    expect(periodContaining("2023-08-15", periods)?.paydays[0]?.dateKey).toBe(
      "2023-08-15",
    );
    expect(periodContaining("2023-08-20", periods)?.startKey).toBe("2023-08-15");
  });

  it("returns no calendar when there are no paydays to hang it on", () => {
    expect(
      buildPayPeriods([], { startKey: "2024-01-01", endKey: "2024-12-31" }),
    ).toEqual([]);
  });

  it("tiles the three-employer succession without overlapping or leaving a hole", () => {
    const detection = detectIncome([
      {
        id: "e1",
        transactionDate: "2023-08-15",
        description: "Deposit from ENDAVA INC DIRECT DEP",
        amountCents: 242438,
      },
      {
        id: "e2",
        transactionDate: "2023-08-30",
        description: "Deposit from ENDAVA INC DIRECT DEP",
        amountCents: 242440,
      },
      {
        id: "e3",
        transactionDate: "2023-09-14",
        description: "Deposit from ENDAVA INC DIRECT DEP",
        amountCents: 242439,
      },
      {
        id: "t1",
        transactionDate: "2024-05-30",
        description: "Deposit from 163324 TRUSTEDQA DIR DEP",
        amountCents: 312452,
      },
      {
        id: "t2",
        transactionDate: "2024-06-13",
        description: "Deposit from 163324 TRUSTEDQA DIR DEP",
        amountCents: 312452,
      },
      {
        id: "t3",
        transactionDate: "2024-06-26",
        description: "Deposit from 163324 TRUSTEDQA DIR DEP",
        amountCents: 312452,
      },
      {
        id: "t4",
        transactionDate: "2024-07-11",
        description: "Deposit from GA8248 TRUSTEDQA DIRDEP",
        amountCents: 259352,
      },
      {
        id: "t5",
        transactionDate: "2024-07-25",
        description: "Deposit from GA8248 TRUSTEDQA DIRDEP",
        amountCents: 259353,
      },
      {
        id: "t6",
        transactionDate: "2024-08-07",
        description: "Deposit from GA8248 TRUSTEDQA DIRDEP",
        amountCents: 259352,
      },
      {
        id: "t7",
        transactionDate: "2026-03-04",
        description: "Deposit from GA8248 TRUSTEDQA DIRDEP",
        amountCents: 263214,
      },
      {
        id: "t8",
        transactionDate: "2026-03-18",
        description: "Deposit from GA8248 TRUSTEDQA PAYROLL",
        amountCents: 263543,
      },
      {
        id: "t9",
        transactionDate: "2026-04-01",
        description: "Deposit from GA8248 TRUSTEDQA PAYROLL",
        amountCents: 263543,
      },
      {
        id: "t10",
        transactionDate: "2026-04-15",
        description: "Deposit from GA8248 TRUSTEDQA PAYROLL",
        amountCents: 262921,
      },
      {
        id: "t11",
        transactionDate: "2026-08-05",
        description: "Deposit from GA8248 TRUSTEDQA PAYROLL",
        amountCents: 231121,
      },
    ]);

    const periods = buildPayPeriods(detection.paydays, {
      startKey: "2023-08-15",
      endKey: "2026-08-10",
    });

    expect(periods[0]?.startKey).toBe("2023-08-15");
    expect(periods.at(-1)?.endKey).toBe("2026-08-10");
    let previous = periods[0];
    for (const current of periods.slice(1)) {
      if (!previous) break;
      expect(current.startKey > previous.endKey).toBe(true);
      // Contiguous: no calendar day sits between two windows.
      expect(current.startKey <= shiftDateKey(previous.endKey, 1)).toBe(true);
      previous = current;
    }
    expect(periodContaining("2024-03-20", periods)?.paydays).toEqual([]);
    expect(periodContaining("2026-03-18", periods)?.paydays[0]?.employer).toBe(
      "GA8248 TRUSTEDQA",
    );
  });
});

describe("periodContaining", () => {
  it("returns null outside the calendar", () => {
    const periods = buildPayPeriods([payday("2024-10-16", 259353)], {
      startKey: "2024-10-16",
      endKey: "2024-10-29",
    });
    expect(periodContaining("2024-10-15", periods)).toBeNull();
    expect(periodContaining("2024-10-30", periods)).toBeNull();
  });
});
