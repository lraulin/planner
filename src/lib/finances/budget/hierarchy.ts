import type { GridRow } from "@/lib/tree/slice";
import { compare as compareSortKeys } from "@/lib/tree/sortKey";

import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";
import type { BudgetRow } from "./rows";

export type BudgetStructureRef =
  { kind: "group"; id: string } | { kind: "category"; id: string };

export type BudgetDropZone = "before" | "inside" | "after";

export type BudgetPlacement = {
  parentGroupId: string | null;
  previous: BudgetStructureRef | null;
  next: BudgetStructureRef | null;
  depth: number;
};

type StructureItem = BudgetStructureRef & {
  parentGroupId: string | null;
  sortKey: string;
};

function compareItems(left: StructureItem, right: StructureItem): number {
  const byKey = compareSortKeys(left.sortKey, right.sortKey);
  if (byKey !== 0) return byKey;
  const byKind = left.kind.localeCompare(right.kind);
  return byKind !== 0 ? byKind : left.id.localeCompare(right.id);
}

export function budgetChildren(
  groups: readonly BudgetGroupRow[],
  categories: readonly Pick<BudgetCategoryRow, "id" | "groupId" | "sortKey">[],
  parentGroupId: string | null,
): StructureItem[] {
  return [
    ...groups
      .filter((group) => group.parentGroupId === parentGroupId)
      .map((group) => ({
        kind: "group" as const,
        id: group.id,
        parentGroupId: group.parentGroupId,
        sortKey: group.sortKey,
      })),
    ...(parentGroupId === null
      ? []
      : categories
          .filter((category) => category.groupId === parentGroupId)
          .map((category) => ({
            kind: "category" as const,
            id: category.id,
            parentGroupId: category.groupId,
            sortKey: category.sortKey,
          }))),
  ].sort(compareItems);
}

/** Every descendant group id, excluding the root itself. Cycles are invalid stored data. */
export function descendantGroupIds(
  groups: readonly Pick<BudgetGroupRow, "id" | "parentGroupId">[],
  rootId: string,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.parentGroupId) continue;
    const siblings = children.get(group.parentGroupId) ?? [];
    siblings.push(group.id);
    children.set(group.parentGroupId, siblings);
  }

  const found = new Set<string>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === rootId) throw new Error("Budget groups contain a cycle.");
    if (found.has(id)) continue;
    found.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return found;
}

/** Envelope ids beneath a group at any depth, including hidden descendants. */
export function descendantEnvelopeIds(
  groups: readonly Pick<BudgetGroupRow, "id" | "parentGroupId">[],
  categories: readonly Pick<BudgetCategoryRow, "id" | "groupId">[],
  rootId: string,
): Set<string> {
  const groupIds = descendantGroupIds(groups, rootId);
  groupIds.add(rootId);
  return new Set(
    categories
      .filter((category) => groupIds.has(category.groupId))
      .map((category) => category.id),
  );
}

export function budgetGroupDepths(
  groups: readonly Pick<BudgetGroupRow, "id" | "parentGroupId">[],
): Map<string, number> {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const depths = new Map<string, number>();

  function depthOf(id: string, visiting: Set<string>): number {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new Error("Budget groups contain a cycle.");
    const group = byId.get(id);
    if (!group) throw new Error("Budget group not found.");
    visiting.add(id);
    const depth = group.parentGroupId ? depthOf(group.parentGroupId, visiting) + 1 : 0;
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  }

  for (const group of groups) depthOf(group.id, new Set());
  return depths;
}

/**
 * Recursive Budget rows for DataGrid. A group count is every visible descendant envelope,
 * not merely its direct children, so the collapsed header describes the same rows it hides.
 */
export function nestedBudgetGridRows(
  groups: readonly BudgetGroupRow[],
  categories: readonly Pick<
    BudgetCategoryRow,
    "id" | "groupId" | "sortKey" | "hidden"
  >[],
  rows: readonly BudgetRow[],
  options: { showHidden: boolean } = { showHidden: false },
): GridRow<BudgetRow>[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const visibleGroups = options.showHidden
    ? groups
    : groups.filter((group) => !group.hidden);
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));
  const visibleCategories = categories.filter(
    (category) =>
      visibleGroupIds.has(category.groupId) && (options.showHidden || !category.hidden),
  );
  const depths = budgetGroupDepths(groups);
  const result: GridRow<BudgetRow>[] = [];
  const emitted = new Set<string>();

  function emitGroup(groupId: string): number {
    if (emitted.has(groupId)) throw new Error("Budget groups contain a cycle.");
    const group = groupById.get(groupId);
    if (!group || !visibleGroupIds.has(groupId)) return 0;
    emitted.add(groupId);

    const headerIndex = result.length;
    result.push({
      kind: "group",
      id: group.id,
      label: group.name,
      count: 0,
      depth: depths.get(group.id) ?? 0,
      collapsed: false,
    });

    let count = 0;
    for (const child of budgetChildren(visibleGroups, visibleCategories, group.id)) {
      if (child.kind === "group") {
        count += emitGroup(child.id);
        continue;
      }
      const row = rowById.get(child.id);
      if (!row) continue;
      result.push({
        kind: "node",
        id: row.id,
        node: row,
        depth: (depths.get(group.id) ?? 0) + 1,
      });
      count += 1;
    }

    if (count === 0) {
      result.splice(headerIndex, 1);
      emitted.delete(groupId);
      return 0;
    }
    const header = result[headerIndex];
    if (header?.kind === "group") header.count = count;
    return count;
  }

  for (const root of budgetChildren(visibleGroups, visibleCategories, null)) {
    if (root.kind === "group") emitGroup(root.id);
  }
  return result;
}

/** Resolve a desktop drop without trusting the client to name a parent or sort key. */
export function resolveBudgetDrop(
  groups: readonly BudgetGroupRow[],
  categories: readonly Pick<BudgetCategoryRow, "id" | "groupId" | "sortKey">[],
  moving: BudgetStructureRef,
  target: BudgetStructureRef,
  zone: BudgetDropZone,
): BudgetPlacement | null {
  if (moving.kind === target.kind && moving.id === target.id) return null;
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const movingGroup = moving.kind === "group" ? groupById.get(moving.id) : undefined;
  const movingCategory =
    moving.kind === "category" ? categoryById.get(moving.id) : undefined;
  const targetGroup = target.kind === "group" ? groupById.get(target.id) : undefined;
  const targetCategory =
    target.kind === "category" ? categoryById.get(target.id) : undefined;
  if ((!movingGroup && !movingCategory) || (!targetGroup && !targetCategory))
    return null;
  if (zone === "inside" && !targetGroup) return null;

  const parentGroupId =
    zone === "inside"
      ? targetGroup!.id
      : (targetGroup?.parentGroupId ?? targetCategory?.groupId ?? null);
  if (moving.kind === "category" && parentGroupId === null) return null;

  const sourceIncome =
    movingGroup?.isIncome ?? groupById.get(movingCategory!.groupId)?.isIncome;
  const destinationIncome = parentGroupId
    ? groupById.get(parentGroupId)?.isIncome
    : targetGroup?.isIncome;
  if (sourceIncome === undefined || destinationIncome === undefined) return null;
  if (sourceIncome !== destinationIncome) return null;

  if (movingGroup && parentGroupId) {
    const descendants = descendantGroupIds(groups, movingGroup.id);
    if (parentGroupId === movingGroup.id || descendants.has(parentGroupId)) return null;
  }

  const siblings = budgetChildren(groups, categories, parentGroupId).filter(
    (item) => item.kind !== moving.kind || item.id !== moving.id,
  );
  if (zone === "inside") {
    const previous = siblings.at(-1) ?? null;
    return {
      parentGroupId,
      previous,
      next: null,
      depth: (budgetGroupDepths(groups).get(targetGroup!.id) ?? 0) + 1,
    };
  }

  const targetIndex = siblings.findIndex(
    (item) => item.kind === target.kind && item.id === target.id,
  );
  if (targetIndex < 0) return null;
  const insertionIndex = zone === "before" ? targetIndex : targetIndex + 1;
  return {
    parentGroupId,
    previous: siblings[insertionIndex - 1] ?? null,
    next: siblings[insertionIndex] ?? null,
    depth: parentGroupId ? (budgetGroupDepths(groups).get(parentGroupId) ?? 0) + 1 : 0,
  };
}
