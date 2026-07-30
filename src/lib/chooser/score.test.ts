import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  deadlineScore,
  priorityScore,
  scoreItem,
  targetDateScore,
  UNRANKED_RANK,
  type ChooserWeights,
  type ScoreFacts,
} from "./score";
import { effectiveDeadline } from "./dates";
import { derive } from "@/lib/tree/derive";
import { row } from "@/lib/tree/fixtures";
import type { OutlineNode } from "@/lib/tree/types";

const TODAY = "2026-07-28";
const W = DEFAULT_WEIGHTS;

/** A date `days` out from TODAY, as the database would hand it back. */
function dayOut(days: number): Date {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 24 * 60 * 60 * 1000);
}

function facts(partial: Partial<ScoreFacts> = {}): ScoreFacts {
  return {
    lapLetter: null,
    lapRank: null,
    focus: false,
    effectiveDeadline: null,
    targetStart: null,
    targetEnd: null,
    areaImportance: 0,
    ...partial,
  };
}

function byIdOf(nodes: OutlineNode[]): Map<string, OutlineNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

describe("priorityScore", () => {
  it("orders letters, then ranks within a letter", () => {
    expect(priorityScore("A", 1, W)).toBeGreaterThan(priorityScore("A", 2, W));
    expect(priorityScore("A", 2, W)).toBeGreaterThan(priorityScore("B", 1, W));
    expect(priorityScore("B", 1, W)).toBeGreaterThan(priorityScore("C", 1, W));
    expect(priorityScore("C", 1, W)).toBeGreaterThan(priorityScore("D", 1, W));
  });

  it("keeps ranks inside their letter's band", () => {
    // The whole point of ranks-refine-letters: even the worst A beats the best B.
    expect(priorityScore("A", 9, W)).toBeGreaterThan(priorityScore("B", 1, W));
    expect(priorityScore("C", 9, W)).toBeGreaterThan(priorityScore("D", 1, W));
  });

  it("scores an unranked letter as mid-pack, not as rank 1", () => {
    // "A1" is a deliberate refinement; a bare "A" must not silently outrank it.
    expect(priorityScore("A", null, W)).toBeLessThan(priorityScore("A", 1, W));
    expect(priorityScore("A", null, W)).toBe(priorityScore("A", UNRANKED_RANK, W));
  });

  it("puts an item with no priority at all below every D", () => {
    expect(priorityScore(null, null, W)).toBeLessThan(priorityScore("D", 9, W));
  });

  it("does not let an absurd rank leak below the next letter", () => {
    // Ranks are clamped, so a stray 50 cannot drag an A beneath a B.
    expect(priorityScore("A", 50, W)).toBe(priorityScore("A", 9, W));
    expect(priorityScore("A", 50, W)).toBeGreaterThan(priorityScore("B", 1, W));
  });
});

describe("deadlineScore", () => {
  it("bands a deadline by how far out it is", () => {
    expect(deadlineScore(dayOut(-5), TODAY, W)).toBe(W.deadlineOverdue);
    expect(deadlineScore(dayOut(0), TODAY, W)).toBe(W.deadlineToday);
    expect(deadlineScore(dayOut(1), TODAY, W)).toBe(W.deadlineTomorrow);
    expect(deadlineScore(dayOut(W.deadlineSoonDays), TODAY, W)).toBe(W.deadlineSoon);
    expect(deadlineScore(dayOut(W.deadlineSoonDays + 1), TODAY, W)).toBe(0);
    expect(deadlineScore(null, TODAY, W)).toBe(0);
  });

  it("treats a deadline as a calendar day, not an instant", () => {
    // Late in the day on the deadline is still due today, not overdue.
    expect(deadlineScore(new Date(`${TODAY}T23:30:00Z`), TODAY, W)).toBe(
      W.deadlineToday,
    );
  });
});

describe("targetDateScore", () => {
  it("adds both halves when a started item has also slipped", () => {
    const both = targetDateScore(dayOut(-3), dayOut(-1), TODAY, W);
    expect(both).toBe(W.targetStartReached + W.targetEndPast);
  });

  it("counts a start date reached today", () => {
    expect(targetDateScore(dayOut(0), null, TODAY, W)).toBe(W.targetStartReached);
    expect(targetDateScore(dayOut(1), null, TODAY, W)).toBe(0);
  });

  it("does not count a target end that is still ahead", () => {
    expect(targetDateScore(null, dayOut(0), TODAY, W)).toBe(0);
    expect(targetDateScore(null, dayOut(-1), TODAY, W)).toBe(W.targetEndPast);
  });
});

describe("scoreItem", () => {
  it("lets an overdue lower priority beat an on-schedule higher one", () => {
    // The reason the chooser exists: urgency has to be able to outrank the letter.
    const overdueB = scoreItem(
      facts({ lapLetter: "B", lapRank: 1, effectiveDeadline: dayOut(-1) }),
      TODAY,
      W,
    );
    const calmA = scoreItem(facts({ lapLetter: "A", lapRank: 1 }), TODAY, W);
    expect(overdueB).toBeGreaterThan(calmA);
  });

  it("treats Focus as a tiebreak, not an override", () => {
    const focusedC = scoreItem(
      facts({ lapLetter: "C", lapRank: 1, focus: true }),
      TODAY,
      W,
    );
    const plainC = scoreItem(facts({ lapLetter: "C", lapRank: 1 }), TODAY, W);
    const plainA = scoreItem(facts({ lapLetter: "A", lapRank: 1 }), TODAY, W);

    expect(focusedC).toBeGreaterThan(plainC);
    // A focused C must not leapfrog a plain A — Focus nudges, it does not repriorititse.
    expect(focusedC).toBeLessThan(plainA);
  });

  it("weights result-area importance", () => {
    const important = scoreItem(
      facts({ lapLetter: "B", areaImportance: 100 }),
      TODAY,
      W,
    );
    const ignored = scoreItem(facts({ lapLetter: "B", areaImportance: 0 }), TODAY, W);
    expect(important - ignored).toBe(Math.round(100 * W.importanceWeight));
  });

  it("responds to reweighting, so the Settings dialog can actually change the order", () => {
    const urgent: ChooserWeights = { ...W, deadlineSoon: 500 };
    const dueSoonD = facts({
      lapLetter: "D",
      lapRank: 1,
      effectiveDeadline: dayOut(3),
    });
    const calmA = facts({ lapLetter: "A", lapRank: 1 });

    expect(scoreItem(dueSoonD, TODAY, W)).toBeLessThan(scoreItem(calmA, TODAY, W));
    expect(scoreItem(dueSoonD, TODAY, urgent)).toBeGreaterThan(
      scoreItem(calmA, TODAY, urgent),
    );
  });
});

describe("scoring against a real derived tree", () => {
  it("ranks a task under an A1 project above one under a C project", () => {
    // Neither task carries a priority of its own; both inherit. This is the manual's
    // "sub-item priority ranks are relative to the parent".
    const nodes = derive([
      row({
        id: "p1",
        type: "project",
        priorityLetter: "A",
        priorityRank: 1,
        sortKey: "a",
      }),
      row({ id: "t1", type: "task", parentId: "p1", sortKey: "a" }),
      row({
        id: "p2",
        type: "project",
        priorityLetter: "C",
        priorityRank: 1,
        sortKey: "b",
      }),
      row({ id: "t2", type: "task", parentId: "p2", sortKey: "a" }),
    ]);
    const byId = byIdOf(nodes);

    function scoreOf(id: string): number {
      const node = byId.get(id)!;
      return scoreItem(
        facts({
          lapLetter: node.lapLetter,
          lapRank: node.lapRank,
          effectiveDeadline: effectiveDeadline(node, byId),
        }),
        TODAY,
        W,
      );
    }

    expect(scoreOf("t1")).toBeGreaterThan(scoreOf("t2"));
  });
});

describe("effectiveDeadline", () => {
  it("inherits an ancestor's deadline when the item has none", () => {
    const nodes = derive([
      row({ id: "p", type: "project", deadline: dayOut(3), sortKey: "a" }),
      row({ id: "t", type: "task", parentId: "p", sortKey: "a" }),
    ]);
    const byId = byIdOf(nodes);
    expect(effectiveDeadline(byId.get("t")!, byId)).toEqual(dayOut(3));
  });

  it("takes the earliest deadline in the chain, not the nearest ancestor's", () => {
    // A goal due Friday does not relax a project due Wednesday.
    const nodes = derive([
      row({ id: "g", type: "goal", deadline: dayOut(2), sortKey: "a" }),
      row({
        id: "p",
        type: "project",
        parentId: "g",
        deadline: dayOut(10),
        sortKey: "a",
      }),
      row({ id: "t", type: "task", parentId: "p", sortKey: "a" }),
    ]);
    const byId = byIdOf(nodes);
    expect(effectiveDeadline(byId.get("t")!, byId)).toEqual(dayOut(2));
  });

  it("prefers the item's own deadline when it is the tightest", () => {
    const nodes = derive([
      row({ id: "p", type: "project", deadline: dayOut(10), sortKey: "a" }),
      row({ id: "t", type: "task", parentId: "p", deadline: dayOut(1), sortKey: "a" }),
    ]);
    const byId = byIdOf(nodes);
    expect(effectiveDeadline(byId.get("t")!, byId)).toEqual(dayOut(1));
  });

  it("is null when nothing in the chain has a deadline", () => {
    const nodes = derive([
      row({ id: "p", type: "project", sortKey: "a" }),
      row({ id: "t", type: "task", parentId: "p", sortKey: "a" }),
    ]);
    const byId = byIdOf(nodes);
    expect(effectiveDeadline(byId.get("t")!, byId)).toBeNull();
  });
});
