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
  <Appointments>
    <AppointmentId>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</AppointmentId>
    <Subject>Gym</Subject>
  </Appointments>
  <ResultAreas>
    <ResultAreaId>11111111-2222-3333-4444-555555555555</ResultAreaId>
    <Name>Home</Name>
    <Priority>5000</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
</AchieveDB>`;
    const mapped = mapOutline(parseAchXml(xml));
    expect(mapped.skippedTables).toContain("Appointments");
    expect(mapped.warnings.filter((w) => w.includes("Appointments"))).toHaveLength(0);
    expect(mapped.counts.result_area).toBe(1);
  });
});
