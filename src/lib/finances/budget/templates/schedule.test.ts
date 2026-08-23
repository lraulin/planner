import { describe, expect, it } from "vitest";

import { monthKeyOf } from "../envelope";
import { occurrences } from "@/lib/finances/schedules/recur";
import {
  baseMonthlyContribution,
  runScheduleLine,
  runSchedules,
  sinkingContribution,
  type ScheduleSnapshot,
} from "./schedule";
import type { ScheduleTemplate } from "./types";

function snap(overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    id: "rent",
    name: "Rent",
    completed: false,
    amountCents: -185_000,
    nextDate: "2026-08-01",
    config: { frequency: "monthly", interval: 1, start: "2026-01-01" },
    ...overrides,
  };
}

function line(overrides: Partial<ScheduleTemplate> = {}): ScheduleTemplate {
  return {
    id: "t1",
    directive: "template",
    type: "schedule",
    priority: 0,
    scheduleId: "rent",
    ...overrides,
  };
}

describe("runScheduleLine", () => {
  it("assigns this month's amount for a monthly schedule due this month", () => {
    expect(runScheduleLine(line(), snap(), "2026-08-01", 0).toBudget).toBe(185_000);
  });

  it("takes the absolute value of a negative bill amount", () => {
    expect(
      runScheduleLine(line(), snap({ amountCents: -5000 }), "2026-08-01", 0).toBudget,
    ).toBe(5000);
  });

  it("sinks a yearly schedule: remaining / (months until due + 1), reduced by carry-in", () => {
    const taxes = snap({
      id: "taxes",
      name: "Taxes",
      amountCents: -240_000,
      nextDate: "2027-04-15",
      config: { frequency: "yearly", interval: 1, start: "2026-04-15" },
    });
    // August 2026 → April 2027 is 8 months, 9 slices. 240000 / 9 = 26667.
    expect(sinkingContribution([taxes], "2026-08-01", 0)).toBe(Math.round(240_000 / 9));
    expect(
      runScheduleLine(line({ scheduleId: "taxes" }), taxes, "2026-08-01", 0).toBudget,
    ).toBe(Math.round(240_000 / 9));
    // $1,000 already saved → (240000 - 100000) / 9.
    expect(sinkingContribution([taxes], "2026-08-01", 100_000)).toBe(
      Math.round(140_000 / 9),
    );
  });

  it("with full, assigns only in the due month", () => {
    const small = snap({
      id: "sf",
      name: "SimpleFIN",
      amountCents: -1500,
      nextDate: "2027-05-01",
      config: { frequency: "yearly", interval: 1, start: "2026-05-01" },
    });
    const full = line({ scheduleId: "sf", full: true });
    expect(runScheduleLine(full, small, "2026-08-01", 0).toBudget).toBe(0);
    expect(
      runScheduleLine(full, { ...small, nextDate: "2026-08-01" }, "2026-08-01", 0)
        .toBudget,
    ).toBe(1500);
  });

  it("sums weekly occurrences that fall in the month", () => {
    const netflix = snap({
      id: "pizza",
      name: "Pizza",
      amountCents: -2000,
      nextDate: "2026-08-07",
      config: {
        frequency: "weekly",
        interval: 1,
        start: "2026-08-07",
      },
    });
    const inMonth = occurrences(netflix.config, "2026-08-01", 8).filter(
      (key) => monthKeyOf(key) === "2026-08-01",
    );
    expect(inMonth.length).toBeGreaterThan(1);
    expect(
      runScheduleLine(line({ scheduleId: "pizza" }), netflix, "2026-08-01", 0).toBudget,
    ).toBe(2000 * inMonth.length);
  });

  it("returns 0 and an error when the schedule is missing or completed", () => {
    expect(runScheduleLine(line(), undefined, "2026-08-01", 0)).toEqual({
      toBudget: 0,
      error: "Schedule does not exist",
    });
    expect(
      runScheduleLine(line(), snap({ completed: true }), "2026-08-01", 0).error,
    ).toMatch(/completed/);
  });

  it("does not re-clamp day 31: a monthly day-31 schedule skips September", () => {
    const geico = snap({
      id: "geico",
      name: "Geico",
      amountCents: -12_000,
      nextDate: "2026-08-31",
      config: {
        frequency: "monthly",
        interval: 1,
        start: "2026-01-31",
        patterns: [{ type: "day", value: 31 }],
      },
    });
    const keys = occurrences(geico.config, "2026-08-01", 3);
    expect(keys.some((key) => key.startsWith("2026-09"))).toBe(false);
    expect(keys.some((key) => key.startsWith("2026-10"))).toBe(true);
  });
});

describe("already funded", () => {
  it("falls back to the base monthly rate when carry-in already covers the target", () => {
    const taxes = snap({
      id: "taxes",
      name: "Taxes",
      amountCents: -240_000,
      nextDate: "2027-04-15",
      config: { frequency: "yearly", interval: 1, start: "2026-04-15" },
    });
    expect(baseMonthlyContribution(taxes)).toBe(240_000 / 12);
    expect(
      runScheduleLine(line({ scheduleId: "taxes" }), taxes, "2026-08-01", 240_000)
        .toBudget,
    ).toBe(Math.round(240_000 / 12));
  });
});

describe("runSchedules", () => {
  it("still applies other lines when one schedule is missing", () => {
    const result = runSchedules(
      [line(), line({ id: "t2", scheduleId: "gone" })],
      new Map([["rent", snap()]]),
      "2026-08-01",
      0,
    );
    expect(result.toBudget).toBe(185_000);
    expect(result.errors).toContain("Schedule does not exist");
  });
});
