import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadNodeDetail } from "@/lib/detail/queries";
import { createNode, deleteNode, setState } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { captureItems, ensureInbox, INBOX_NAME } from "./mutations";
import { parseCapture } from "./parse";

/**
 * Integration tests against the local Postgres (`npm run db:up`). Each test works under its
 * own user, so these never touch seeded development data.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("capture mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

/** The outline as indented names, for readable assertions. */
async function outlineOf(userId: string): Promise<string[]> {
  const rows = await loadOutline(userId);
  return rows.map((r) => `${"  ".repeat(r.depth)}${r.name}`);
}

async function nodeById(userId: string, id: string) {
  const [node] = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.id, id), eq(nodes.userId, userId)))
    .limit(1);
  return node;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("ensureInbox", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates one inbox project at the top of the outline", async () => {
    const inboxId = await ensureInbox(userId);

    const inbox = await nodeById(userId, inboxId);
    expect(inbox.type).toBe("project");
    expect(inbox.name).toBe(INBOX_NAME);
    expect(inbox.isInbox).toBe(true);
    expect(inbox.parentId).toBeNull();
    expect(inbox.priorityLetter).toBe("D");
    expect(inbox.state).toBe("in_progress");
  });

  it("sorts ahead of result areas that already exist", async () => {
    await createNode({ userId, parentId: null, type: "result_area", name: "Health" });
    await ensureInbox(userId);

    expect(await outlineOf(userId)).toEqual([INBOX_NAME, "Health"]);
  });

  it("returns the same inbox on every later call", async () => {
    const first = await ensureInbox(userId);
    const second = await ensureInbox(userId);

    expect(second).toBe(first);
    expect(await outlineOf(userId)).toEqual([INBOX_NAME]);
  });

  // Identity is the flag, not the name — Achieve works the same way, and a rename is the
  // most likely thing a user does to it ("Triage", "Unsorted").
  it("still finds the inbox after it has been renamed", async () => {
    const first = await ensureInbox(userId);
    await db.update(nodes).set({ name: "Triage" }).where(eq(nodes.id, first));

    expect(await ensureInbox(userId)).toBe(first);
    expect(await outlineOf(userId)).toEqual(["Triage"]);
  });

  it("reopens a completed inbox rather than filling a finished project", async () => {
    const inboxId = await ensureInbox(userId);
    await setState(userId, inboxId, "completed");

    await ensureInbox(userId);

    const inbox = await nodeById(userId, inboxId);
    expect(inbox.state).toBe("in_progress");
    expect(inbox.completedAt).toBeNull();
  });

  it("reopens a cancelled inbox too", async () => {
    const inboxId = await ensureInbox(userId);
    await setState(userId, inboxId, "cancelled");

    await ensureInbox(userId);
    expect((await nodeById(userId, inboxId)).state).toBe("in_progress");
  });

  // Deleting the inbox is the reset gesture: it takes the unprocessed items with it and
  // the next capture starts clean. Nothing blocks the delete.
  it("makes a fresh inbox after the old one is deleted", async () => {
    const first = await ensureInbox(userId);
    await captureItems({ userId, items: parseCapture("Old idea") });
    await deleteNode(userId, first);
    expect(await outlineOf(userId)).toEqual([]);

    const second = await ensureInbox(userId);
    expect(second).not.toBe(first);
    expect(await outlineOf(userId)).toEqual([INBOX_NAME]);
  });
});

describeDb("captureItems", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  it("puts captured lines in the inbox as tasks", async () => {
    const { createdIds } = await captureItems({
      userId,
      items: parseCapture("Call the dentist\nRenew registration"),
    });

    expect(createdIds).toHaveLength(2);
    expect(await outlineOf(userId)).toEqual([
      INBOX_NAME,
      "  Call the dentist",
      "  Renew registration",
    ]);
    expect((await nodeById(userId, createdIds[0])).type).toBe("task");
  });

  it("builds the subtree the indentation asked for", async () => {
    await captureItems({
      userId,
      items: parseCapture(
        [
          "- Call the dentist",
          "    * Find the insurance card",
          "    1. Check the copay",
          "[ ] Renew registration",
        ].join("\n"),
      ),
    });

    expect(await outlineOf(userId)).toEqual([
      INBOX_NAME,
      "  Call the dentist",
      "    Find the insurance card",
      "    Check the copay",
      "  Renew registration",
    ]);
  });

  it("appends to an inbox that already has items, keeping order", async () => {
    await captureItems({ userId, items: parseCapture("First") });
    await captureItems({ userId, items: parseCapture("Second\n  Under second") });

    expect(await outlineOf(userId)).toEqual([
      INBOX_NAME,
      "  First",
      "  Second",
      "    Under second",
    ]);
  });

  it("stores the ## note on the task", async () => {
    const { createdIds } = await captureItems({
      userId,
      items: parseCapture("Renew registration ## expires end of month"),
    });

    expect((await nodeById(userId, createdIds[0])).notes).toBe("expires end of month");
  });

  it("captures into a chosen project instead, leaving the inbox uncreated", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    const project = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "Migration",
    });

    const { parentId } = await captureItems({
      userId,
      parentId: project,
      items: parseCapture("Write the runbook"),
    });

    expect(parentId).toBe(project);
    expect(await outlineOf(userId)).toEqual([
      "Work",
      "  Migration",
      "    Write the runbook",
    ]);
  });

  it("applies the same defaults to every captured item", async () => {
    const deadline = new Date("2026-08-15T12:00:00.000Z");
    const { createdIds } = await captureItems({
      userId,
      items: parseCapture("One\n  Two"),
      defaults: {
        priorityLetter: "A",
        priorityRank: 2,
        deadline,
        effortMinutes: 30,
        contexts: ["errand"],
      },
    });

    for (const id of createdIds) {
      const node = await nodeById(userId, id);
      expect(node.priorityLetter).toBe("A");
      expect(node.priorityRank).toBe(2);
      expect(node.deadline?.toISOString()).toBe(deadline.toISOString());

      const detail = await loadNodeDetail(userId, id);
      expect(detail?.task?.effortMinutes).toBe(30);
      expect(detail?.task?.contexts).toEqual(["errand"]);
    }
  });

  it("does nothing for empty input but still resolves the inbox", async () => {
    const { createdIds, parentId } = await captureItems({ userId, items: [] });

    expect(createdIds).toEqual([]);
    expect((await nodeById(userId, parentId)).isInbox).toBe(true);
  });
});

describeDb("capture user isolation", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  // The mistake this catches: a `where is_inbox` lookup that forgets `user_id`. Every
  // single-user test above would still pass while capture wrote into someone else's tree.
  it("gives each user their own inbox", async () => {
    const other = await makeUser();

    const mine = await ensureInbox(userId);
    const theirs = await ensureInbox(other);

    expect(theirs).not.toBe(mine);
    expect((await nodeById(other, theirs)).userId).toBe(other);
  });

  it("does not return another user's inbox to a user who has none", async () => {
    const other = await makeUser();
    await ensureInbox(other);

    const mine = await ensureInbox(userId);
    expect((await nodeById(userId, mine)).userId).toBe(userId);
  });

  it("keeps captured items out of the other user's outline", async () => {
    const other = await makeUser();

    await captureItems({ userId, items: parseCapture("Mine") });
    await captureItems({ userId: other, items: parseCapture("Theirs") });

    expect(await outlineOf(userId)).toEqual([INBOX_NAME, "  Mine"]);
    expect(await outlineOf(other)).toEqual([INBOX_NAME, "  Theirs"]);
  });

  it("refuses to capture into another user's project", async () => {
    const other = await makeUser();
    const theirProject = await createNode({
      userId: other,
      parentId: null,
      type: "project",
      name: "Theirs",
    });

    // "Not found" rather than "forbidden": confirming the id exists would leak it.
    await expect(
      captureItems({ userId, parentId: theirProject, items: parseCapture("Sneaky") }),
    ).rejects.toThrow("Node not found");

    expect(await outlineOf(other)).toEqual(["Theirs"]);
  });

  it("refuses to capture into another user's inbox", async () => {
    const other = await makeUser();
    const theirInbox = await ensureInbox(other);

    await expect(
      captureItems({ userId, parentId: theirInbox, items: parseCapture("Sneaky") }),
    ).rejects.toThrow("Node not found");

    expect(await outlineOf(other)).toEqual([INBOX_NAME]);
  });

  it("does not let one user delete another's captured item", async () => {
    const other = await makeUser();
    const { createdIds } = await captureItems({
      userId: other,
      items: parseCapture("Theirs"),
    });

    await deleteNode(userId, createdIds[0]);

    expect(await outlineOf(other)).toEqual([INBOX_NAME, "  Theirs"]);
  });
});
