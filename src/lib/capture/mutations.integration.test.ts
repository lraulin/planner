import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadNodeDetail } from "@/lib/detail/queries";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { createNode, deleteNode, renameNode, setState } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { captureItems, ensureInbox, INBOX_NAME } from "./mutations";
import { parseCapture, type CapturedItem } from "./parse";

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
    // Deliberately unprioritized rather than Achieve's D. D means "don't do — hide this",
    // which is the wrong claim about work nobody has triaged yet.
    expect(inbox.priorityLetter).toBeNull();
    expect(inbox.priorityRank).toBeNull();
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
    const { nodeIds } = await captureItems({
      userId,
      items: parseCapture("Call the dentist\nRenew registration"),
    });

    expect(nodeIds).toHaveLength(2);
    expect(await outlineOf(userId)).toEqual([
      INBOX_NAME,
      "  Call the dentist",
      "  Renew registration",
    ]);
    expect((await nodeById(userId, nodeIds[0])).type).toBe("task");
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
    const { nodeIds } = await captureItems({
      userId,
      items: parseCapture("Renew registration ## expires end of month"),
    });

    expect((await nodeById(userId, nodeIds[0])).notes).toBe("expires end of month");
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
    const { nodeIds } = await captureItems({
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

    for (const id of nodeIds) {
      const node = await nodeById(userId, id);
      expect(node.priorityLetter).toBe("A");
      // The requested rank is a *request*, not a value: "One" and its child "Two" are each
      // the only A in their own sibling group, so A2 clamps to A1 rather than leaving a gap.
      expect(node.priorityRank).toBe(1);
      expect(node.deadline?.toISOString()).toBe(deadline.toISOString());

      const detail = await loadNodeDetail(userId, id);
      expect(detail?.task?.effortMinutes).toBe(30);
      expect(detail?.task?.contexts).toEqual(["errand"]);
    }
  });

  it("does nothing for empty input but still resolves the inbox", async () => {
    const { nodeIds, parentId } = await captureItems({ userId, items: [] });

    expect(nodeIds).toEqual([]);
    expect((await nodeById(userId, parentId)).isInbox).toBe(true);
  });

  it("applies a per-item deadline, beating the batch default", async () => {
    const perItem = fromDateKey("2026-04-15");
    const fallback = fromDateKey("2026-12-31");

    const { nodeIds } = await captureItems({
      userId,
      items: [
        { depth: 0, name: "Taxes", note: "", deadline: perItem },
        { depth: 0, name: "Something else", note: "" },
      ],
      defaults: { deadline: fallback },
    });

    // Calendar days are stored as UTC noon; compare keys, not exact instants.
    expect(toDateKey((await nodeById(userId, nodeIds[0])).deadline!)).toBe(
      "2026-04-15",
    );
    // The default is what the caller meant for items that did not say — not an override.
    expect(toDateKey((await nodeById(userId, nodeIds[1])).deadline!)).toBe(
      "2026-12-31",
    );
  });
});

/**
 * The dedupe contract. An importer POSTs a batch, then marks the source items handled; if
 * it dies between those two steps its only recovery is to send the batch again, so sending
 * it again has to be free.
 */
describeDb("captureItems with external refs", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  const reminder = (name: string, id: string): CapturedItem => ({
    depth: 0,
    name,
    note: "",
    external: { source: "apple_reminders", id },
  });

  it("stores the provenance pair on the node", async () => {
    const { nodeIds } = await captureItems({
      userId,
      items: [reminder("Call the dentist", "2026-07-30T09:14:22Z|Call the dentist")],
    });

    const node = await nodeById(userId, nodeIds[0]);
    expect(node.externalSource).toBe("apple_reminders");
    expect(node.externalId).toBe("2026-07-30T09:14:22Z|Call the dentist");
  });

  it("leaves both columns null for ordinary typed capture", async () => {
    const { nodeIds } = await captureItems({ userId, items: parseCapture("Typed") });

    const node = await nodeById(userId, nodeIds[0]);
    expect(node.externalSource).toBeNull();
    expect(node.externalId).toBeNull();
  });

  // The headline case: the whole reason the column exists.
  it("creates one node when the same batch is sent twice", async () => {
    const items = [reminder("Call the dentist", "r1"), reminder("Buy milk", "r2")];

    const first = await captureItems({ userId, items });
    const second = await captureItems({ userId, items });

    expect(first.results.map((r) => r.created)).toEqual([true, true]);
    expect(second.results.map((r) => r.created)).toEqual([false, false]);
    expect(second.nodeIds).toEqual(first.nodeIds);
    expect(await outlineOf(userId)).toEqual([
      INBOX_NAME,
      "  Call the dentist",
      "  Buy milk",
    ]);
  });

  it("creates only the new items when a batch overlaps an earlier one", async () => {
    await captureItems({ userId, items: [reminder("Old", "r1")] });

    const { results } = await captureItems({
      userId,
      items: [reminder("Old", "r1"), reminder("New", "r2")],
    });

    expect(results.map((r) => r.created)).toEqual([false, true]);
    expect(await outlineOf(userId)).toEqual([INBOX_NAME, "  Old", "  New"]);
  });

  it("echoes the externalId back so a caller can match results to what it sent", async () => {
    const { results } = await captureItems({
      userId,
      items: [reminder("One", "r1"), reminder("Two", "r2")],
    });

    expect(results.map((r) => r.externalId)).toEqual(["r1", "r2"]);
  });

  // A retry must not undo triage. By the time an importer re-sends, the node may have been
  // renamed, filed under a project and half-finished.
  it("does not touch a node that already exists for the ref", async () => {
    const { nodeIds } = await captureItems({
      userId,
      items: [reminder("Call the dentist", "r1")],
    });
    await renameNode(userId, nodeIds[0], "Call Dr Chen about the crown");
    await setState(userId, nodeIds[0], "in_progress");

    await captureItems({ userId, items: [reminder("Call the dentist", "r1")] });

    const node = await nodeById(userId, nodeIds[0]);
    expect(node.name).toBe("Call Dr Chen about the crown");
    expect(node.state).toBe("in_progress");
  });

  // Two different sources may legitimately use the same id — both halves have to match.
  it("treats the same id under a different source as a different item", async () => {
    await captureItems({ userId, items: [reminder("From Reminders", "shared-id")] });

    const { results } = await captureItems({
      userId,
      items: [
        {
          depth: 0,
          name: "From Raycast",
          note: "",
          external: { source: "raycast", id: "shared-id" },
        },
      ],
    });

    expect(results[0].created).toBe(true);
    expect(await outlineOf(userId)).toEqual([
      INBOX_NAME,
      "  From Reminders",
      "  From Raycast",
    ]);
  });

  // A batch item can be deduped and still be somebody's parent; the depth bookkeeping has
  // to keep its slot rather than reparenting the child onto whatever came before.
  it("keeps a subtask under its parent when the parent was deduped", async () => {
    await captureItems({ userId, items: [reminder("Plan the trip", "r1")] });

    await captureItems({
      userId,
      items: [
        reminder("Plan the trip", "r1"),
        { depth: 1, name: "Book flights", note: "" },
      ],
    });

    expect(await outlineOf(userId)).toEqual([
      INBOX_NAME,
      "  Plan the trip",
      "    Book flights",
    ]);
  });

  it("still creates the node after the earlier one was deleted", async () => {
    const first = await captureItems({ userId, items: [reminder("Gone", "r1")] });
    await deleteNode(userId, first.nodeIds[0]);

    const second = await captureItems({ userId, items: [reminder("Gone", "r1")] });

    expect(second.results[0].created).toBe(true);
    expect(await outlineOf(userId)).toEqual([INBOX_NAME, "  Gone"]);
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
    const { nodeIds } = await captureItems({
      userId: other,
      items: parseCapture("Theirs"),
    });

    await deleteNode(userId, nodeIds[0]);

    expect(await outlineOf(other)).toEqual([INBOX_NAME, "  Theirs"]);
  });

  // The mistake this catches: dropping `user_id` from the external-ref lookup. With one
  // user in the test database that reads perfectly; with two, my drain starts silently
  // skipping items because someone else already imported a reminder with that id.
  it("lets two users hold the same externalId independently", async () => {
    const other = await makeUser();
    const ref = { source: "apple_reminders", id: "shared-id" };

    const mine = await captureItems({
      userId,
      items: [{ depth: 0, name: "Mine", note: "", external: ref }],
    });
    const theirs = await captureItems({
      userId: other,
      items: [{ depth: 0, name: "Theirs", note: "", external: ref }],
    });

    expect(mine.results[0].created).toBe(true);
    // Not skipped as a duplicate of mine, and not written into my tree.
    expect(theirs.results[0].created).toBe(true);
    expect(theirs.nodeIds[0]).not.toBe(mine.nodeIds[0]);
    expect((await nodeById(other, theirs.nodeIds[0])).userId).toBe(other);

    expect(await outlineOf(userId)).toEqual([INBOX_NAME, "  Mine"]);
    expect(await outlineOf(other)).toEqual([INBOX_NAME, "  Theirs"]);
  });

  it("does not let one user read or change another's imported node", async () => {
    const other = await makeUser();
    const { nodeIds } = await captureItems({
      userId: other,
      items: [
        {
          depth: 0,
          name: "Theirs",
          note: "",
          external: { source: "apple_reminders", id: "r1" },
        },
      ],
    });
    const theirNode = nodeIds[0];

    expect(await nodeById(userId, theirNode)).toBeUndefined();
    await renameNode(userId, theirNode, "Hijacked");
    await setState(userId, theirNode, "cancelled");
    await deleteNode(userId, theirNode);

    const node = await nodeById(other, theirNode);
    expect(node.name).toBe("Theirs");
    expect(node.state).toBe("not_started");
    expect(await outlineOf(other)).toEqual([INBOX_NAME, "  Theirs"]);
  });
});
