import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAchXml, stripSchema, tableRows } from "./parseXml";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/minimal.achxml"),
  "utf8",
);

describe("stripSchema", () => {
  it("removes an embedded XSD block", () => {
    const xml = `<AchieveDB><xs:schema id="x">...</xs:schema>\n  <Projects/></AchieveDB>`;
    expect(stripSchema(xml)).not.toMatch(/xs:schema/);
    expect(stripSchema(xml)).toContain("Projects");
  });
});

describe("parseAchXml", () => {
  it("rejects files without AchieveDB", () => {
    expect(() => parseAchXml("<root/>")).toThrow(/AchieveDB/);
  });

  it("reads table rows and field text from the minimal fixture", () => {
    const doc = parseAchXml(fixture);
    const ras = tableRows(doc, "ResultAreas");
    const projects = tableRows(doc, "Projects");
    const tasks = tableRows(doc, "Tasks");

    expect(ras.length).toBeGreaterThan(0);
    expect(projects.length).toBeGreaterThan(0);
    expect(tasks.length).toBeGreaterThan(0);

    const career = ras.find((r) => r.Name === "Career");
    expect(career?.ResultAreaId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const nextJob = projects.find((p) => p.Name === "Next ESL Job");
    expect(nextJob?.Priority).toBe("1");
    expect(nextJob?.Status).toBe("3");
    expect(nextJob?.IsCompleted).toBe("true");
  });

  it("decodes XML entities in field text", () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <Tasks>
    <TaskId>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</TaskId>
    <ProjectId>11111111-2222-3333-4444-555555555555</ProjectId>
    <Name>A &amp; B &lt;C&gt;</Name>
    <Priority>1</Priority>
  </Tasks>
</AchieveDB>`;
    const doc = parseAchXml(xml);
    expect(tableRows(doc, "Tasks")[0]?.Name).toBe("A & B <C>");
  });
});
