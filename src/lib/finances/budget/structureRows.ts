import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetCategories, financeCategoryGroups } from "@/db/schema";
import * as sortKey from "@/lib/tree/sortKey";

/**
 * The rows every budget write starts from: an envelope or group proven to be the caller's,
 * and the sort key that puts a new child last under its parent.
 *
 * Each `require*` scopes on `userId` and throws when nothing matches — an update whose
 * `where` matches nothing is indistinguishable from a successful no-op unless you check
 * (`agent-os/standards/development/security.md`).
 */

export async function requireCategory(userId: string, categoryId: string) {
  const [row] = await db
    .select({
      id: financeBudgetCategories.id,
      groupId: financeBudgetCategories.groupId,
      kind: financeBudgetCategories.kind,
    })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.id, categoryId),
        eq(financeBudgetCategories.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That envelope does not exist.");
  return row;
}

export async function requireGroup(userId: string, groupId: string) {
  const [row] = await db
    .select({
      id: financeCategoryGroups.id,
      parentGroupId: financeCategoryGroups.parentGroupId,
      name: financeCategoryGroups.name,
      kind: financeCategoryGroups.kind,
    })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.id, groupId),
        eq(financeCategoryGroups.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That group does not exist.");
  return row;
}

export async function lastBudgetChildSortKey(
  userId: string,
  parentGroupId: string | null,
): Promise<string | null> {
  const [childGroups, envelopes] = await Promise.all([
    db
      .select({ sortKey: financeCategoryGroups.sortKey })
      .from(financeCategoryGroups)
      .where(
        and(
          eq(financeCategoryGroups.userId, userId),
          parentGroupId === null
            ? isNull(financeCategoryGroups.parentGroupId)
            : eq(financeCategoryGroups.parentGroupId, parentGroupId),
        ),
      ),
    db
      .select({ sortKey: financeBudgetCategories.sortKey })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          parentGroupId === null
            ? isNull(financeBudgetCategories.groupId)
            : eq(financeBudgetCategories.groupId, parentGroupId),
        ),
      ),
  ]);
  return (
    [...childGroups, ...envelopes]
      .map((row) => row.sortKey)
      .sort((left, right) => sortKey.compare(right, left))[0] ?? null
  );
}
