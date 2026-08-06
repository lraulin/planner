import { describe, expect, it } from "vitest";
import type { NodeType } from "@/db/schema";
import { pasteMoves, pasteRefusal, type ClipboardNode } from "./rowClipboard";

const node = (id: string, parentId: string | null, type: NodeType): ClipboardNode => ({
  id,
  parentId,
  type,
});

const tree: ClipboardNode[] = [
  node("area", null, "result_area"),
  node("goal", "area", "goal"),
  node("website", "goal", "project"),
  node("phase-2", "website", "project"),
  node("task-a", "phase-2", "task"),
  node("task-b", "phase-2", "task"),
  node("other", "goal", "project"),
  // A second root, so a nesting violation can be tested without also being a cycle.
  node("area-2", null, "result_area"),
];

const clip = (...ids: string[]) => ({ ids, count: ids.length });

describe("pasteRefusal", () => {
  it("allows a plain move between projects", () => {
    expect(
      pasteRefusal(tree, clip("task-a"), { at: "child", targetId: "other" }),
    ).toBeNull();
  });

  it("explains an empty clipboard rather than greying silently", () => {
    expect(pasteRefusal(tree, null, { at: "child", targetId: "other" })).toBe(
      "Nothing has been picked up",
    );
    expect(pasteRefusal(tree, clip(), { at: "child", targetId: "other" })).toBe(
      "Nothing has been picked up",
    );
  });

  it("puts the cycle before the nesting rule when a paste is both", () => {
    // `task-a` is inside `area`, so pasting `area` under it is a cycle *and* an illegal
    // nesting. "Inside itself" is the more specific and more useful sentence.
    expect(pasteRefusal(tree, clip("area"), { at: "child", targetId: "task-a" })).toBe(
      "Cannot paste a row inside itself",
    );
  });

  it("refuses a branch pasted inside itself", () => {
    // The check `moveNode` performs server-side, done here so the menu says so before the
    // click rather than throwing after it.
    expect(
      pasteRefusal(tree, clip("website"), { at: "child", targetId: "task-a" }),
    ).toBe("Cannot paste a row inside itself");
    expect(
      pasteRefusal(tree, clip("website"), { at: "child", targetId: "website" }),
    ).toBe("Cannot paste a row inside itself");
  });

  it("allows the sibling paste that the child paste refuses", () => {
    // Pasting `phase-2` *after* `task-a` lands it under `phase-2`'s own parent, which is not
    // inside itself. The `at` genuinely changes the answer, so both are checked.
    expect(
      pasteRefusal(tree, clip("phase-2"), { at: "after", targetId: "other" }),
    ).toBeNull();
  });

  it("refuses a nesting the hierarchy forbids", () => {
    expect(
      pasteRefusal(tree, clip("area-2"), { at: "child", targetId: "task-a" }),
    ).toBe("Those rows cannot go under this one");
  });

  it("lets anything land at the top level", () => {
    // Deliberate: `canNest` puts no floor on the root, because requiring a home for every row
    // is the busywork this app exists to avoid (`hierarchy.ts`).
    expect(
      pasteRefusal(tree, clip("task-a"), { at: "after", targetId: "area" }),
    ).toBeNull();
  });

  it("refuses the whole paste when any picked-up row has since gone", () => {
    // Moving three of four and leaving the fourth behind is worse than moving none: the
    // selection you picked up no longer exists anywhere as a unit.
    expect(
      pasteRefusal(tree, clip("task-a", "ghost"), { at: "child", targetId: "other" }),
    ).toBe("Some of the picked-up rows are no longer here");
  });

  it("asks for a target when there is no row to paste beside", () => {
    expect(pasteRefusal(tree, clip("task-a"), null)).toBe(
      "Select a row to paste beside",
    );
  });
});

describe("pasteMoves", () => {
  it("chains each row after the last, so a block keeps its order", () => {
    // Anchoring every row to the same sibling reverses the block, which reads as a shuffle.
    expect(
      pasteMoves(tree, clip("task-a", "task-b"), { at: "after", targetId: "other" }),
    ).toEqual([
      { nodeId: "task-a", parentId: "goal", afterSiblingId: "other" },
      { nodeId: "task-b", parentId: "goal", afterSiblingId: "task-a" },
    ]);
  });

  it("resolves a sibling paste to the target's parent, not to the target", () => {
    const [move] = pasteMoves(tree, clip("other"), {
      at: "after",
      targetId: "task-a",
    })!;
    expect(move.parentId).toBe("phase-2");
  });

  it("starts a child paste at the front of its new siblings", () => {
    expect(
      pasteMoves(tree, clip("task-a"), { at: "child", targetId: "other" }),
    ).toEqual([{ nodeId: "task-a", parentId: "other", afterSiblingId: null }]);
  });

  it("returns null for anything the refusal would refuse", () => {
    // One gate, not two: a paste that plans successfully is exactly one the menu offered.
    expect(
      pasteMoves(tree, clip("website"), { at: "child", targetId: "task-a" }),
    ).toBeNull();
    expect(pasteMoves(tree, null, { at: "child", targetId: "other" })).toBeNull();
    expect(pasteMoves(tree, clip("task-a"), null)).toBeNull();
  });
});
