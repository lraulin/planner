import { describe, expect, it } from "vitest";
import { formatFlowDiff, summarizeFlowChanges } from "./flowDiff";

describe("summarizeFlowChanges", () => {
  it("groups by transition and sums signed cents", () => {
    const diff = summarizeFlowChanges(
      [
        { id: "a", amountCents: 8412, derivedFlow: "refund" },
        { id: "b", amountCents: 1500, derivedFlow: "refund" },
        { id: "c", amountCents: -2000, derivedFlow: "spend" },
      ],
      [
        { id: "a", derivedFlow: "external_transfer" },
        { id: "b", derivedFlow: "external_transfer" },
        { id: "c", derivedFlow: "spend" },
      ],
    );

    expect(diff).toEqual({
      scanned: 3,
      changed: 2,
      transitions: [{ from: "refund", to: "external_transfer", rows: 2, cents: 9912 }],
    });
  });

  it("reports the amount the row carried, not the amount it moves to", () => {
    // The cents column answers "how much money changes meaning". Reading it off the plan
    // instead of the stored row would report nothing at all, since a plan carries no amount.
    const diff = summarizeFlowChanges(
      [{ id: "a", amountCents: -12345, derivedFlow: "external_transfer" }],
      [{ id: "a", derivedFlow: "spend" }],
    );

    expect(diff.transitions[0]?.cents).toBe(-12345);
  });

  it("ignores a planned row that has never been classified", () => {
    /*
     * A freshly imported row has `derived_flow = null` only after a pass; before its first
     * pass it is absent from the stored set entirely. Counting those as changes would let a
     * large import hide a real regression inside its own backlog.
     */
    const diff = summarizeFlowChanges(
      [{ id: "known", amountCents: -100, derivedFlow: "spend" }],
      [
        { id: "known", derivedFlow: "spend" },
        { id: "brand-new", derivedFlow: "spend" },
      ],
    );

    expect(diff).toEqual({ scanned: 1, changed: 0, transitions: [] });
  });

  it("counts a row whose stored flow is null as a change, since null is a stored meaning", () => {
    const diff = summarizeFlowChanges(
      [{ id: "a", amountCents: -500, derivedFlow: null }],
      [{ id: "a", derivedFlow: "spend" }],
    );

    expect(diff.transitions).toEqual([
      { from: null, to: "spend", rows: 1, cents: -500 },
    ]);
  });

  it("orders by absolute money so the movement needing an explanation is first", () => {
    // Sorting on the signed value would bury a large outflow beneath a trivial inflow.
    const diff = summarizeFlowChanges(
      [
        { id: "small", amountCents: 100, derivedFlow: "spend" },
        { id: "big", amountCents: -900_00, derivedFlow: "spend" },
      ],
      [
        { id: "small", derivedFlow: "refund" },
        { id: "big", derivedFlow: "external_transfer" },
      ],
    );

    expect(diff.transitions.map((entry) => entry.to)).toEqual([
      "external_transfer",
      "refund",
    ]);
  });

  it("is deterministic when two transitions carry the same money and row count", () => {
    const rows = [
      { id: "a", amountCents: 100, derivedFlow: "spend" as const },
      { id: "b", amountCents: 100, derivedFlow: "internal_transfer" as const },
    ];
    const plan = [
      { id: "a", derivedFlow: "refund" as const },
      { id: "b", derivedFlow: "refund" as const },
    ];

    const first = summarizeFlowChanges(rows, plan);
    const second = summarizeFlowChanges([...rows].reverse(), [...plan].reverse());

    expect(first.transitions).toEqual(second.transitions);
  });
});

describe("formatFlowDiff", () => {
  it("says so plainly when nothing moved", () => {
    expect(formatFlowDiff({ scanned: 7030, changed: 0, transitions: [] })).toBe(
      "0 of 7030 classified rows change flow.",
    );
  });

  it("renders cents as dollars and pluralises the row count", () => {
    const text = formatFlowDiff({
      scanned: 10,
      changed: 3,
      transitions: [
        { from: "refund", to: "external_transfer", rows: 2, cents: 31917 },
        { from: null, to: "spend", rows: 1, cents: -50 },
      ],
    });

    expect(text).toContain("refund to external_transfer: 2 rows, $319.17");
    expect(text).toContain("(none) to spend: 1 row, $-0.50");
  });
});
