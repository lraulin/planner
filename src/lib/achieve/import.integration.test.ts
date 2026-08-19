import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  nodeItems,
  nodes,
  notes,
  resultAreaDetails,
  taskDetails,
  timeChartAreas,
  timeCharts,
  users,
} from "@/db/schema";
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
    expect(nextJob?.state).toBe("completed");

    // An Achieve file may carry bare letters, ties and gaps; none is representable here, so
    // the import densifies every sibling group on the way in. This fixture relies on it:
    // several Career projects are all stored as A1, and one result area carries a bare 2500.
    expect(
      outline.filter((n) => n.priorityLetter !== null && n.priorityRank === null),
    ).toEqual([]);

    // Every (parent, letter) group runs 1..n with no gap and no repeat.
    const groups = new Map<string, number[]>();
    for (const n of outline) {
      if (n.priorityLetter === null || n.priorityRank === null) continue;
      const key = `${n.parentId}:${n.priorityLetter}`;
      groups.set(key, [...(groups.get(key) ?? []), n.priorityRank]);
    }
    expect(groups.size).toBeGreaterThan(0);
    for (const [key, ranks] of groups) {
      expect([key, [...ranks].sort((a, b) => a - b)]).toEqual([
        key,
        ranks.map((_, index) => index + 1),
      ]);
    }

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

  it("merge appends after an existing outline without sort-key collisions", async () => {
    // Seed a root the way createNode would (first key is "V") so a naive merge that
    // restarts at first() would hit nodes_sibling_sort_key_uq.
    const [existing] = await db
      .insert(nodes)
      .values({
        userId,
        type: "result_area",
        name: "Existing Area",
        sortKey: "V",
      })
      .returning({ id: nodes.id });
    await db.insert(resultAreaDetails).values({ nodeId: existing.id });

    const tiny = `<?xml version="1.0"?>
<AchieveDB>
  <ResultAreas>
    <ResultAreaId>bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee</ResultAreaId>
    <Name>Career</Name>
    <Priority>5000</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
</AchieveDB>`;

    const result = await importAchieveXml({ userId, xml: tiny, mode: "merge" });
    expect(result.created).toBe(1);

    const outline = await loadOutline(userId);
    expect(outline.map((n) => n.name).sort()).toEqual(["Career", "Existing Area"]);

    const roots = outline.filter((n) => n.parentId === null);
    const keys = roots.map((n) => n.sortKey);
    expect(new Set(keys).size).toBe(keys.length);
    const career = roots.find((n) => n.name === "Career");
    expect(career).toBeTruthy();
    expect(career && career.sortKey > "V").toBe(true);

    const [careerRow] = await db
      .select({
        externalSource: nodes.externalSource,
        externalId: nodes.externalId,
      })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.name, "Career")))
      .limit(1);
    expect(careerRow.externalSource).toBe("achieve");
    // Merge omits stable GUIDs so a later re-append is not blocked by external_ref_uq.
    expect(careerRow.externalId).toBeNull();
  });

  it("merge of the same file twice duplicates nodes rather than failing", async () => {
    await importAchieveXml({ userId, xml: fixture, mode: "replace" });
    const afterReplace = (await loadOutline(userId)).length;
    expect(afterReplace).toBeGreaterThan(0);

    const second = await importAchieveXml({ userId, xml: fixture, mode: "merge" });
    expect(second.created).toBe(afterReplace);
    expect((await loadOutline(userId)).length).toBe(afterReplace * 2);
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
    expect(career?.category).toBe("~ Imported: Work");
    expect(career?.importance).toBe(70);

    const task = outline.find((n) => n.name === "T");
    expect(task?.effortMinutes).toBe(120);

    const [rad] = await db
      .select()
      .from(resultAreaDetails)
      .where(eq(resultAreaDetails.nodeId, career!.id));
    expect(rad.category).toBe("~ Imported: Work");

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
    expect(result.created).toBe(outline.length);
    const namesA = outline.map((n) => n.name).sort();
    const namesB = (await loadOutline(userB)).map((n) => n.name).sort();
    expect(namesB).toEqual(namesA);
  });

  it("imports appointments, time charts, wishes, and notes", async () => {
    const xml = `<?xml version="1.0"?>
<AchieveDB>
  <ResultAreas>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <Name>Work</Name>
    <Priority>5000</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </ResultAreas>
  <Projects>
    <ProjectId>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</ProjectId>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <Name>Gym proj</Name>
    <Priority>1</Priority>
    <__ORDINAL__>0</__ORDINAL__>
  </Projects>
  <Appointments>
    <AppointmentId>ap111111-1111-1111-1111-111111111111</AppointmentId>
    <Subject>Gym</Subject>
    <StartDateTime>2011-06-07T21:30:00+09:00</StartDateTime>
    <EndDateTime>2011-06-07T22:15:00+09:00</EndDateTime>
    <IsAllDayEvent>false</IsAllDayEvent>
    <ShowTimeAs>1</ShowTimeAs>
    <CompletionState>0</CompletionState>
    <ProjectId>bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb</ProjectId>
    <Priority>100000</Priority>
  </Appointments>
  <TimeCharts>
    <TimeChartId>tc111111-1111-1111-1111-111111111111</TimeChartId>
    <Name>Ideal</Name>
  </TimeCharts>
  <TimeChartAreas>
    <TimeChartAreaId>ta111111-1111-1111-1111-111111111111</TimeChartAreaId>
    <TimeChartId>tc111111-1111-1111-1111-111111111111</TimeChartId>
    <Text>Deep work</Text>
    <StartTime>2011-06-07T09:00:00+09:00</StartTime>
    <Duration>PT2H</Duration>
    <Weekday>1</Weekday>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
  </TimeChartAreas>
  <TimeChartAreas>
    <TimeChartAreaId>ta222222-2222-2222-2222-222222222222</TimeChartAreaId>
    <TimeChartId>tc111111-1111-1111-1111-111111111111</TimeChartId>
    <Text>Deep work</Text>
    <StartTime>2011-06-07T09:00:00+09:00</StartTime>
    <Duration>PT2H</Duration>
    <Weekday>3</Weekday>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
  </TimeChartAreas>
  <Wishes>
    <WishId>ww111111-1111-1111-1111-111111111111</WishId>
    <Title>SSD</Title>
    <Type>0</Type>
    <Priority>2500</Priority>
    <ResultAreaId>aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa</ResultAreaId>
    <__ORDINAL__>0</__ORDINAL__>
  </Wishes>
  <NoteItems>
    <NoteItemId>nn111111-1111-1111-1111-111111111111</NoteItemId>
    <Title>Life Plan</Title>
    <Subject>General</Subject>
    <NoteText>Hello notes</NoteText>
    <Flag>0</Flag>
    <Expanded>true</Expanded>
    <__ORDINAL__>0</__ORDINAL__>
  </NoteItems>
</AchieveDB>`;

    const result = await importAchieveXml({ userId, xml, mode: "replace" });
    expect(result.extras.appointments).toBe(1);
    expect(result.extras.timeCharts).toBe(1);
    expect(result.extras.timeChartAreas).toBe(1); // Mon+Wed collapsed
    expect(result.extras.wishes).toBe(1);
    expect(result.extras.notes).toBe(1);

    const appts = await db
      .select()
      .from(appointments)
      .where(eq(appointments.userId, userId));
    expect(appts).toHaveLength(1);
    expect(appts[0]?.subject).toBe("Gym");
    expect(appts[0]?.externalSource).toBe("achieve");

    const charts = await db
      .select()
      .from(timeCharts)
      .where(eq(timeCharts.userId, userId));
    expect(charts[0]?.name).toBe("Ideal");
    const areas = await db
      .select()
      .from(timeChartAreas)
      .where(eq(timeChartAreas.userId, userId));
    expect(areas).toHaveLength(1);
    expect(areas[0]?.daysOfWeek.sort()).toEqual([1, 3]);
    expect(areas[0]?.durationMinutes).toBe(120);

    const wishes = await db
      .select()
      .from(nodeItems)
      .where(eq(nodeItems.userId, userId));
    expect(wishes).toHaveLength(1);
    expect(wishes[0]?.title).toBe("SSD");
    expect(wishes[0]?.kind).toBe("wish_want_dont_have");

    const noteRows = await db.select().from(notes).where(eq(notes.userId, userId));
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0]?.body).toBe("Hello notes");
  });

  it("imports a goal and reparents its linked project underneath", async () => {
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
    <Status>0</Status>
    <IsCompleted>false</IsCompleted>
    <__ORDINAL__>0</__ORDINAL__>
  </Goals>
</AchieveDB>`;
    await importAchieveXml({ userId, xml, mode: "replace" });
    const outline = await loadOutline(userId);
    const goal = outline.find((n) => n.name === "130 cm shoulders");
    const gym = outline.find((n) => n.name === "Gym");
    expect(goal?.type).toBe("goal");
    expect(gym?.parentId).toBe(goal?.id);
    expect(goal?.parentId).toBe(outline.find((n) => n.name === "Body")?.id);
  });
});
