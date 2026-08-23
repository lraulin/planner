import { describe, expect, it } from "vitest";
import { droppedRulePosition, nudgeRulePosition } from "./order";

describe("rule ordering", () => {
  const ids = ["a", "b", "c", "d"];

  it("nudges a rule between its new neighbours", () => {
    expect(nudgeRulePosition(ids, "c", -1)).toEqual({ afterId: "a", beforeId: "b" });
    expect(nudgeRulePosition(ids, "b", 1)).toEqual({ afterId: "c", beforeId: "d" });
    expect(nudgeRulePosition(ids, "a", -1)).toBeNull();
  });

  it("resolves flat drops without allowing an inside drop", () => {
    expect(droppedRulePosition(ids, "d", "b", "before")).toEqual({
      afterId: "a",
      beforeId: "b",
    });
    expect(droppedRulePosition(ids, "a", "c", "after")).toEqual({
      afterId: "c",
      beforeId: "d",
    });
    expect(droppedRulePosition(ids, "a", "c", "inside")).toBeNull();
  });
});
