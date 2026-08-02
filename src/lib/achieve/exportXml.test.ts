import { describe, expect, it } from "vitest";
import { buildAchieveXml, type ExportOutlineRow } from "./exportXml";
import { mapOutline } from "./mapOutline";
import { parseAchXml } from "./parseXml";

function row(
  partial: Partial<ExportOutlineRow> & Pick<ExportOutlineRow, "id" | "type" | "name">,
): ExportOutlineRow {
  return {
    parentId: null,
    priorityLetter: null,
    priorityRank: null,
    tcPriorityLetter: null,
    tcPriorityRank: null,
    state: "not_started",
    focus: false,
    collapsed: false,
    notes: "",
    deadline: null,
    targetStart: null,
    targetEnd: null,
    deferredDate: null,
    completedAt: null,
    effortMinutes: null,
    effortLeftMinutes: null,
    actualEffortMinutes: null,
    percentComplete: null,
    purpose: "",
    category: null,
    importance: null,
    sortKey: "a0",
    ...partial,
  };
}

describe("buildAchieveXml", () => {
  it("emits AchieveDB with categories, result areas, projects, and tasks", () => {
    const { xml, counts } = buildAchieveXml([
      row({
        id: "ra1",
        type: "result_area",
        name: "Career",
        category: "Work",
        priorityLetter: "B",
        sortKey: "a0",
      }),
      row({
        id: "p1",
        parentId: "ra1",
        type: "project",
        name: "Ship v1",
        priorityLetter: "A",
        priorityRank: 1,
        sortKey: "a0",
      }),
      row({
        id: "t1",
        parentId: "p1",
        type: "task",
        name: "Write tests",
        priorityLetter: "A",
        priorityRank: 1,
        effortMinutes: 30,
        sortKey: "a0",
      }),
    ]);

    expect(xml).toContain("<AchieveDB>");
    expect(xml).toContain("<ResultAreaCategories>");
    expect(xml).toContain("<Name>Work</Name>");
    expect(xml).toContain("<Name>Career</Name>");
    expect(xml).toContain("<Name>Ship v1</Name>");
    expect(xml).toContain("<Name>Write tests</Name>");
    expect(xml).toContain("<Priority>1</Priority>");
    expect(xml).toContain("<ExpectedEffortBest>30</ExpectedEffortBest>");
    expect(counts).toEqual({
      result_area: 1,
      project: 1,
      task: 1,
      omitted: 0,
    });
  });

  it("omits goals and reparents their children to the result area", () => {
    const { xml, counts } = buildAchieveXml([
      row({ id: "ra", type: "result_area", name: "Home", sortKey: "a0" }),
      row({
        id: "g",
        parentId: "ra",
        type: "goal",
        name: "A goal",
        sortKey: "a0",
      }),
      row({
        id: "p",
        parentId: "g",
        type: "project",
        name: "Under goal",
        sortKey: "a0",
      }),
    ]);

    expect(xml).not.toContain("A goal");
    expect(xml).toContain("Under goal");
    expect(counts.omitted).toBe(1);
    expect(counts.project).toBe(1);
  });

  it("escapes XML special characters in names", () => {
    const { xml } = buildAchieveXml([
      row({ id: "ra", type: "result_area", name: "A & B <C>", sortKey: "a0" }),
    ]);
    expect(xml).toContain("A &amp; B &lt;C&gt;");
  });

  it("round-trips a tiny tree through export then parse/map", () => {
    const { xml } = buildAchieveXml([
      row({
        id: "ra1",
        type: "result_area",
        name: "Health",
        category: "Personal",
        priorityLetter: "C",
        sortKey: "a0",
      }),
      row({
        id: "p1",
        parentId: "ra1",
        type: "project",
        name: "Gym",
        priorityLetter: "A",
        priorityRank: 1,
        state: "in_progress",
        sortKey: "a0",
      }),
      row({
        id: "t1",
        parentId: "p1",
        type: "task",
        name: "Squats",
        priorityLetter: "A",
        priorityRank: 1,
        effortMinutes: 45,
        sortKey: "a0",
      }),
    ]);

    const mapped = mapOutline(parseAchXml(xml));
    expect(mapped.counts).toEqual({
      result_area: 1,
      goal: 0,
      project: 1,
      task: 1,
    });
    const gym = mapped.nodes.find((n) => n.name === "Gym");
    expect(gym?.priority).toEqual({ letter: "A", rank: 1 });
    expect(gym?.state).toBe("in_progress");
    const squats = mapped.nodes.find((n) => n.name === "Squats");
    expect(squats?.effortMinutes).toBe(45);
    expect(squats?.parentAchId).toBe(gym?.achId);
  });
});
