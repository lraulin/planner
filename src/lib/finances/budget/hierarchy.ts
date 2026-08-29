import type { GridRow } from "@/lib/tree/slice";

import type { EnvelopeKind } from "@/db/schema";

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
  name: string;
  sortKey: string;
};

/**
 * Case-insensitive, numeric-aware English name order.
 *
 * Groups and envelopes share one sibling sequence, so this is what the Budget tables and
 * the category picker both walk. `sortKey` is still written on create/move; display ignores
 * it so a newly named envelope cannot land at the bottom of an otherwise alphabetical list.
 */
export function compareBudgetNames(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base", numeric: true });
}

function compareItems(left: StructureItem, right: StructureItem): number {
  const byName = compareBudgetNames(left.name, right.name);
  if (byName !== 0) return byName;
  const byKind = left.kind.localeCompare(right.kind);
  return byKind !== 0 ? byKind : left.id.localeCompare(right.id);
}

export function budgetChildren(
  groups: readonly Pick<BudgetGroupRow, "id" | "parentGroupId" | "name" | "sortKey">[],
  categories: readonly Pick<BudgetCategoryRow, "id" | "groupId" | "name" | "sortKey">[],
  parentGroupId: string | null,
): StructureItem[] {
  return [
    ...groups
      .filter((group) => group.parentGroupId === parentGroupId)
      .map((group) => ({
        kind: "group" as const,
        id: group.id,
        parentGroupId: group.parentGroupId,
        name: group.name,
        sortKey: group.sortKey,
      })),
    ...categories
      .filter((category) => category.groupId === parentGroupId)
      .map((category) => ({
        kind: "category" as const,
        id: category.id,
        parentGroupId: category.groupId,
        name: category.name,
        sortKey: category.sortKey,
      })),
  ].sort(compareItems);
}

/**
 * The ordered run one item actually sits in — its siblings *within its own section*.
 *
 * Inside a group this is just `budgetChildren`: a group holds one kind, so its children
 * already agree. **At the section root it is not.** The four tables are four independent
 * orderings sharing one `parent_group_id IS NULL`, so an unfiltered sibling list interleaves
 * a bill with a savings envelope, and "move up" then aims at a row in another table — which
 * `resolveBudgetDrop` refuses, so the move silently does nothing.
 *
 * Root-level envelopes were rare while every one lived in a seeded section group; they are
 * the normal case since `agent-os/specs/2026-08-28-1613-group-kind/`.
 */
export function budgetSiblings(
  groups: readonly BudgetGroupRow[],
  categories: readonly Pick<
    BudgetCategoryRow,
    "id" | "groupId" | "name" | "sortKey" | "kind"
  >[],
  parentGroupId: string | null,
  kind: EnvelopeKind,
): StructureItem[] {
  return budgetChildren(
    groups.filter((group) => group.kind === kind),
    categories.filter((category) => category.kind === kind),
    parentGroupId,
  );
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
      .filter((category) => category.groupId !== null && groupIds.has(category.groupId))
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

/** Complete visible label for an envelope when nested groups make its name ambiguous. */
export function budgetEnvelopeLabel(
  groups: readonly Pick<BudgetGroupRow, "id" | "name" | "parentGroupId">[],
  category: Pick<BudgetCategoryRow, "name" | "groupId">,
): string {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const names: string[] = [category.name];
  const seen = new Set<string>();
  let current = category.groupId ? byId.get(category.groupId) : undefined;
  while (current) {
    if (seen.has(current.id)) throw new Error("Budget groups contain a cycle.");
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentGroupId ? byId.get(current.parentGroupId) : undefined;
  }
  return names.join(" › ");
}

/**
 * Recursive Budget rows for DataGrid. A group count is every visible descendant envelope,
 * not merely its direct children, so the collapsed header describes the same rows it hides.
 *
 * **An empty group still emits its header.** It used to be dropped, which was invisible while
 * `BudgetStructureDrawer` listed groups directly — once structure editing moved onto the
 * tables, a dropped header meant a group you could create but never see, add to, or delete,
 * and "only an empty group may be deleted" became unreachable
 * (`agent-os/specs/2026-08-28-1613-group-kind/`). Pass this only the groups of one section,
 * or a group will render in every table at once.
 */
export function nestedBudgetGridRows<T extends BudgetRow>(
  groups: readonly BudgetGroupRow[],
  categories: readonly Pick<
    BudgetCategoryRow,
    "id" | "groupId" | "name" | "sortKey" | "hidden"
  >[],
  rows: readonly T[],
  options: { showHidden: boolean } = { showHidden: false },
): GridRow<T>[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const visibleGroups = options.showHidden
    ? groups
    : groups.filter((group) => !group.hidden);
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));
  const visibleCategories = categories.filter(
    (category) =>
      (category.groupId === null || visibleGroupIds.has(category.groupId)) &&
      (options.showHidden || !category.hidden),
  );
  const depths = budgetGroupDepths(groups);
  const result: GridRow<T>[] = [];
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

    const header = result[headerIndex];
    if (header?.kind === "group") header.count = count;
    return count;
  }

  for (const root of budgetChildren(visibleGroups, visibleCategories, null)) {
    if (root.kind === "group") {
      emitGroup(root.id);
      continue;
    }
    const row = rowById.get(root.id);
    if (!row) continue;
    result.push({ kind: "node", id: row.id, node: row, depth: 0 });
  }
  return result;
}

export function resolveBudgetDrop(
  groups: readonly BudgetGroupRow[],
  categories: readonly Pick<
    BudgetCategoryRow,
    "id" | "groupId" | "name" | "sortKey" | "kind"
  >[],
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

  // One column comparison, where this used to walk every descendant envelope to guess a
  // section: a group states its own (`agent-os/specs/2026-08-28-1613-group-kind/` D7). The
  // section root accepts anything of its own kind, which is what a null parent means here.
  const movingKind = movingCategory ? movingCategory.kind : movingGroup!.kind;
  const destinationKind = parentGroupId
    ? (groupById.get(parentGroupId)?.kind ?? null)
    : null;
  if (destinationKind !== null && destinationKind !== movingKind) return null;

  if (movingGroup && parentGroupId) {
    const descendants = descendantGroupIds(groups, movingGroup.id);
    if (parentGroupId === movingGroup.id || descendants.has(parentGroupId)) return null;
  }

  const siblings = budgetSiblings(groups, categories, parentGroupId, movingKind).filter(
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

/**
 * The groups a "Move to group…" menu may legally offer for one item.
 *
 * Two refusals, both of which the drag path (`resolveBudgetDrop`) already enforces: a group
 * may not move inside itself or any of its own descendants, and an item may not cross into a
 * group of another kind — a group is in exactly one budget table and holds only what belongs
 * in that table.
 *
 * The item's current parent is excluded too: moving somewhere it already is, is not a move.
 */
export function moveDestinations(
  groups: readonly BudgetGroupRow[],
  categories: readonly Pick<BudgetCategoryRow, "id" | "groupId" | "kind">[],
  moving: BudgetStructureRef,
): BudgetGroupRow[] {
  const movingGroup =
    moving.kind === "group"
      ? groups.find((entry) => entry.id === moving.id)
      : undefined;
  const movingCategory =
    moving.kind === "category"
      ? categories.find((entry) => entry.id === moving.id)
      : undefined;
  if (!movingGroup && !movingCategory) return [];

  const parentId = movingGroup
    ? movingGroup.parentGroupId
    : (movingCategory?.groupId ?? null);

  const excluded = movingGroup
    ? descendantGroupIds(groups, movingGroup.id)
    : new Set<string>();
  if (movingGroup) excluded.add(movingGroup.id);

  const movingKind = movingCategory ? movingCategory.kind : movingGroup!.kind;

  return groups.filter(
    (entry) =>
      entry.kind === movingKind && !excluded.has(entry.id) && entry.id !== parentId,
  );
}
