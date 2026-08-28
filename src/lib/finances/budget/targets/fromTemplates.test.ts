import { describe, expect, it } from "vitest";

import { targetFromTemplates } from "./fromTemplates";
import type { Target } from "./types";

const addMonthly: Target = {
  behavior: "add",
  cadence: { unit: "month", day: 31 },
  amountCents: 13_945,
};

describe("targetFromTemplates", () => {
  it("turns simple + monthlyCents into add every month", () => {
    expect(
      targetFromTemplates([
        {
          id: "t1",
          directive: "template",
          type: "simple",
          priority: 0,
          monthlyCents: 13_945,
        },
      ]),
    ).toEqual({ target: addMonthly, discarded: 0, droppedRemainder: false });
  });

  it("turns simple + limit into have-available each month", () => {
    expect(
      targetFromTemplates([
        {
          id: "t1",
          directive: "template",
          type: "simple",
          priority: 0,
          limit: { amountCents: 50_000, hold: false },
        },
      ]).target,
    ).toEqual({
      behavior: "upTo",
      cadence: { unit: "month", day: 31 },
      amountCents: 50_000,
    });
  });

  it("turns weekly into upTo, not add — leftover cash covers the next occurrence", () => {
    expect(
      targetFromTemplates([
        {
          id: "w1",
          directive: "template",
          type: "weekly",
          priority: 0,
          amountCents: 21_096,
          weekday: 0,
        },
      ]).target,
    ).toEqual({
      behavior: "upTo",
      cadence: { unit: "week", weekday: 0 },
      amountCents: 21_096,
    });
  });

  it("turns by into a one-shot balance, and by+annual into a yearly upTo", () => {
    expect(
      targetFromTemplates([
        {
          id: "b1",
          directive: "template",
          type: "by",
          priority: 0,
          amountCents: 10_000_000,
          month: "2026-10",
        },
      ]).target,
    ).toEqual({
      behavior: "balance",
      cadence: { unit: "by", month: "2026-10" },
      amountCents: 10_000_000,
    });
    expect(
      targetFromTemplates([
        {
          id: "b2",
          directive: "template",
          type: "by",
          priority: 0,
          amountCents: 120_000,
          month: "2026-10",
          annual: true,
        },
      ]).target,
    ).toEqual({
      behavior: "upTo",
      cadence: { unit: "year", month: 10 },
      amountCents: 120_000,
    });
  });

  it("drops remainder so leftover Ready to Assign stays unassigned", () => {
    expect(
      targetFromTemplates([
        {
          id: "r1",
          directive: "template",
          type: "remainder",
          priority: null,
          weight: 1,
        },
      ]),
    ).toEqual({ target: null, discarded: 0, droppedRemainder: true });
  });

  it("keeps the lowest priority when more than one line is stored", () => {
    const result = targetFromTemplates([
      {
        id: "late",
        directive: "template",
        type: "simple",
        priority: 2,
        monthlyCents: 99_000,
      },
      {
        id: "first",
        directive: "template",
        type: "weekly",
        priority: 0,
        amountCents: 10_000,
        weekday: 5,
      },
      {
        id: "r1",
        directive: "template",
        type: "remainder",
        priority: null,
        weight: 1,
      },
    ]);
    expect(result).toEqual({
      target: {
        behavior: "upTo",
        cadence: { unit: "week", weekday: 5 },
        amountCents: 10_000,
      },
      discarded: 1,
      droppedRemainder: true,
    });
  });

  it("skips a zero-amount line rather than inventing an illegal target", () => {
    expect(
      targetFromTemplates([
        {
          id: "z",
          directive: "template",
          type: "simple",
          priority: 0,
          monthlyCents: 0,
        },
      ]).target,
    ).toBeNull();
  });
});
