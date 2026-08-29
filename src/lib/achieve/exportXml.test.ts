import { describe, expect, it } from "vitest";
import { exportFilename } from "@/lib/grid/exportCsv";
import { buildAchieveXml, stampAchieveXml, type ExportOutlineRow } from "./exportXml";
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
    expect(xml.startsWith('<?xml version="1.0" standalone="yes"?>\n<AchieveDB>')).toBe(
      true,
    );
    expect(counts).toEqual({
      result_area: 1,
      goal: 0,
      project: 1,
      task: 1,
      metric: 0,
      metric_entry: 0,
      omitted: 0,
    });
  });

  it("stamps an export comment before AchieveDB without breaking re-import", () => {
    const at = new Date("2026-08-29T17:41:36.000Z");
    const { xml } = buildAchieveXml([
      row({
        id: "ra1",
        type: "result_area",
        name: "Career",
        category: "Work",
        sortKey: "a0",
      }),
    ]);
    const stamped = stampAchieveXml(xml, at);
    expect(stamped).toContain("<!-- Exported 2026-08-29T13:41:36-04:00 -->");
    expect(stamped.indexOf("<!-- Exported")).toBeGreaterThan(stamped.indexOf("<?xml"));
    expect(stamped.indexOf("<!-- Exported")).toBeLessThan(
      stamped.indexOf("<AchieveDB>"),
    );
    expect(exportFilename("planner-export", "achxml", at)).toBe(
      "planner-export_2026-08-29T134136-0400.achxml",
    );
    const parsed = parseAchXml(stamped);
    expect(mapOutline(parsed).nodes.some((node) => node.name === "Career")).toBe(true);
  });

  it("exports goals and links child projects via ProjectId", () => {
    const { xml, counts } = buildAchieveXml([
      row({ id: "ra", type: "result_area", name: "Home", sortKey: "a0" }),
      row({
        id: "g",
        parentId: "ra",
        type: "goal",
        name: "A goal",
        definition: "Reach the summit",
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

    expect(xml).toContain("<Goals>");
    expect(xml).toContain("A goal");
    expect(xml).toContain("Reach the summit");
    expect(xml).toContain("Under goal");
    expect(counts.goal).toBe(1);
    expect(counts.project).toBe(1);
    expect(counts.omitted).toBe(0);
  });

  it("exports metrics and tracking rows", () => {
    const { xml, counts } = buildAchieveXml(
      [row({ id: "g", type: "goal", name: "Body", sortKey: "a0" })],
      [
        {
          id: "m1",
          ownerNodeId: "g",
          title: "Waist Width",
          category: "Body",
          question: "What is my waist measurement?",
          description: "",
          reason: "",
          units: "cm",
          active: true,
          priorityLetter: "A",
          priorityRank: 1,
          metricType: "total",
          objectiveTarget: 80,
          sortKey: "a0",
          entries: [
            {
              id: "e1",
              entryDate: "2016-01-05",
              entryType: "new_total",
              target: 80,
              value: 95,
            },
          ],
        },
      ],
    );
    expect(xml).toContain("<Metrics>");
    expect(xml).toContain("Waist Width");
    expect(xml).toContain("<Type>0</Type>");
    expect(xml).toContain("<MetricTracking>");
    expect(xml).toContain("<Value>95</Value>");
    expect(counts.metric).toBe(1);
    expect(counts.metric_entry).toBe(1);
  });

  it("encodes cumulative metric type as 2", () => {
    const { xml } = buildAchieveXml(
      [],
      [
        {
          id: "m2",
          ownerNodeId: null,
          title: "Pages",
          category: "Writing",
          question: "How many pages?",
          description: "",
          reason: "",
          units: "",
          active: true,
          priorityLetter: null,
          priorityRank: null,
          metricType: "cumulative",
          objectiveTarget: null,
          sortKey: "a0",
          entries: [],
        },
      ],
    );
    expect(xml).toContain("Pages");
    expect(xml).toMatch(/<Metrics>[\s\S]*<Type>2<\/Type>/);
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
    expect(mapped.counts.result_area).toBe(1);
    expect(mapped.counts.project).toBe(1);
    expect(mapped.counts.task).toBe(1);
    const gym = mapped.nodes.find((n) => n.name === "Gym");
    expect(gym?.priority).toEqual({ letter: "A", rank: 1 });
    expect(gym?.state).toBe("in_progress");
    const squats = mapped.nodes.find((n) => n.name === "Squats");
    expect(squats?.effortMinutes).toBe(45);
    expect(squats?.parentAchId).toBe(gym?.achId);
  });
});
