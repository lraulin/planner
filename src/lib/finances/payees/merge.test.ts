import { describe, expect, it } from "vitest";
import { mergeClaimDecision, type MergeClaim } from "./merge";

const CLAIM = { id: "bill-a", name: "Internet" };

describe("mergeClaimDecision", () => {
  it("treats the same claim on several payees as one surviving claim", () => {
    expect(mergeClaimDecision([{ claim: CLAIM }, { claim: { ...CLAIM } }])).toEqual({
      claim: CLAIM,
      refusal: null,
    });
  });

  it("refuses distinct claims instead of choosing one", () => {
    const decision = mergeClaimDecision<MergeClaim & { name: string }>([
      { claim: CLAIM },
      { claim: { id: "spend-a", name: "Shopping" } },
    ]);

    expect(decision.claim).toBeNull();
    expect(decision.refusal).toMatch(/different envelopes/i);
  });
});
