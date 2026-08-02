import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, resultAreaDetails, taskDetails, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadOutline } from "@/lib/tree/queries";
import { importAchieveXml, writeMappedOutline } from "./import";
import { mapOutline } from "./mapOutline";
import { parseAchXml } from "./parseXml";
import { buildAchieveXml, type ExportOutlineRow } from "./exportXml";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("achieve import");

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/minimal.achxml"),
  "utf8",
);

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `achieve-import-${crypto.randomUUID()}@localhost`,
      name: "Achieve Import Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("importAchieveXml", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("imports the minimal fixture into a tree with parents and priorities", async () => {
    const result = await importAchieveXml({
      userId,
      xml: fixture,
      mode: "replace",
    });

    expect(result.created).toBeGreaterThan(0);
    expect(result.counts.project).toBeGreaterThan(0);

    const outline = await loadOutline(userId);
    expect(outline.length).toBe(result.created);

    const nextJob = outline.find((n) => n.name === "Next ESL Job");
    expect(nextJob?.type).toBe("project");
    expect(nextJob?.priorityLetter).toBe("A");
    expect(nextJob?.priorityRank).toBe(1);
    expect(nextJob?.state).toBe("completed");

    const nested = outline.find((n) => n.name === "Copy Social Circle DVDs");
    expect(nested?.parentId).toBeTruthy();
    const parent = outline.find((n) => n.id === nested?.parentId);
    expect(parent?.name).toBe("Social Circle");
  });

  it("replace clears the previous outline", async () => {
    await importAchieveXml({ userId, xml: fixture, mode: "replace" });
    const first = await loadOutline(userId);
    expect(first.length).toBeGreaterThan(0);

    const tiny = `<?xml version="1.0"?>
<AchieveDB>
  <ResultAreas>
    <ResultAreaId>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</ResultAreaId>
    <Name>Only Area</Name>
    <Priority>5000</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
</AchieveDB>`;
    await importAchieveXml({ userId, xml: tiny, mode: "replace" });
    const outline = await loadOutline(userId);
    expect(outline.map((n) => n.name)).toEqual(["Only Area"]);
  });

  it("does not let user B see user A's imported rows", async () => {
    const userA = userId;
    const userB = await makeUser();
    await importAchieveXml({ userId: userA, xml: fixture, mode: "replace" });

    const aCount = (await loadOutline(userA)).length;
    expect(aCount).toBeGreaterThan(0);
    expect(await loadOutline(userB)).toEqual([]);

    // B cannot update A's node by id.
    const [aNode] = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(eq(nodes.userId, userA))
      .limit(1);
    await db
      .update(nodes)
      .set({ name: "Hijacked" })
      .where(and(eq(nodes.id, aNode.id), eq(nodes.userId, userB)));
    const [still] = await db
      .select({ name: nodes.name })
      .from(nodes)
      .where(eq(nodes.id, aNode.id));
    expect(still.name).not.toBe("Hijacked");
  });

  it("writes result-area category and task effort into detail tables", async () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <ResultAreaCategories>
    <CategoryId>cccccccc-cccc-cccc-cccc-cccccccccccc</CategoryId>
    <Name>Work</Name>
  </ResultAreaCategories>
  <ResultAreas>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <CategoryId>cccccccc-cccc-cccc-cccc-cccccccccccc</CategoryId>
    <Name>Career</Name>
    <Importance>70</Importance>
    <Priority>2500</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
  <Projects>
    <ProjectId>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</ProjectId>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <Name>P</Name>
    <Priority>1</Priority>
    <Status>0</Status>
    <__ORDINAL__>0</__ORDINAL__>
  </Projects>
  <Tasks>
    <TaskId>dddddddd-dddd-dddd-dddd-dddddddddddd</TaskId>
    <ProjectId>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</ProjectId>
    <Name>T</Name>
    <Priority>1</Priority>
    <ExpectedEffortBest>2</ExpectedEffortBest>
    <ExpectedEffortBestUnits>1</ExpectedEffortBestUnits>
    <Status>0</Status>
    <__ORDINAL__>0</__ORDINAL__>
  </Tasks>
</AchieveDB>`;

    await importAchieveXml({ userId, xml, mode: "replace" });
    const outline = await loadOutline(userId);
    const career = outline.find((n) => n.name === "Career");
    expect(career?.category).toBe("Work");
    expect(career?.importance).toBe(70);

    const task = outline.find((n) => n.name === "T");
    expect(task?.effortMinutes).toBe(120);

    const [rad] = await db
      .select()
      .from(resultAreaDetails)
      .where(eq(resultAreaDetails.nodeId, career!.id));
    expect(rad.category).toBe("Work");

    const [td] = await db
      .select()
      .from(taskDetails)
      .where(eq(taskDetails.nodeId, task!.id));
    expect(td.effortMinutes).toBe(120);
  });

  it("round-trips through export XML and back", async () => {
    await writeMappedOutline({
      userId,
      mode: "replace",
      mapped: mapOutline(parseAchXml(fixture)),
    });
    const outline = await loadOutline(userId);
    const exportRows: ExportOutlineRow[] = outline.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      type: n.type,
      name: n.name,
      priorityLetter: n.priorityLetter,
      priorityRank: n.priorityRank,
      tcPriorityLetter: n.tcPriorityLetter,
      tcPriorityRank: n.tcPriorityRank,
      state: n.state,
      focus: n.focus,
      collapsed: n.collapsed,
      notes: n.notes,
      deadline: n.deadline,
      targetStart: n.targetStart,
      targetEnd: n.targetEnd,
      deferredDate: n.deferredDate,
      completedAt: n.completedAt,
      effortMinutes: n.effortMinutes,
      effortLeftMinutes: n.effortLeftMinutes,
      actualEffortMinutes: n.actualEffortMinutes,
      percentComplete: n.percentComplete,
      purpose: n.purpose,
      category: n.category,
      importance: n.importance,
      sortKey: n.sortKey,
    }));
    const { xml } = buildAchieveXml(exportRows);

    const userB = await makeUser();
    const result = await importAchieveXml({
      userId: userB,
      xml,
      mode: "replace",
    });
    expect(result.created).toBe(
      outline.filter(
        (n) => n.type === "result_area" || n.type === "project" || n.type === "task",
      ).length,
    );
    const namesA = outline
      .filter((n) => n.type !== "goal")
      .map((n) => n.name)
      .sort();
    const namesB = (await loadOutline(userB)).map((n) => n.name).sort();
    expect(namesB).toEqual(namesA);
  });
});
