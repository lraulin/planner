import { describe, expect, it } from "vitest";
import type { NodeState } from "@/db/schema";
import { priorityFieldsToClearOnSettle } from "./settle";

describe("priorityFieldsToClearOnSettle", () => {
  it("clears both fields for a one-shot completion", () => {
    expect(
      priorityFieldsToClearOnSettle({ requested: "completed", cycles: false }),
    ).toEqual({ outline: true, tc: true });
  });

  it("keeps outline Pri and clears TC Pri when a recurring completion cycles", () => {
    expect(
      priorityFieldsToClearOnSettle({ requested: "completed", cycles: true }),
    ).toEqual({ outline: false, tc: true });
  });

  it("clears both fields when a recurring series ends (completed, did not cycle)", () => {
    // Series-end is a real finish. The write asked for completed and did not reset in
    // place — same inputs as a one-shot, named here so the two events stay distinct in
    // the matrix even though the policy treats them alike.
    expect(
      priorityFieldsToClearOnSettle({ requested: "completed", cycles: false }),
    ).toEqual({ outline: true, tc: true });
  });

  it("clears both fields on cancel, even if a cycle flag is set", () => {
    // Cancel is a real stop ("I'm done with this habit"), not a cycle. The cycle flag
    // is only meaningful for a completion that reset in place.
    expect(
      priorityFieldsToClearOnSettle({ requested: "cancelled", cycles: false }),
    ).toEqual({ outline: true, tc: true });
    expect(
      priorityFieldsToClearOnSettle({ requested: "cancelled", cycles: true }),
    ).toEqual({ outline: true, tc: true });
  });

  it("touches nothing on reopen or any other state", () => {
    const others: NodeState[] = [
      "not_started",
      "in_progress",
      "waiting",
      "postponed",
      "delegated",
      "should_delegate",
      "proposed",
    ];
    for (const requested of others) {
      expect(
        priorityFieldsToClearOnSettle({ requested, cycles: false }),
        requested,
      ).toEqual({ outline: false, tc: false });
      expect(
        priorityFieldsToClearOnSettle({ requested, cycles: true }),
        `${requested} with cycles`,
      ).toEqual({ outline: false, tc: false });
    }
  });
});
