import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapOutline } from "./mapOutline";
import { parseAchXml } from "./parseXml";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/minimal.achxml"),
  "utf8",
);

describe("mapOutline", () => {
  it("maps result areas, projects, and tasks with parent links", () => {
    const mapped = mapOutline(parseAchXml(fixture));

    expect(mapped.counts.result_area).toBeGreaterThan(0);
    expect(mapped.counts.project).toBeGreaterThan(0);
    expect(mapped.counts.task).toBeGreaterThan(0);

    const byId = new Map(mapped.nodes.map((n) => [n.achId, n]));
    const nested = mapped.nodes.find((n) => n.name === "Copy Social Circle DVDs");
    expect(nested?.type).toBe("project");
    expect(nested?.parentAchId).toBeTruthy();
    expect(byId.get(nested!.parentAchId!)?.name).toBe("Social Circle");

    const task = mapped.nodes.find((n) => n.name.startsWith("Get 18 USD money order"));
    expect(task?.type).toBe("task");
    expect(task?.parentAchId).toBeTruthy();
    expect(byId.has(task!.parentAchId!)).toBe(true);
  });

  it("decodes A1 priority and completed state from the fixture", () => {
    const mapped = mapOutline(parseAchXml(fixture));
    const nextJob = mapped.nodes.find((n) => n.name === "Next ESL Job");
    expect(nextJob?.priority).toEqual({ letter: "A", rank: 1 });
    expect(nextJob?.state).toBe("completed");
    expect(nextJob?.percentComplete).toBe(100);
  });

  it("prefers IsCompleted over a mismatched Status code", () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <Projects>
    <ProjectId>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</ProjectId>
    <ResultAreaId>11111111-2222-3333-4444-555555555555</ResultAreaId>
    <Name>Done-ish</Name>
    <Priority>100000</Priority>
    <Status>0</Status>
    <IsCompleted>true</IsCompleted>
    <PercentCompleted>10000</PercentCompleted>
    <__ORDINAL__>0</__ORDINAL__>
  </Projects>
</AchieveDB>`;
    const mapped = mapOutline(parseAchXml(xml));
    expect(mapped.nodes[0]?.state).toBe("completed");
  });

  it("lists non-outline tables as skipped without warning when known", () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <Contacts>
    <ContactId>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</ContactId>
    <FirstName>Ada</FirstName>
  </Contacts>
  <ResultAreas>
    <ResultAreaId>11111111-2222-3333-4444-555555555555</ResultAreaId>
    <Name>Home</Name>
    <Priority>5000</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
</AchieveDB>`;
    const mapped = mapOutline(parseAchXml(xml));
    expect(mapped.skippedTables).toContain("Contacts");
    expect(mapped.warnings.filter((w) => w.includes("Contacts"))).toHaveLength(0);
    expect(mapped.counts.result_area).toBe(1);
  });

  it("maps goals under a result area and links a project association", () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <ResultAreas>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <Name>Body</Name>
    <Priority>2500</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
  <Projects>
    <ProjectId>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</ProjectId>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <Name>Gym</Name>
    <Priority>1</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </Projects>
  <Goals>
    <GoalId>cccccccc-cccc-cccc-cccc-cccccccccccc</GoalId>
    <ProjectId>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</ProjectId>
    <Definition>130 cm shoulders</Definition>
    <Priority>100000</Priority>
    <ProgressReviewSchedule>1</ProgressReviewSchedule>
    <Scorecard>false</Scorecard>
    <IsCompleted>false</IsCompleted>
    <Status>0</Status>
    <__ORDINAL__>0</__ORDINAL__>
  </Goals>
</AchieveDB>`;
    const mapped = mapOutline(parseAchXml(xml));
    expect(mapped.counts.goal).toBe(1);
    const goal = mapped.nodes.find((n) => n.type === "goal");
    expect(goal?.name).toBe("130 cm shoulders");
    expect(goal?.definition).toBe("130 cm shoulders");
    expect(goal?.progressReview).toBe("weekly");
    expect(goal?.linkedProjectAchId).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    // Parent becomes the project's result area when only ProjectId is set.
    expect(goal?.parentAchId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("imports a task that only has ResultAreaId", () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <ResultAreas>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <Name>Work</Name>
    <Priority>5000</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
  <Tasks>
    <TaskId>dddddddd-dddd-dddd-dddd-dddddddddddd</TaskId>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <Name>Loose task</Name>
    <Priority>1</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </Tasks>
</AchieveDB>`;
    const mapped = mapOutline(parseAchXml(xml));
    expect(mapped.counts.task).toBe(1);
    expect(mapped.nodes.find((n) => n.name === "Loose task")?.parentAchId).toBe(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
  });
});
