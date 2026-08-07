import { describe, expect, it } from "vitest";
import {
  allowedChildKinds,
  assertCanNest,
  canNest,
  defaultChildType,
  KIND_HINTS,
  KIND_LABELS,
  kindOfNode,
  nodeFromKind,
  NODE_KINDS,
  STATE_CODES,
  STATE_LABELS,
  STATE_ORDER,
  stateRank,
} from "./hierarchy";
import { nodeStateEnum } from "@/db/schema";

const ALL_TYPES = ["result_area", "goal", "project", "task"] as const;

describe("hierarchy", () => {
  // Capturing an idea must never require deciding where it lives first, so nothing is
  // homeless-illegal. A task at the top level is a legitimate resting state, not a
  // half-filed mistake.
  it("hosts every type at the top level", () => {
    for (const type of ALL_TYPES) {
      expect(canNest(type, null)).toBe(true);
    }
  });

  it("lets every type nest inside itself", () => {
    expect(canNest("result_area", "result_area")).toBe(true);
    expect(canNest("goal", "goal")).toBe(true);
    expect(canNest("project", "project")).toBe(true);
    expect(canNest("task", "task")).toBe(true);
  });

  it("lets a type sit under any broader type", () => {
    expect(canNest("goal", "result_area")).toBe(true);
    expect(canNest("project", "result_area")).toBe(true);
    expect(canNest("project", "goal")).toBe(true);
    expect(canNest("task", "result_area")).toBe(true);
    expect(canNest("task", "goal")).toBe(true);
    expect(canNest("task", "project")).toBe(true);
  });

  // The one rule: you cannot go backwards. Flipping the rank comparison would pass every
  // test above, so these are the ones that pin it.
  it("refuses to go backwards", () => {
    expect(canNest("result_area", "goal")).toBe(false);
    expect(canNest("result_area", "project")).toBe(false);
    expect(canNest("result_area", "task")).toBe(false);
    expect(canNest("goal", "project")).toBe(false);
    expect(canNest("goal", "task")).toBe(false);
    expect(canNest("project", "task")).toBe(false);
  });

  it("names both types when rejecting a nesting", () => {
    expect(() => assertCanNest("goal", "task")).toThrow(
      "A Goal cannot go under a Task.",
    );
    expect(() => assertCanNest("result_area", "project")).toThrow(
      "A Result Area cannot go under a Project.",
    );
  });

  it("picks a sensible type for a new child", () => {
    expect(defaultChildType(null)).toBe("result_area");
    expect(defaultChildType("result_area")).toBe("project");
    expect(defaultChildType("goal")).toBe("project");
    expect(defaultChildType("project")).toBe("task");
    expect(defaultChildType("task")).toBe("task");
  });

  it("only suggests child types that are actually legal", () => {
    for (const parent of [null, ...ALL_TYPES] as const) {
      expect(canNest(defaultChildType(parent), parent)).toBe(true);
    }
  });
});

describe("kinds", () => {
  // The whole point of the kind layer: Dream is the one thing the UI offers that the
  // database does not have. Reading it back as a plain goal would lose the star.
  it("stores a dream as a goal with the flag, and reads it back as a dream", () => {
    expect(nodeFromKind("dream")).toEqual({ type: "goal", isDream: true });
    expect(kindOfNode({ type: "goal", isDream: true })).toBe("dream");
    expect(kindOfNode({ type: "goal", isDream: false })).toBe("goal");
  });

  it("round-trips every kind through the row it creates", () => {
    for (const kind of NODE_KINDS) {
      expect(kindOfNode(nodeFromKind(kind))).toBe(kind);
    }
  });

  // A stray flag on a project must not turn its icon into a star.
  it("only lets a goal be a dream", () => {
    expect(kindOfNode({ type: "project", isDream: true })).toBe("project");
    expect(kindOfNode({ type: "task", isDream: true })).toBe("task");
  });

  it("names and describes every kind", () => {
    for (const kind of NODE_KINDS) {
      expect(KIND_LABELS[kind]).toBeTruthy();
      expect(KIND_HINTS[kind]).toBeTruthy();
    }
  });
});

describe("allowedChildKinds", () => {
  it("offers nothing the hierarchy would reject", () => {
    for (const parent of [null, ...ALL_TYPES] as const) {
      for (const kind of allowedChildKinds(parent)) {
        expect(canNest(nodeFromKind(kind).type, parent)).toBe(true);
      }
    }
  });

  it("always includes the default, so the picker has something to preselect", () => {
    for (const parent of [null, ...ALL_TYPES] as const) {
      expect(allowedChildKinds(parent)).toContain(defaultChildType(parent));
    }
  });

  it("offers a dream wherever it offers a goal", () => {
    for (const parent of [null, ...ALL_TYPES] as const) {
      const kinds = allowedChildKinds(parent);
      expect(kinds.includes("dream")).toBe(kinds.includes("goal"));
    }
  });

  // The outline skips the dialog on a single answer, so this is what keeps a task's child
  // a one-keystroke action rather than a modal with one button.
  it("leaves exactly one answer under a task", () => {
    expect(allowedChildKinds("task")).toEqual(["task"]);
  });

  it("narrows as the parent gets deeper", () => {
    expect(allowedChildKinds(null)).toEqual([
      "result_area",
      "goal",
      "dream",
      "project",
      "task",
    ]);
    // A result area may nest under another result area (same rank), so it stays in the
    // picker — dropping it would force a detour through the top level to add a peer area.
    expect(allowedChildKinds("result_area")).toEqual([
      "result_area",
      "goal",
      "dream",
      "project",
      "task",
    ]);
    expect(allowedChildKinds("goal")).toEqual(["goal", "dream", "project", "task"]);
    expect(allowedChildKinds("project")).toEqual(["project", "task"]);
  });
});

describe("state vocabulary", () => {
  // Widening nodeStateEnum must not leave the grid printing an empty cell.
  it("labels and codes every state", () => {
    for (const state of nodeStateEnum.enumValues) {
      expect(STATE_LABELS[state]).toBeTruthy();
      expect(STATE_CODES[state]).toBeTruthy();
    }
  });

  it("keeps the codes distinct", () => {
    const codes = Object.values(STATE_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Alphabetical on the enum key would put Cancelled before Completed before In progress.
  // The dropdown, the State column sort, and group-by-State all share this rank so a sorted
  // column reads as a workflow rather than a glossary.
  it("ranks states in Achieve workflow order, not alphabetically", () => {
    expect(STATE_ORDER[0]).toBe("not_started");
    expect(STATE_ORDER).toContain("cancelled");
    expect(stateRank("not_started")).toBeLessThan(stateRank("in_progress"));
    expect(stateRank("in_progress")).toBeLessThan(stateRank("waiting"));
    expect(stateRank("waiting")).toBeLessThan(stateRank("completed"));
    expect(stateRank("completed")).toBeLessThan(stateRank("cancelled"));
    // Cancelled sorts after Completed alphabetically too — the trap is In progress vs
    // Completed: "completed" < "in_progress" as strings, but workflow puts In progress first.
    expect(stateRank("in_progress")).toBeLessThan(stateRank("completed"));
    expect(stateRank("not_a_state")).toBe(STATE_ORDER.length);
  });
});
