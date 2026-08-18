import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createContact } from "@/lib/contacts/mutations";
import { createNodeItem, saveNodeDetail } from "@/lib/detail/mutations";
import { createNote } from "@/lib/notes/mutations";
import { createNode } from "@/lib/tree/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadFindCorpus } from "./queries";
import { FIND_FIELD_CLASSES, FIND_SOURCE_IDS } from "./types";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("find corpus");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `find-${crypto.randomUUID()}@localhost`, name: "Find Test" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("loadFindCorpus", () => {
  let userId: string;
  let goalId: string;

  beforeAll(async () => {
    userId = await makeUser();

    const areaId = await createNode({ userId, parentId: null, type: "result_area" });
    // `mission` lives on `result_area_details`, which has no `user_id` of its own — the
    // whole point of the join this reader has to get right.
    await saveNodeDetail(userId, areaId, {
      resultArea: { mission: "keep the lights on" },
    });

    goalId = await createNode({ userId, parentId: areaId, type: "goal" });
    await saveNodeDetail(userId, goalId, { goal: { vision: "a quiet inbox" } });

    await createNodeItem({ userId, nodeId: goalId, kind: "benefit" });
    await createNote({ userId, values: { title: "A note" } });
    await createContact(userId, { givenName: "Ada", familyName: "Lovelace" });
  });

  it("reaches the detail tables, which have no user_id of their own", async () => {
    const corpus = await loadFindCorpus(userId, FIND_SOURCE_IDS, FIND_FIELD_CLASSES);

    const labels = corpus.outlineDetails.map((field) => field.label);
    expect(labels).toContain("Mission");
    expect(labels).toContain("Vision");
    expect(
      corpus.outlineDetails.find((field) => field.label === "Mission")?.value,
    ).toBe("keep the lights on");
  });

  it("carries no empty detail fields", async () => {
    // These tables are wide and sparsely filled; carrying the blanks would multiply the
    // payload with nothing to match against.
    const corpus = await loadFindCorpus(userId, FIND_SOURCE_IDS, FIND_FIELD_CLASSES);
    expect(corpus.outlineDetails.every((field) => field.value !== "")).toBe(true);
  });

  it("loads only the sources asked for", async () => {
    const corpus = await loadFindCorpus(userId, ["notes"], FIND_FIELD_CLASSES);

    expect(corpus.notes.length).toBeGreaterThan(0);
    expect(corpus.outline).toEqual([]);
    expect(corpus.contacts).toEqual([]);
  });

  it("skips the child lists when sub-records are not being searched", async () => {
    const withSubrecords = await loadFindCorpus(
      userId,
      ["outline"],
      ["name", "subrecord"],
    );
    expect(withSubrecords.nodeItems.length).toBeGreaterThan(0);

    const without = await loadFindCorpus(userId, ["outline"], ["name"]);
    expect(without.nodeItems).toEqual([]);
    // The nodes themselves are still there — only the child list was skipped.
    expect(without.outline.length).toBeGreaterThan(0);
  });

  it("skips the detail-table read when detail text is not being searched", async () => {
    const without = await loadFindCorpus(userId, ["outline"], ["name"]);
    expect(without.outlineDetails).toEqual([]);
  });

  it("returns an empty corpus for no sources rather than everything", async () => {
    // A stored preference with every source unticked must not silently mean "search all".
    const corpus = await loadFindCorpus(userId, [], FIND_FIELD_CLASSES);
    const rows = Object.values(corpus).reduce((total, list) => total + list.length, 0);
    expect(rows).toBe(0);
  });

  it("gives a second user none of the first user's rows", async () => {
    const intruder = await makeUser();
    const corpus = await loadFindCorpus(intruder, FIND_SOURCE_IDS, FIND_FIELD_CLASSES);
    const rows = Object.values(corpus).reduce((total, list) => total + list.length, 0);
    expect(rows).toBe(0);
  });
});
