import { db } from "@/db";
import {
  appointments,
  nodeItems,
  nodes,
  notes as noteRows,
  projectDetails,
  taskCompletions,
  taskDetails,
} from "@/db/schema";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import {
  clearConflictingDescendantPlans,
  clearOpenDayLinesForNode,
  syncDayLinesInSubtree,
} from "@/lib/day/sync";
import { createAppointment } from "@/lib/schedule/mutations";
import { fromDateKey, localDateKey } from "@/lib/schedule/geometry";
import { applyStateTransition } from "@/lib/tree/mutations";
import { between } from "@/lib/tree/sortKey";
import { organizerOutcomeError, type OrganizerOutcome } from "./types";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type InboxItem = {
  id: string;
  parentId: string | null;
  name: string;
  notes: string;
  contexts: string[];
  hasChildren: boolean;
};

async function requireInboxItem(
  tx: Db | Tx,
  userId: string,
  itemId: string,
): Promise<InboxItem> {
  const [item] = await tx
    .select({
      id: nodes.id,
      parentId: nodes.parentId,
      name: nodes.name,
      notes: nodes.notes,
      contexts: taskDetails.contexts,
    })
    .from(nodes)
    .innerJoin(taskDetails, eq(taskDetails.nodeId, nodes.id))
    .where(and(eq(nodes.id, itemId), eq(nodes.userId, userId), eq(nodes.type, "task")))
    .limit(1);
  if (!item || !item.parentId) throw new Error("Inbox item not found.");

  const [inbox] = await tx
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(
        eq(nodes.id, item.parentId),
        eq(nodes.userId, userId),
        eq(nodes.isInbox, true),
      ),
    )
    .limit(1);
  if (!inbox) throw new Error("This item is no longer in Inbox.");

  const [{ value: childCount }] = await tx
    .select({ value: count() })
    .from(nodes)
    .where(and(eq(nodes.userId, userId), eq(nodes.parentId, itemId)));

  return { ...item, hasChildren: childCount > 0 };
}

async function isSelfOrDescendant(
  tx: Db | Tx,
  userId: string,
  itemId: string,
  candidateId: string,
): Promise<boolean> {
  let currentId: string | null = candidateId;
  while (currentId) {
    if (currentId === itemId) return true;
    const [current] = await tx
      .select({ parentId: nodes.parentId })
      .from(nodes)
      .where(and(eq(nodes.id, currentId), eq(nodes.userId, userId)))
      .limit(1);
    if (!current) return false;
    currentId = current.parentId;
  }
  return false;
}

async function requireDestinationProject(
  tx: Db | Tx,
  userId: string,
  projectId: string | null,
  sourceId: string,
): Promise<void> {
  if (!projectId) return;
  const [project] = await tx
    .select({ id: nodes.id, isInbox: nodes.isInbox })
    .from(nodes)
    .where(
      and(eq(nodes.id, projectId), eq(nodes.userId, userId), eq(nodes.type, "project")),
    )
    .limit(1);
  if (!project || project.isInbox) throw new Error("Project not found.");
  if (await isSelfOrDescendant(tx, userId, sourceId, projectId)) {
    throw new Error("A branch cannot be filed inside itself.");
  }
}

async function endNodeSortKey(
  tx: Tx,
  userId: string,
  parentId: string | null,
): Promise<string> {
  const whereParent =
    parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, parentId);
  const [last] = await tx
    .select({ sortKey: nodes.sortKey })
    .from(nodes)
    .where(and(eq(nodes.userId, userId), whereParent))
    .orderBy(desc(nodes.sortKey))
    .limit(1);
  return between(last?.sortKey ?? null, null);
}

async function endNoteSortKey(tx: Tx, userId: string): Promise<string> {
  const [last] = await tx
    .select({ sortKey: noteRows.sortKey })
    .from(noteRows)
    .where(and(eq(noteRows.userId, userId), isNull(noteRows.parentId)))
    .orderBy(desc(noteRows.sortKey))
    .limit(1);
  return between(last?.sortKey ?? null, null);
}

function calendarDay(value: string | null): Date | null {
  return value ? fromDateKey(value) : null;
}

async function organizeAsTask(
  tx: Tx,
  userId: string,
  item: InboxItem,
  outcome: Extract<OrganizerOutcome, { kind: "task" }>,
): Promise<void> {
  await requireDestinationProject(tx, userId, outcome.destinationProjectId, item.id);

  let parentId = outcome.destinationProjectId;
  if (outcome.newProject) {
    const [project] = await tx
      .insert(nodes)
      .values({
        userId,
        parentId,
        type: "project",
        state: "not_started",
        name: outcome.newProject.name.trim(),
        priorityLetter: outcome.newProject.priorityLetter,
        priorityRank: outcome.newProject.priorityLetter
          ? outcome.newProject.priorityRank
          : null,
        sortKey: await endNodeSortKey(tx, userId, parentId),
      })
      .returning({ id: nodes.id });
    await tx.insert(projectDetails).values({ nodeId: project.id });
    parentId = project.id;
  }

  await tx
    .update(nodes)
    .set({
      parentId,
      sortKey: await endNodeSortKey(tx, userId, parentId),
      name: outcome.name,
      priorityLetter: outcome.priorityLetter,
      priorityRank: outcome.priorityLetter ? outcome.priorityRank : null,
      deadline: calendarDay(outcome.deadline),
      notes: outcome.notes,
      state: "not_started",
      deferredDate: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(nodes.id, item.id), eq(nodes.userId, userId)));
  await tx
    .update(taskDetails)
    .set({
      effortMinutes: outcome.effortMinutes,
      effortLeftMinutes: outcome.effortMinutes,
      contexts: outcome.contexts,
    })
    .where(eq(taskDetails.nodeId, item.id));

  if (outcome.completed) {
    await applyStateTransition(tx, userId, item.id, "completed");
  }
  await syncDayLinesInSubtree(tx, userId, item.id);
}

async function organizeAsProject(
  tx: Tx,
  userId: string,
  item: InboxItem,
  outcome: Extract<OrganizerOutcome, { kind: "project" }>,
): Promise<void> {
  await requireDestinationProject(tx, userId, outcome.parentProjectId, item.id);

  await clearOpenDayLinesForNode(tx, userId, item.id);
  await tx.delete(taskDetails).where(eq(taskDetails.nodeId, item.id));
  await tx
    .delete(taskCompletions)
    .where(
      and(eq(taskCompletions.userId, userId), eq(taskCompletions.nodeId, item.id)),
    );
  await tx
    .delete(nodeItems)
    .where(and(eq(nodeItems.userId, userId), eq(nodeItems.nodeId, item.id)));

  await tx
    .update(nodes)
    .set({
      type: "project",
      parentId: outcome.parentProjectId,
      sortKey: await endNodeSortKey(tx, userId, outcome.parentProjectId),
      name: outcome.name,
      priorityLetter: outcome.priorityLetter,
      priorityRank: outcome.priorityLetter ? outcome.priorityRank : null,
      deadline: calendarDay(outcome.deadline),
      notes: outcome.notes,
      state: "not_started",
      deferredDate: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(nodes.id, item.id), eq(nodes.userId, userId)));
  await tx.insert(projectDetails).values({
    nodeId: item.id,
    contexts: outcome.contexts,
  });
  await syncDayLinesInSubtree(tx, userId, item.id);
}

async function organizeAsDeferred(
  tx: Tx,
  userId: string,
  item: InboxItem,
  outcome: Extract<OrganizerOutcome, { kind: "defer" }>,
): Promise<void> {
  const deferredDate = fromDateKey(outcome.deferredUntil);
  await tx
    .update(nodes)
    .set({
      deferredDate,
      deadline: calendarDay(outcome.deadline),
      state: "postponed",
      completedAt: null,
      targetStartDate: null,
      targetEndDate: null,
      updatedAt: new Date(),
    })
    .where(and(eq(nodes.id, item.id), eq(nodes.userId, userId)));

  if (outcome.followUpName.trim()) {
    const [followUp] = await tx
      .insert(nodes)
      .values({
        userId,
        parentId: item.id,
        type: "task",
        state: "not_started",
        name: outcome.followUpName.trim(),
        sortKey: await endNodeSortKey(tx, userId, item.id),
      })
      .returning({ id: nodes.id });
    await tx.insert(taskDetails).values({ nodeId: followUp.id });
  }

  await clearConflictingDescendantPlans(tx, userId, item.id);
  await syncDayLinesInSubtree(tx, userId, item.id);
}

async function organizeAsReferenceNote(
  tx: Tx,
  userId: string,
  item: InboxItem,
  outcome: Extract<OrganizerOutcome, { kind: "reference_note" }>,
  today: string,
): Promise<void> {
  await tx.insert(noteRows).values({
    userId,
    parentId: null,
    sortKey: await endNoteSortKey(tx, userId),
    title: outcome.title,
    subject: "General",
    body: outcome.body,
    noteDate: fromDateKey(today),
    contexts: item.contexts,
  });
  await tx.delete(nodes).where(and(eq(nodes.id, item.id), eq(nodes.userId, userId)));
}

async function organizeAsCalendar(
  userId: string,
  itemId: string,
  outcome: Extract<OrganizerOutcome, { kind: "calendar" }>,
  today: string,
): Promise<void> {
  const item = await requireInboxItem(db, userId, itemId);
  const validation = organizerOutcomeError(outcome, {
    today,
    hasChildren: item.hasChildren,
  });
  if (validation) throw new Error(validation);
  await requireDestinationProject(db, userId, outcome.projectId, itemId);

  const [existing] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.userId, userId),
        eq(appointments.organizerSourceNodeId, itemId),
      ),
    )
    .limit(1);

  if (!existing) {
    const created = await createAppointment(userId, {
      subject: outcome.subject,
      location: outcome.location,
      startAt: new Date(outcome.startAt),
      endAt: new Date(outcome.endAt),
      allDay: outcome.allDay,
      priorityLetter: outcome.priorityLetter,
      priorityRank: outcome.priorityRank,
      projectId: outcome.projectId,
      notes: outcome.notes,
      contexts: outcome.contexts,
      recurrenceFrequency: "none",
      organizerSourceNodeId: itemId,
    });
    if (!created) throw new Error("Calendar event could not be stored.");
  }

  await db.transaction(async (tx) => {
    const latest = await requireInboxItem(tx, userId, itemId);
    if (latest.hasChildren) {
      throw new Error(
        "Calendar event was created, but the Inbox branch now has subtasks.",
      );
    }
    await tx.delete(nodes).where(and(eq(nodes.id, itemId), eq(nodes.userId, userId)));
  });
}

/** Classify one currently-processable direct Inbox item. */
export async function organizeInboxItem(
  userId: string,
  itemId: string,
  outcome: OrganizerOutcome,
  today: string = localDateKey(new Date()),
): Promise<void> {
  if (outcome.kind === "calendar") {
    await organizeAsCalendar(userId, itemId, outcome, today);
    return;
  }

  await db.transaction(async (tx) => {
    const item = await requireInboxItem(tx, userId, itemId);
    const validation = organizerOutcomeError(outcome, {
      today,
      hasChildren: item.hasChildren,
    });
    if (validation) throw new Error(validation);

    switch (outcome.kind) {
      case "task":
        await organizeAsTask(tx, userId, item, outcome);
        break;
      case "project":
        await organizeAsProject(tx, userId, item, outcome);
        break;
      case "defer":
        await organizeAsDeferred(tx, userId, item, outcome);
        break;
      case "delete":
        await tx
          .delete(nodes)
          .where(and(eq(nodes.id, item.id), eq(nodes.userId, userId)));
        break;
      case "reference_note":
        await organizeAsReferenceNote(tx, userId, item, outcome, today);
        break;
    }
  });
}
