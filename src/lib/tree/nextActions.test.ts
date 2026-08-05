import { describe, expect, it } from "vitest";
import type { NodeState } from "@/db/schema";
import type { OutlineNode } from "./types";
import { nextActionsOnly } from "./nextActions";

type Row = [id: string, parentId: string | null, state?: NodeState];

function rows(...spec: Row[]): OutlineNode[] {
  return spec.map(([id, parentId, state = "not_started"]) => ({
    id,
    parentId,
    state,
    name: id,
  })) as unknown as OutlineNode[];
}

function kept(nodes: OutlineNode[]): string[] {
  return nextActionsOnly(nodes).map((node) => node.id);
}

/** The manual's §2.6 worked example. */
const PLAN_PARTY = rows(
  ["plan-party", null],
  ["reservations", "plan-party"],
  ["find-location", "reservations"],
  ["call-reservations", "reservations"],
  ["cake", "plan-party"],
  ["select-catalog", "cake"],
  ["call-cake", "cake"],
  ["invitations", "plan-party"],
  ["make-list", "invitations"],
  ["print", "invitations"],
);

describe("nextActionsOnly", () => {
  it("keeps every summary and one open leaf under each", () => {
    expect(kept(PLAN_PARTY)).toEqual([
      "plan-party",
      "reservations",
      "find-location",
      "cake",
      "select-catalog",
      "invitations",
      "make-list",
    ]);
  });

  it("moves to the next step once the first is done", () => {
    const done = rows(
      ["plan-party", null],
      ["reservations", "plan-party"],
      ["find-location", "reservations", "completed"],
      ["call-reservations", "reservations"],
    );
    expect(kept(done)).toEqual(["plan-party", "reservations", "call-reservations"]);
  });

  it("treats cancelled as done too, so a skipped step does not block the list", () => {
    const skipped = rows(
      ["project", null],
      ["step-1", "project", "cancelled"],
      ["step-2", "project"],
    );
    expect(kept(skipped)).toEqual(["project", "step-2"]);
  });

  it("shows nothing under a summary whose work is all finished", () => {
    const finished = rows(
      ["project", null],
      ["step-1", "project", "completed"],
      ["step-2", "project", "completed"],
    );
    // The summary stays — Achieve hides those behind a separate option.
    expect(kept(finished)).toEqual(["project"]);
  });

  it("gives each branch its own next action", () => {
    // The whole point: one per project, not one overall.
    const two = rows(
      ["project-a", null],
      ["a1", "project-a"],
      ["a2", "project-a"],
      ["project-b", null],
      ["b1", "project-b"],
      ["b2", "project-b"],
    );
    expect(kept(two)).toEqual(["project-a", "a1", "project-b", "b1"]);
  });

  it("treats top-level leaves as siblings of each other, keeping the first", () => {
    const loose = rows(["one", null], ["two", null], ["three", null]);
    expect(kept(loose)).toEqual(["one"]);
  });

  it("does not let a summary's own siblings steal its slot", () => {
    // `sub` has children so it is a summary; `task` is the parent's one leaf. Both survive.
    const mixed = rows(
      ["project", null],
      ["sub", "project"],
      ["sub-task", "sub"],
      ["task", "project"],
      ["task-2", "project"],
    );
    expect(kept(mixed)).toEqual(["project", "sub", "sub-task", "task"]);
  });

  it("judges leaf-ness inside the list, not from the wider tree", () => {
    // `parent`'s children are not in this slice, so it is a leaf here and competes as one.
    const sliced = rows(["parent", null], ["other", null]);
    expect(kept(sliced)).toEqual(["parent"]);
  });

  it("groups by real parent, not by position, so a flattened list still works", () => {
    // Tasks re-bases depth, so rows from different projects interleave at the same level.
    const interleaved = rows(
      ["a1", "project-a"],
      ["b1", "project-b"],
      ["a2", "project-a"],
      ["b2", "project-b"],
    );
    expect(kept(interleaved)).toEqual(["a1", "b1"]);
  });

  it("returns an empty list for an empty one", () => {
    expect(kept([])).toEqual([]);
  });
});
