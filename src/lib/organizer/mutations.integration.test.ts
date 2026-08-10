import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  appointments,
  nodes,
  notes,
  projectDetails,
  taskDetails,
  users,
} from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { captureItems } from "@/lib/capture/mutations";
import { parseCapture } from "@/lib/capture/parse";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { loadOutline } from "@/lib/tree/queries";
import { toDateKey } from "@/lib/schedule/geometry";
import { organizerQueue } from "./queue";
import { organizeInboxItem } from "./mutations";
import type { OrganizerOutcome } from "./types";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("organizer mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `organizer-${crypto.randomUUID()}@localhost`,
      name: "Organizer User",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function capture(userId: string, text: string): Promise<string> {
  const result = await captureItems({ userId, items: parseCapture(text) });
  return result.nodeIds[0];
}

function taskOutcome(
  patch: Partial<Extract<OrganizerOutcome, { kind: "task" }>> = {},
): Extract<OrganizerOutcome, { kind: "task" }> {
  return {
    kind: "task",
    name: "Filed task",
    priorityLetter: "B",
    priorityRank: 2,
    effortMinutes: 45,
    destinationProjectId: null,
    deadline: "2026-08-20",
    contexts: ["@Home"],
    notes: "Filed deliberately",
    completed: false,
    newProject: null,
    ...patch,
  };
}

function calendarOutcome(): Extract<OrganizerOutcome, { kind: "calendar" }> {
  return {
    kind: "calendar",
    subject: "Review the proposal",
    location: "Desk",
    startAt: "2026-08-12T13:00:00.000Z",
    endAt: "2026-08-12T14:00:00.000Z",
    allDay: false,
    priorityLetter: "A",
    priorityRank: 1,
    projectId: null,
    contexts: ["@Computer"],
    notes: "Bring the draft",
  };
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("organizeInboxItem", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("files a task under a newly-created project and applies focused fields", async () => {
    const itemId = await capture(userId, "Captured idea");
    await organizeInboxItem(
      userId,
      itemId,
      taskOutcome({
        newProject: { name: "New outcome", priorityLetter: "A", priorityRank: 3 },
      }),
      "2026-08-09",
    );

    const outline = await loadOutline(userId);
    const item = outline.find((node) => node.id === itemId)!;
    const project = outline.find((node) => node.id === item.parentId)!;
    expect(project).toMatchObject({
      type: "project",
      name: "New outcome",
      priorityLetter: "A",
      priorityRank: 3,
    });
    expect(item).toMatchObject({
      name: "Filed task",
      priorityLetter: "B",
      priorityRank: 2,
      effortMinutes: 45,
      contexts: ["@Home"],
      notes: "Filed deliberately",
    });
    expect(toDateKey(item.deadline!)).toBe("2026-08-20");
    expect(organizerQueue(outline, "2026-08-09")).toEqual([]);
  });

  it("converts the root to a project without losing its subtask branch", async () => {
    const itemId = await capture(userId, "Launch site\n  Draft copy");
    const child = (await loadOutline(userId)).find((node) => node.parentId === itemId)!;

    await organizeInboxItem(
      userId,
      itemId,
      {
        kind: "project",
        name: "Website launch",
        priorityLetter: "A",
        priorityRank: 1,
        parentProjectId: null,
        deadline: null,
        contexts: ["@Computer"],
        notes: "Outcome",
      },
      "2026-08-09",
    );

    const [project] = await db
      .select({
        type: nodes.type,
        parentId: nodes.parentId,
        contexts: projectDetails.contexts,
      })
      .from(nodes)
      .innerJoin(projectDetails, eq(projectDetails.nodeId, nodes.id))
      .where(and(eq(nodes.id, itemId), eq(nodes.userId, userId)));
    expect(project).toEqual({
      type: "project",
      parentId: null,
      contexts: ["@Computer"],
    });
    expect(
      (await loadOutline(userId)).find((node) => node.id === child.id)?.parentId,
    ).toBe(itemId);
  });

  it("defers the branch and creates an optional follow-up subtask", async () => {
    const itemId = await capture(userId, "Wait for renewal");
    await organizeInboxItem(
      userId,
      itemId,
      {
        kind: "defer",
        deferredUntil: "2026-08-15",
        deadline: "2026-08-20",
        followUpName: "Check the mailbox",
      },
      "2026-08-09",
    );

    const outline = await loadOutline(userId);
    const item = outline.find((node) => node.id === itemId)!;
    expect(item.state).toBe("postponed");
    expect(toDateKey(item.deferredDate!)).toBe("2026-08-15");
    expect(outline.find((node) => node.parentId === itemId)?.name).toBe(
      "Check the mailbox",
    );
    expect(organizerQueue(outline, "2026-08-14")).toEqual([]);
    expect(organizerQueue(outline, "2026-08-15").map((node) => node.id)).toEqual([
      itemId,
    ]);
  });

  it("deletes a selected branch", async () => {
    const itemId = await capture(userId, "Discard me\n  And my child");
    await organizeInboxItem(userId, itemId, { kind: "delete" }, "2026-08-09");
    expect((await loadOutline(userId)).filter((node) => node.id === itemId)).toEqual(
      [],
    );
  });

  it("atomically replaces a leaf with a standalone reference note", async () => {
    const itemId = await capture(userId, "Reference this");
    await db
      .update(taskDetails)
      .set({ contexts: ["Research"] })
      .where(eq(taskDetails.nodeId, itemId));

    await organizeInboxItem(
      userId,
      itemId,
      { kind: "reference_note", title: "Useful link", body: "Keep this" },
      "2026-08-09",
    );

    const [note] = await db.select().from(notes).where(eq(notes.userId, userId));
    expect(note).toMatchObject({
      title: "Useful link",
      body: "Keep this",
      contexts: ["Research"],
      nodeId: null,
    });
    expect((await loadOutline(userId)).some((node) => node.id === itemId)).toBe(false);
  });

  it("creates a Calendar event before removing the Inbox leaf", async () => {
    const itemId = await capture(userId, "Put on calendar");
    await organizeInboxItem(userId, itemId, calendarOutcome(), "2026-08-09");

    const [appointment] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          eq(appointments.organizerSourceNodeId, itemId),
        ),
      );
    expect(appointment).toMatchObject({
      subject: "Review the proposal",
      location: "Desk",
      recurrenceFrequency: "none",
      contexts: ["@Computer"],
    });
    expect((await loadOutline(userId)).some((node) => node.id === itemId)).toBe(false);
  });

  it("reuses an existing Calendar receipt on a retry instead of duplicating it", async () => {
    const itemId = await capture(userId, "Retry calendar");
    await db.insert(appointments).values({
      userId,
      subject: "Already created",
      startAt: new Date("2026-08-12T13:00:00.000Z"),
      endAt: new Date("2026-08-12T14:00:00.000Z"),
      organizerSourceNodeId: itemId,
    });

    await organizeInboxItem(userId, itemId, calendarOutcome(), "2026-08-09");
    const [{ value }] = await db
      .select({ value: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          eq(appointments.organizerSourceNodeId, itemId),
        ),
      );
    expect(value).toBe(1);
    expect((await loadOutline(userId)).some((node) => node.id === itemId)).toBe(false);
  });

  it("blocks lossy outcomes while the root has subtasks", async () => {
    const itemId = await capture(userId, "Parent\n  Child");
    await expect(
      organizeInboxItem(userId, itemId, calendarOutcome(), "2026-08-09"),
    ).rejects.toThrow("subtasks");
    await expect(
      organizeInboxItem(
        userId,
        itemId,
        { kind: "reference_note", title: "No", body: "No" },
        "2026-08-09",
      ),
    ).rejects.toThrow("subtasks");
    expect((await loadOutline(userId)).some((node) => node.id === itemId)).toBe(true);
  });

  it("does not let a second user read, change, calendar, or delete the owner's item", async () => {
    const ownerItem = await capture(userId, "Owner only");
    const otherId = await makeUser();
    expect((await loadOutline(otherId)).some((node) => node.id === ownerItem)).toBe(
      false,
    );

    await expect(
      organizeInboxItem(otherId, ownerItem, taskOutcome(), "2026-08-09"),
    ).rejects.toThrow("not found");
    await expect(
      organizeInboxItem(otherId, ownerItem, calendarOutcome(), "2026-08-09"),
    ).rejects.toThrow("not found");
    await expect(
      organizeInboxItem(otherId, ownerItem, { kind: "delete" }, "2026-08-09"),
    ).rejects.toThrow("not found");

    expect((await loadOutline(userId)).some((node) => node.id === ownerItem)).toBe(
      true,
    );
  });
});
