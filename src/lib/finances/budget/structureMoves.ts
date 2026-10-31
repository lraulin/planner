import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetCategories, financeCategoryGroups } from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";
import * as sortKey from "@/lib/tree/sortKey";
import {
  budgetSiblings,
  resolveBudgetDrop,
  type BudgetDropZone,
  type BudgetStructureRef,
} from "./hierarchy";
import { lastBudgetChildSortKey, requireCategory, requireGroup } from "./structureRows";

/**
 * Reordering and reparenting the budget's groups and envelopes. Every write takes `userId`
 * first and proves both ends of the move are the caller's
 * (`agent-os/standards/development/security.md`).
 */

async function budgetStructure(userId: string) {
  const [groups, categories] = await Promise.all([
    db
      .select({
        id: financeCategoryGroups.id,
        parentGroupId: financeCategoryGroups.parentGroupId,
        name: financeCategoryGroups.name,
        kind: financeCategoryGroups.kind,
        sortKey: financeCategoryGroups.sortKey,
        hidden: financeCategoryGroups.hidden,
      })
      .from(financeCategoryGroups)
      .where(eq(financeCategoryGroups.userId, userId)),
    db
      .select({
        id: financeBudgetCategories.id,
        groupId: financeBudgetCategories.groupId,
        name: financeBudgetCategories.name,
        sortKey: financeBudgetCategories.sortKey,
        kind: financeBudgetCategories.kind,
      })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId)),
  ]);
  return { groups, categories };
}

/** Move or reparent one group/envelope from a target row and drop zone. */
export async function moveBudgetStructureItem(
  userId: string,
  moving: BudgetStructureRef,
  target: BudgetStructureRef,
  zone: BudgetDropZone,
): Promise<void> {
  if (moving.kind === "group") await requireGroup(userId, moving.id);
  else await requireCategory(userId, moving.id);
  if (target.kind === "group") await requireGroup(userId, target.id);
  else await requireCategory(userId, target.id);

  const structure = await budgetStructure(userId);
  const placement = resolveBudgetDrop(
    structure.groups,
    structure.categories,
    moving,
    target,
    zone,
  );
  if (!placement) throw new Error("That item cannot move there.");

  // resolveBudgetDrop placed it, so it is in the structure.
  const movingKind =
    moving.kind === "group"
      ? structure.groups.find((group) => group.id === moving.id)?.kind
      : structure.categories.find((category) => category.id === moving.id)?.kind;
  if (!movingKind)
    throw new Error(`placed budget item ${moving.id} is not in the structure`);
  const siblings = budgetSiblings(
    structure.groups,
    structure.categories,
    placement.parentGroupId,
    movingKind,
  );
  const keyOf = (ref: BudgetStructureRef | null) =>
    ref === null
      ? null
      : (siblings.find((item) => item.kind === ref.kind && item.id === ref.id)
          ?.sortKey ?? null);
  const nextSortKey = sortKey.between(keyOf(placement.previous), keyOf(placement.next));
  const updatedAt = new Date();

  if (moving.kind === "group") {
    await db
      .update(financeCategoryGroups)
      .set({
        parentGroupId: placement.parentGroupId,
        sortKey: nextSortKey,
        updatedAt,
      })
      .where(ownedRow(financeCategoryGroups, moving.id, userId));
    return;
  }

  await db
    .update(financeBudgetCategories)
    .set({
      groupId: placement.parentGroupId,
      sortKey: nextSortKey,
      updatedAt,
    })
    .where(ownedRow(financeBudgetCategories, moving.id, userId));
}

/** Move an item to the end of a group, or move a group back to the root. */
export async function moveBudgetStructureItemIntoGroup(
  userId: string,
  moving: BudgetStructureRef,
  parentGroupId: string | null,
): Promise<void> {
  if (parentGroupId !== null) {
    await moveBudgetStructureItem(
      userId,
      moving,
      { kind: "group", id: parentGroupId },
      "inside",
    );
    return;
  }
  const nextSortKey = await lastBudgetChildSortKey(userId, null);
  const sortKeyValue =
    nextSortKey === null ? sortKey.first() : sortKey.after(nextSortKey);
  if (moving.kind === "category") {
    await requireCategory(userId, moving.id);
    await db
      .update(financeBudgetCategories)
      .set({
        groupId: null,
        sortKey: sortKeyValue,
        updatedAt: new Date(),
      })
      .where(ownedRow(financeBudgetCategories, moving.id, userId));
    return;
  }
  await requireGroup(userId, moving.id);
  await db
    .update(financeCategoryGroups)
    .set({
      parentGroupId: null,
      sortKey: sortKeyValue,
      updatedAt: new Date(),
    })
    .where(ownedRow(financeCategoryGroups, moving.id, userId));
}
