import { describe, expect, it } from "vitest";
import {
  detectIncome,
  incomeFromPaydays,
  normalizedMonthlyIncome,
  summarizeClassifiedIncome,
  type IncomeRow,
} from "./income";

/**
 * Real deposits from the imported history. Invented amounts would not catch a detector
 * that quietly requires a constant paycheck, and this history does not have one: Endava's
 * last check is three times a normal one, TrustedQA changed wording mid-job, and a bonus
 * posted on the same day as a regular check.
 */

function row(
  id: string,
  transactionDate: string,
  description: string,
  amountCents: number,
): IncomeRow {
  return { id, transactionDate, description, amountCents };
}

const ENDAVA = "Deposit from ENDAVA INC DIRECT DEP";
const TRUSTEDQA_EARLY = "Deposit from 163324 TRUSTEDQA DIR DEP";
const TRUSTEDQA_DIRDEP = "Deposit from GA8248 TRUSTEDQA DIRDEP";
const TRUSTEDQA_PAYROLL = "Deposit from GA8248 TRUSTEDQA PAYROLL";

/** The 15 Endava deposits, 2023-08-15 → 2024-03-14. */
const ENDAVA_CHECKS: IncomeRow[] = [
  row("e1", "2023-08-15", ENDAVA, 242438),
  row("e2", "2023-08-30", ENDAVA, 242440),
  row("e3", "2023-09-14", ENDAVA, 242439),
  row("e4", "2023-09-28", ENDAVA, 242439),
  row("e5", "2023-10-12", ENDAVA, 242440),
  row("e6", "2023-10-30", ENDAVA, 242438),
  row("e7", "2023-11-14", ENDAVA, 242439),
  row("e8", "2023-11-29", ENDAVA, 242440),
  row("e9", "2023-12-14", ENDAVA, 242439),
  row("e10", "2023-12-28", ENDAVA, 242438),
  row("e11", "2024-01-11", ENDAVA, 247894),
  row("e12", "2024-01-30", ENDAVA, 247894),
  row("e13", "2024-02-14", ENDAVA, 247894),
  row("e14", "2024-02-27", ENDAVA, 75996),
  row("e15", "2024-03-14", ENDAVA, 768301),
];

/** First three TrustedQA deposits, under the company code the bank later dropped. */
const TRUSTEDQA_EARLY_CHECKS: IncomeRow[] = [
  row("t0a", "2024-05-30", TRUSTEDQA_EARLY, 312452),
  row("t0b", "2024-06-13", TRUSTEDQA_EARLY, 312452),
  row("t0c", "2024-06-26", TRUSTEDQA_EARLY, 312452),
];

/** DIRDEP then PAYROLL — the same job after the bank changed its wording. */
const TRUSTEDQA_JOB: IncomeRow[] = [
  row("t1", "2024-07-11", TRUSTEDQA_DIRDEP, 259352),
  row("t2", "2024-07-25", TRUSTEDQA_DIRDEP, 259353),
  row("t3", "2024-08-07", TRUSTEDQA_DIRDEP, 259352),
  row("t4", "2024-10-02", TRUSTEDQA_DIRDEP, 259352),
  row("t5", "2024-10-16", TRUSTEDQA_DIRDEP, 259353),
  row("t6", "2024-10-30", TRUSTEDQA_DIRDEP, 259353),
  row("t7", "2024-11-27", TRUSTEDQA_DIRDEP, 259352),
  row("t7b", "2024-11-27", TRUSTEDQA_DIRDEP, 24636),
  row("t8", "2026-03-04", TRUSTEDQA_DIRDEP, 263214),
  row("t9", "2026-03-18", TRUSTEDQA_PAYROLL, 263543),
  row("t10", "2026-04-01", TRUSTEDQA_PAYROLL, 263543),
  row("t11", "2026-08-05", TRUSTEDQA_PAYROLL, 231121),
];

describe("detectIncome", () => {
  it("summarizes the income rows already stored before a preview", () => {
    const summary = summarizeClassifiedIncome(
      ENDAVA_CHECKS.slice(0, 3).map((entry) => ({ ...entry, derivedFlow: "income" })),
    );
    expect(summary).toEqual({
      paydayCount: 3,
      medianPaycheckCents: 242439,
      normalizedMonthlyIncomeCents: 525285,
    });
  });

  it("reads one income history across Endava and both TrustedQA wordings", () => {
    const result = detectIncome([
      ...ENDAVA_CHECKS,
      ...TRUSTEDQA_EARLY_CHECKS,
      ...TRUSTEDQA_JOB,
    ]);

    expect(result.flows.size).toBe(
      ENDAVA_CHECKS.length + TRUSTEDQA_EARLY_CHECKS.length + TRUSTEDQA_JOB.length,
    );
    expect(result.paydays.map((payday) => payday.employer)).toEqual([
      ...Array(15).fill("ENDAVA INC"),
      ...Array(3).fill("163324 TRUSTEDQA DIR DEP"),
      ...Array(11).fill("GA8248 TRUSTEDQA"),
    ]);
    expect(result.paydays[0]?.dateKey).toBe("2023-08-15");
    expect(result.paydays.at(-1)?.dateKey).toBe("2026-08-05");
    // DIRDEP and PAYROLL are one employer — the wording change is not a job change.
    expect(
      result.paydays.filter((payday) => payday.employer === "GA8248 TRUSTEDQA"),
    ).toHaveLength(11);
  });

  it("does not treat PenFed sweeps as paychecks", () => {
    // Irregular amounts, no 14-day cadence. These are transfers from a bank that was
    // never imported; calling them income would invent earnings the accounts cannot see.
    const sweeps = [
      row(
        "p1",
        "2023-07-24",
        "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021",
        1000000,
      ),
      row(
        "p2",
        "2023-07-28",
        "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021",
        1840000,
      ),
      row(
        "p3",
        "2023-08-04",
        "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021",
        19900,
      ),
      row(
        "p4",
        "2023-08-11",
        "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021",
        50000,
      ),
      row(
        "p5",
        "2023-08-21",
        "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021",
        30000,
      ),
      row(
        "p6",
        "2023-12-26",
        "Preauthorized Deposit from PENTAGON FEDERAL CREDIT UNION checking account XXXXXX2021",
        51000,
      ),
    ];
    const result = detectIncome([...sweeps, ...ENDAVA_CHECKS]);

    expect(result.flows.has("p1")).toBe(false);
    expect(result.flows.has("e1")).toBe(true);
    expect(result.paydays.every((payday) => payday.employer === "ENDAVA INC")).toBe(
      true,
    );
  });

  it("does not treat monthly VA benefits as a paycheck series", () => {
    // Monthly, so the cadence window never opens. rules.ts names this payer instead.
    const va = [
      row("v1", "2024-02-05", "Deposit from VACP TREAS 310 XXVA BENEF", 17123),
      row("v2", "2024-02-28", "Deposit from VACP TREAS 310 XXVA BENEF", 17123),
      row("v3", "2024-03-30", "Deposit from VACP TREAS 310 XXVA BENEF", 17123),
      row("v4", "2024-04-29", "Deposit from VACP TREAS 310 XXVA BENEF", 17123),
    ];
    const result = detectIncome(va);
    expect(result.flows.size).toBe(0);
    expect(result.paydays).toEqual([]);
  });

  it("ignores a one-off credit that has no series behind it", () => {
    const result = detectIncome([
      row("c1", "2025-03-17", "Deposit from COINBASE INC. 52FF9A83", 196250),
      row("c2", "2026-02-03", "Deposit from COINBASE INC. 3CBBCC49", 151700),
    ]);
    expect(result.flows.size).toBe(0);
  });

  it("folds a same-day bonus into the payday it posted with", () => {
    const result = detectIncome(TRUSTEDQA_JOB);
    const bonusDay = result.paydays.find((payday) => payday.dateKey === "2024-11-27");

    expect(bonusDay?.amountCents).toBe(259352 + 24636);
    expect(bonusDay?.transactionIds).toEqual(["t7", "t7b"]);
    expect(result.flows.get("t7")).toBe("income");
    expect(result.flows.get("t7b")).toBe("income");
    // One payday, not two — otherwise the calendar would split a single Friday.
    expect(
      result.paydays.filter((payday) => payday.dateKey === "2024-11-27"),
    ).toHaveLength(1);
  });

  it("keeps a withheld transfer series from becoming a second job", () => {
    // The savings-side paycheck split is biweekly too. matchTransfers claims it first.
    const splits = [
      row("s1", "2024-07-12", "Paycheck Percentage Transfer", 77806),
      row("s2", "2024-07-26", "Paycheck Percentage Transfer", 77806),
      row("s3", "2024-08-08", "Paycheck Percentage Transfer", 77806),
      row("s4", "2024-08-22", "Paycheck Percentage Transfer", 77806),
    ];
    const withheld = detectIncome(
      [...TRUSTEDQA_JOB, ...splits],
      new Set(splits.map((s) => s.id)),
    );
    const leaked = detectIncome([...TRUSTEDQA_JOB, ...splits]);

    expect(withheld.flows.has("s1")).toBe(false);
    expect(
      withheld.paydays.every((payday) => payday.employer === "GA8248 TRUSTEDQA"),
    ).toBe(true);
    // Without the withhold, cadence alone cannot tell the split from a second paycheck.
    expect(leaked.flows.get("s1")).toBe("income");
  });

  it("does not mark a debit, even from a payroll merchant", () => {
    const result = detectIncome([
      ...ENDAVA_CHECKS,
      row("clawback", "2024-03-15", ENDAVA, -50000),
    ]);
    expect(result.flows.has("clawback")).toBe(false);
  });

  it("produces the same series regardless of input order", () => {
    const rows = [...ENDAVA_CHECKS, ...TRUSTEDQA_JOB];
    const forward = detectIncome(rows);
    const backward = detectIncome([...rows].reverse());
    expect(forward.paydays).toEqual(backward.paydays);
    expect([...forward.flows.entries()].sort()).toEqual(
      [...backward.flows.entries()].sort(),
    );
  });
});

describe("normalizedMonthlyIncome", () => {
  it("is median paycheck × 26 ÷ 12", () => {
    // $2,478.35 is a typical TrustedQA net. 247835 × 26 ÷ 12 = 536975.83… → $5,369.76.
    expect(normalizedMonthlyIncome(247835)).toBe(536976);
  });

  it("reports the median of the detected paydays, not a blended monthly total", () => {
    const result = detectIncome(ENDAVA_CHECKS);
    const amounts = ENDAVA_CHECKS.map((check) => check.amountCents).sort(
      (left, right) => left - right,
    );
    // 15 paydays: the middle one is the 8th.
    expect(result.medianPaycheckCents).toBe(amounts[7]);
    expect(result.normalizedMonthlyIncomeCents).toBe(
      normalizedMonthlyIncome(amounts[7]),
    );
  });
});

describe("incomeFromPaydays", () => {
  it("reproduces detectIncome's median rather than averaging the paydays", () => {
    const result = detectIncome(ENDAVA_CHECKS);
    expect(incomeFromPaydays(result.paydays)).toEqual({
      medianPaycheckCents: result.medianPaycheckCents,
      monthlyCents: result.normalizedMonthlyIncomeCents,
      annualCents: result.medianPaycheckCents * 26,
    });
  });
});
