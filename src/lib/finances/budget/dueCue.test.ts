import { describe, expect, it } from "vitest";
import { billDueCue, billDueSoon } from "./dueCue";
import type { BillFacet } from "./queries";
import type { BudgetRow } from "./rows";
import type { IndicatorState } from "./indicator";

const TODAY = "2026-09-05";
const MONTH = "2026-09-01";
const PAYDAY = "2026-09-11";

function facet(overrides: Partial<BillFacet> = {}): BillFacet {
  return {
    status: "active",
    cancelledOn: null,
    url: "",
    cadenceMonths: 1,
    cadenceDays: null,
    dueDay: 1,
    leadDays: 0,
    anchorDate: null,
    scheduled: true,
    expectedCents: 1_000,
    ...overrides,
  };
}

type CueRow = Pick<BudgetRow, "bill" | "nextDueKey">;

function row(nextDueKey: string | null, bill: BillFacet | null = facet()): CueRow {
  return { bill, nextDueKey };
}

function cue(
  nextDueKey: string | null,
  state: IndicatorState = "underfunded",
  bill: BillFacet | null = facet(),
) {
  return billDueCue(row(nextDueKey, bill), MONTH, TODAY, PAYDAY, state);
}

describe("billDueCue", () => {
  it("warns about a charge landing before payday while the envelope is short", () => {
    expect(cue("2026-09-08", "underfunded")).toEqual({
      label: "Before payday",
      hint: "Charges before your next payday, and this envelope still needs money",
      urgent: true,
    });
  });

  it("still shows a funded charge, but as information rather than a warning", () => {
    // The point of the quiet cue: "leave this money alone", not "do something".
    const funded = cue("2026-09-08", "funded");
    expect(funded?.urgent).toBe(false);
    expect(funded?.hint).toContain("already funded");
  });

  it("treats overspent as urgent, the same as underfunded", () => {
    expect(cue("2026-09-08", "overspent")?.urgent).toBe(true);
  });

  it("labels a charge landing exactly on payday as on payday, not before it", () => {
    expect(cue(PAYDAY)?.label).toBe("On payday");
    expect(cue(PAYDAY)?.hint).toContain("on your next payday");
  });

  it("says nothing about a charge after payday — the money is on its way", () => {
    expect(cue("2026-09-12")).toBeNull();
  });

  it("says nothing about a charge already in the past", () => {
    expect(cue("2026-09-04")).toBeNull();
  });

  it("still speaks on the due date itself", () => {
    expect(cue(TODAY)?.label).toBe("Before payday");
  });

  it("says nothing for a month that is not the one today falls in", () => {
    expect(
      billDueCue(row("2026-09-08"), "2026-10-01", TODAY, PAYDAY, "underfunded"),
    ).toBeNull();
  });

  it("says nothing when no payday is known — there is no side to be on", () => {
    expect(billDueCue(row("2026-09-08"), MONTH, TODAY, null, "underfunded")).toBeNull();
  });

  it("says nothing for a cancelled or unscheduled bill, or a row that is not a bill", () => {
    expect(cue("2026-09-08", "underfunded", facet({ status: "cancelled" }))).toBeNull();
    expect(cue("2026-09-08", "underfunded", facet({ scheduled: false }))).toBeNull();
    expect(cue("2026-09-08", "underfunded", null)).toBeNull();
  });
});

describe("billDueSoon", () => {
  it("covers today through the far end of the horizon inclusively", () => {
    expect(billDueSoon(row(TODAY), TODAY)).toBe(true);
    expect(billDueSoon(row("2026-09-19"), TODAY)).toBe(true);
    expect(billDueSoon(row("2026-09-20"), TODAY)).toBe(false);
  });

  it("excludes a charge already past, and honours a caller's horizon", () => {
    expect(billDueSoon(row("2026-09-04"), TODAY)).toBe(false);
    expect(billDueSoon(row("2026-09-08"), TODAY, 2)).toBe(false);
    expect(billDueSoon(row("2026-09-07"), TODAY, 2)).toBe(true);
  });

  it("is false for a bill that is cancelled, unscheduled, or has no predicted charge", () => {
    expect(billDueSoon(row(TODAY, facet({ status: "cancelled" })), TODAY)).toBe(false);
    expect(billDueSoon(row(TODAY, facet({ scheduled: false })), TODAY)).toBe(false);
    expect(billDueSoon(row(null), TODAY)).toBe(false);
    expect(billDueSoon(row(TODAY, null), TODAY)).toBe(false);
  });
});
