import { describe, expect, it } from "vitest";
import { parseDepthForest, type ForestNode } from "./forest";

type Named = { depth: number; name: string };
type NamedTree = { name: string; children: NamedTree[] };

function names(nodes: ForestNode<Named>[]): NamedTree[] {
  return nodes.map((node) => ({
    name: node.row.name,
    children: names(node.children),
  }));
}

describe("parseDepthForest", () => {
  it("nests a deeper row under the open parent", () => {
    expect(
      names(
        parseDepthForest([
          { name: "Goal", depth: 0 },
          { name: "Task", depth: 1 },
          { name: "Peer", depth: 0 },
        ]),
      ),
    ).toEqual([
      { name: "Goal", children: [{ name: "Task", children: [] }] },
      { name: "Peer", children: [] },
    ]);
  });

  it("treats the shallowest row in the run as a root", () => {
    // After grouping headers are stripped, a Projects slice may start at depth 1.
    expect(
      names(
        parseDepthForest([
          { name: "Project", depth: 1 },
          { name: "Sub", depth: 2 },
        ]),
      ),
    ).toEqual([{ name: "Project", children: [{ name: "Sub", children: [] }] }]);
  });

  it("keeps an orphan jump under the nearest open ancestor", () => {
    // A filter dropped the project between the goal and the task.
    expect(
      names(
        parseDepthForest([
          { name: "Goal", depth: 0 },
          { name: "Task", depth: 2 },
        ]),
      ),
    ).toEqual([{ name: "Goal", children: [{ name: "Task", children: [] }] }]);
  });

  it("returns an empty forest for no rows", () => {
    expect(parseDepthForest([])).toEqual([]);
  });
});
