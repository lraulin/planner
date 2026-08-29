import { describe, expect, it } from "vitest";

import { snoozeUnavailableReason } from "./snooze";
import type { Target } from "./targets/types";

const MONTH = "2026-08-01";
const target: Target = {
  behavior: "add",
  cadence: { unit: "month", day: 31 },
  amountCents: 10_000,
};

describe("snoozeUnavailableReason", () => {
  it("allows a spending envelope with a target in the current month", () => {
    expect(
      snoozeUnavailableReason({ kind: "spending", target }, MONTH, MONTH),
    ).toBeNull();
  });

  it("allows a savings envelope with a pile-family goal", () => {
    const goal: Target = {
      behavior: "balance",
      cadence: { unit: "none" },
      amountCents: 60_000,
    };
    expect(
      snoozeUnavailableReason({ kind: "savings", target: goal }, MONTH, MONTH),
    ).toBeNull();
  });

  it("refuses a month that is not the current one, naming it", () => {
    expect(
      snoozeUnavailableReason({ kind: "spending", target }, "2026-09-01", MONTH),
    ).toContain("September 2026");
    expect(
      snoozeUnavailableReason({ kind: "spending", target }, "2026-07-01", MONTH),
    ).toContain("July 2026");
  });

  it("refuses a bill", () => {
    expect(snoozeUnavailableReason({ kind: "bill", target }, MONTH, MONTH)).toContain(
      "Bills cannot be snoozed",
    );
  });

  it("refuses an envelope with no target", () => {
    expect(
      snoozeUnavailableReason({ kind: "spending", target: null }, MONTH, MONTH),
    ).toContain("no target");
  });

  it("refuses income", () => {
    expect(
      snoozeUnavailableReason({ kind: "income", target: null }, MONTH, MONTH),
    ).not.toBeNull();
  });

  // The wrong month is checked first so a past bill reads as "wrong month", which is the more
  // actionable of the two reasons: paging to today is what makes any snooze possible at all.
  it("names the month before the kind when both disqualify", () => {
    expect(
      snoozeUnavailableReason({ kind: "bill", target }, "2026-07-01", MONTH),
    ).toContain("July 2026");
  });
});
