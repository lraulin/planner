import { describe, expect, it } from "vitest";
import { comparePriorityOrder, priorityOrderValue } from "./order";

function sortLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => comparePriorityOrder(parseLabel(a), parseLabel(b)));
}

function parseLabel(label: string) {
  if (label === "") return { letter: null, rank: null };
  const letter = label[0] as "A" | "B" | "C" | "D";
  const rest = label.slice(1);
  return { letter, rank: rest === "" ? null : Number(rest) };
}

describe("priorityOrderValue", () => {
  it("puts a ranked item above the bare letter it belongs to", () => {
    const b1 = priorityOrderValue("B", 1)!;
    const bare = priorityOrderValue("B", null)!;
    expect(b1).toBeLessThan(bare);
  });

  it("keeps the bare letter inside its own band", () => {
    const bareB = priorityOrderValue("B", null)!;
    expect(bareB).toBeLessThan(priorityOrderValue("C", 1)!);
    expect(bareB).toBeGreaterThan(priorityOrderValue("A", null)!);
  });

  it("orders ranks numerically, not as text", () => {
    expect(priorityOrderValue("A", 2)!).toBeLessThan(priorityOrderValue("A", 10)!);
  });

  it("clamps an absurd rank rather than leaking into the next letter", () => {
    expect(priorityOrderValue("A", 99999)!).toBeLessThan(priorityOrderValue("B", 1)!);
  });

  it("has no value for a missing letter", () => {
    expect(priorityOrderValue(null, 3)).toBeNull();
  });
});

describe("comparePriorityOrder", () => {
  it("sorts a mixed column the way the grid should read", () => {
    expect(sortLabels(["C", "B", "B1", "A2", "", "A", "A1", "D3"])).toEqual([
      "A1",
      "A2",
      "A",
      "B1",
      "B",
      "C",
      "D3",
      "",
    ]);
  });

  it("sorts blanks last", () => {
    expect(comparePriorityOrder({ letter: null, rank: null }, parseLabel("D9"))).toBe(
      1,
    );
  });
});
