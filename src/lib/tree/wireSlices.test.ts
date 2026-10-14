import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { row } from "./fixtures";
import { unpackOutline } from "./wire";
import {
  metricGoalsWire,
  noteLinkTargetsWire,
  scheduleNodesWire,
  timeChartResultAreasWire,
  wishOwnersWire,
} from "./wireSlices";

/** Two result areas (one collapsed, so its subtree is hidden), goals, projects, tasks. */
const NODES = derive([
  row({ id: "ra1", type: "result_area", name: "Health", category: "Personal" }),
  row({ id: "g1", type: "goal", parentId: "ra1", depth: 1, name: "Run" }),
  row({ id: "p1", type: "project", parentId: "ra1", depth: 1, name: "Plan" }),
  row({
    id: "t1",
    type: "task",
    parentId: "p1",
    depth: 2,
    name: "Shoes",
    effortMinutes: 30,
  }),
  row({ id: "ra2", type: "result_area", name: "Work", collapsed: true }),
  row({ id: "p2", type: "project", parentId: "ra2", depth: 1, name: "Ship" }),
  row({ id: "t2", type: "task", parentId: "p2", depth: 2, name: "Release" }),
]);

describe("outline slices", () => {
  it("sends the owner select exactly the goals, in outline order", () => {
    const back = unpackOutline(metricGoalsWire(NODES));
    expect(back).toEqual([{ id: "g1", name: "Run", type: "goal" }]);
  });

  it("sends the time chart editor the result areas the select offers, hidden ones excluded", () => {
    // `hidden` is derived: a collapsed ancestor hides the row. Result areas are roots, so
    // none is hidden here — the case is the filter surviving, not a row being dropped.
    const back = unpackOutline(timeChartResultAreasWire(NODES));
    expect(back.map((n) => n.id)).toEqual(["ra1", "ra2"]);
    expect(back.every((n) => n.type === "result_area" && n.hidden === false)).toBe(
      true,
    );
  });

  it("sends the note link picker every row, hidden ones included, in outline order", () => {
    const back = unpackOutline(noteLinkTargetsWire(NODES));
    expect(back.map((n) => n.id)).toEqual(NODES.map((n) => n.id));
    expect(NODES.some((n) => n.hidden)).toBe(true);
    expect(back.map((n) => n.name)).toEqual(NODES.map((n) => n.name));
  });

  it("sends the wish list every result area and each owning node, and nothing else", () => {
    const back = unpackOutline(wishOwnersWire(NODES, ["t1", "t1", "g1"]));
    expect(back.map((n) => n.id)).toEqual(["ra1", "g1", "t1", "ra2"]);
    // What the detail drawer and `categoryOptions` read must come across intact.
    expect(back.find((n) => n.id === "ra1")?.category).toBe("Personal");
    expect(back.find((n) => n.id === "t1")?.name).toBe("Shoes");
  });

  it("keeps the wish list's result areas when no wish has an owner", () => {
    const back = unpackOutline(wishOwnersWire(NODES, []));
    expect(back.map((n) => n.id)).toEqual(["ra1", "ra2"]);
  });

  it("sends the schedule every row, so the parent walk to a project cannot be cut short", () => {
    const back = unpackOutline(scheduleNodesWire(NODES));
    expect(back.map((n) => n.id)).toEqual(NODES.map((n) => n.id));
    const task = back.find((n) => n.id === "t1");
    expect(task).toMatchObject({ parentId: "p1", effortMinutes: 30, hidden: false });
  });

  it("sends only the columns each consumer reads", () => {
    expect(Object.keys(unpackOutline(metricGoalsWire(NODES))[0]).sort()).toEqual([
      "id",
      "name",
      "type",
    ]);
    // Never the whole row: that is the point of a slice.
    expect(Object.keys(unpackOutline(scheduleNodesWire(NODES))[0]).length).toBeLessThan(
      15,
    );
  });
});
