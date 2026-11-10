"use client";

import { useState } from "react";

import {
  deleteBudgetCategoryAction,
  deleteCategoryGroupAction,
  moveBudgetStructureItemIntoGroupAction,
  renameCategoryGroupAction,
} from "@/app/(shell)/finances/actions";
import type { MenuItem } from "@/components/grid/ContextMenu";
import type { EnvelopeKind } from "@/db/schema";
import {
  budgetGroupDepths,
  groupDeleteBlockedReason,
  moveDestinations,
  structureParentId,
  type BudgetStructureRef,
} from "@/lib/finances/budget/hierarchy";
import type { BudgetCategoryRow, BudgetGroupRow } from "@/lib/finances/budget/queries";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import type { ComposerTarget } from "./StructureComposer";
import type { BudgetRun } from "./useBudgetRun";

/** A context menu open at a point. */
export type OpenMenu = { x: number; y: number; items: MenuItem[] };

export type DeletingItem = BudgetStructureRef & { name: string };

/** The four sections, named the way the page names them. `kind` is the section (D1). */
const KIND_LABELS: Record<EnvelopeKind, string> = {
  income: "Income",
  spending: "Envelope",
  bill: "Bill",
  savings: "Savings envelope",
};

/**
 * Structure editing, all of it inline: which `+` strip is open, which name is an input,
 * which delete is waiting to be confirmed — and the rename / reorder / regroup / delete
 * operations a row, a group header and the command catalog all share.
 */
export function useBudgetStructure({
  groups,
  categories,
  run,
  openMenu,
}: {
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  run: BudgetRun;
  openMenu: (menu: OpenMenu) => void;
}) {
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeletingItem | null>(null);

  /** The section a `+` on this grid creates into, and the noun the composer prints. */
  function openComposer(
    what: ComposerTarget["what"],
    kind: EnvelopeKind,
    groupId: string | null,
  ) {
    const group = groupId
      ? (groups.find((entry) => entry.id === groupId) ?? null)
      : null;
    setComposer({
      what,
      kind,
      groupId,
      groupName: group?.name ?? null,
      depth: groupId ? (budgetGroupDepths(groups).get(groupId) ?? 0) + 1 : 0,
    });
  }

  function moveIntoGroup(moving: BudgetStructureRef, groupId: string | null) {
    run(() => moveBudgetStructureItemIntoGroupAction(moving, groupId));
  }

  /**
   * The catalog's "Move envelope to group…", which has no cursor to open a fly-out under.
   *
   * It opens the same destination list the row menu shows, at the middle of the window —
   * the list is the whole point of the command, and reproducing it as a dialog would be a
   * second copy of the one rule (`moveDestinations`) that decides it.
   */
  function openMoveToGroupMenu(row: BudgetRow) {
    const moving: BudgetStructureRef = { kind: "category", id: row.id };
    const destinations = moveDestinations(groups, categories, moving);
    openMenu({
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 3),
      items: [
        { heading: `Move ${row.name} to` },
        ...(structureParentId(groups, categories, moving) === null
          ? []
          : [
              {
                label: "No group",
                onSelect: () => moveIntoGroup(moving, null),
              } satisfies MenuItem,
            ]),
        ...destinations.map((entry) => ({
          label: entry.name,
          onSelect: () => moveIntoGroup(moving, entry.id),
        })),
      ],
    });
  }

  /**
   * Rename / Move to group… / Delete — the same three on a row and on a group header,
   * because they are the same three operations on the same structure. There is no Move up
   * or Move down: the tables sort by name, so a position has nothing to show.
   *
   * Every one of them is a declared command as well (`navigation.md`); this is the menu the
   * commands and the right-click share.
   */
  function structureMenuItems(
    moving: BudgetStructureRef,
    name: string,
    deleteBlockedReason?: string,
  ): MenuItem[] {
    const parentId = structureParentId(groups, categories, moving);
    const destinations = moveDestinations(groups, categories, moving);
    return [
      {
        label: "Rename",
        icon: "rename",
        onSelect: () => setRenaming(moving.id),
      },
      {
        label: "Move to group",
        icon: "convert",
        disabled: destinations.length === 0 && parentId === null,
        title:
          destinations.length === 0 && parentId === null
            ? "There is no other group this can go in"
            : undefined,
        items: [
          ...(parentId === null
            ? []
            : [
                {
                  label: moving.kind === "group" ? "Top level" : "No group",
                  onSelect: () => moveIntoGroup(moving, null),
                },
                "separator" as const,
              ]),
          ...destinations.map((entry) => ({
            label: entry.name,
            onSelect: () => moveIntoGroup(moving, entry.id),
          })),
        ],
      },
      "separator",
      {
        label: "Delete…",
        icon: "delete",
        destructive: true,
        disabled: deleteBlockedReason !== undefined,
        title: deleteBlockedReason,
        onSelect: () => setDeleting({ ...moving, name }),
      },
    ];
  }

  function groupMenuItems(groupId: string, kind: EnvelopeKind): MenuItem[] {
    const group = groups.find((entry) => entry.id === groupId);
    const name = group?.name ?? "this group";
    return [
      // Only this group's own kind: a group is in exactly one table and holds only what
      // belongs in it (`agent-os/specs/2026-08-28-1613-group-kind/` D2).
      {
        label: `New ${KIND_LABELS[kind].toLowerCase()} here`,
        icon: "new",
        onSelect: () => openComposer("envelope", kind, groupId),
      },
      {
        label: "New subgroup here",
        icon: "insert-child",
        onSelect: () => openComposer("group", kind, groupId),
      },
      "separator",
      ...structureMenuItems(
        { kind: "group", id: groupId },
        name,
        groupDeleteBlockedReason(groups, categories, groupId),
      ),
    ];
  }

  return {
    composer,
    closeComposer: () => setComposer(null),
    renaming,
    startRename: (id: string) => setRenaming(id),
    cancelRename: () => setRenaming(null),
    deleting,
    startDelete: (item: DeletingItem) => setDeleting(item),
    cancelDelete: () => setDeleting(null),
    confirmDelete() {
      const target = deleting;
      setDeleting(null);
      if (!target) return;
      run(() =>
        target.kind === "group"
          ? deleteCategoryGroupAction(target.id)
          : deleteBudgetCategoryAction(target.id),
      );
    },
    renameGroup(groupId: string, name: string) {
      setRenaming(null);
      const group = groups.find((entry) => entry.id === groupId);
      const trimmed = name.trim();
      if (trimmed === "" || trimmed === group?.name) return;
      run(() => renameCategoryGroupAction(groupId, trimmed));
    },
    openComposer,
    openMoveToGroupMenu,
    structureMenuItems,
    groupMenuItems,
  };
}

export type BudgetStructure = ReturnType<typeof useBudgetStructure>;
