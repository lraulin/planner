import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/executor";
import { projectDetails, taskDetails, type NodeType } from "@/db/schema";
import { READER_TIME_ZONE } from "@/lib/schedule/readerZone";
import { parseNotificationPrefs } from "@/lib/settings/notifications";
import { readSetting } from "@/lib/settings/queries";
import { NOTIFICATIONS_SCOPE } from "@/lib/settings/scopes";
import { reminderAfterDeadlineChange } from "./derive";

/**
 * Achieve's "auto-set reminder for projects/tasks with deadlines", for a deadline write in
 * progress: the reminder the write should store, `null` to clear it, or `undefined` to leave
 * it. Both writers — `setDeadline` and the detail form — call this one function, and the rule
 * itself is `reminderAfterDeadlineChange`.
 *
 * Call it **before** writing the side table, while the stored reminder is still the old one.
 *
 * `draftReminder` is the reminder the same save is writing, when it writes one. The drawer
 * posts its whole draft, so its presence means nothing; a value that **differs** from the
 * stored one means the reminder was edited in this save, and a reminder edited by hand is
 * never overwritten — not even in the save that also moved the deadline.
 */
export async function autoReminderUpdate(
  tx: DbExecutor,
  userId: string,
  node: { id: string; type: NodeType; deadline: Date | null },
  nextDeadline: Date | null,
  draftReminder?: Date | null,
): Promise<Date | null | undefined> {
  if (node.type !== "task" && node.type !== "project") return undefined;
  const table = node.type === "task" ? taskDetails : projectDetails;

  const [[row], stored] = await Promise.all([
    tx
      .select({ reminderAt: table.reminderAt })
      .from(table)
      .where(eq(table.nodeId, node.id))
      .limit(1),
    readSetting(userId, NOTIFICATIONS_SCOPE, tx),
  ]);
  const reminderAt = row?.reminderAt ?? null;
  if (
    draftReminder !== undefined &&
    (draftReminder?.getTime() ?? null) !== (reminderAt?.getTime() ?? null)
  ) {
    return undefined;
  }

  return reminderAfterDeadlineChange(
    { previousDeadline: node.deadline, nextDeadline, reminderAt },
    parseNotificationPrefs(stored),
    READER_TIME_ZONE,
  );
}

/** Store a reminder on a task's or project's side table. */
export async function writeReminder(
  tx: DbExecutor,
  node: { id: string; type: "task" | "project" },
  next: Date | null,
): Promise<void> {
  const table = node.type === "task" ? taskDetails : projectDetails;
  await tx
    .insert(table)
    .values({ nodeId: node.id, reminderAt: next })
    .onConflictDoUpdate({ target: table.nodeId, set: { reminderAt: next } });
}
