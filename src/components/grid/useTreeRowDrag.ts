"use client";

import { useMemo } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { resolveDrop } from "@/lib/tree/dnd";
import {
  planSiblingPriorityDrop,
  priorityDropFromPosition,
} from "@/lib/tree/outlinePriority";
import { selectionMoveRoots } from "@/lib/grid/selection";
import type { GridSort } from "@/lib/settings/grid";
import type { RowDrag } from "./DataGrid";
import {
  moveNodeAction,
  setCollapsedAction,
  setPriorityAction,
} from "@/app/outline/actions";

type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Achieve-style tree row drag for Outline-like grids: structural move + sibling priority
 * renumber. Hosts that need category-group drops (Outline "By category") keep their own
 * resolver; this covers the plain parent/position case Projects and Tasks need.
 */
export function useTreeRowDrag({
  nodes,
  byId,
  apply,
  patch,
  selectOne,
  headerSort,
  clearHeaderSort,
}: {
  nodes: OutlineNode[];
  byId: Map<string, OutlineNode>;
  apply: (work: () => Promise<ApplyResult>) => void;
  patch: (id: string, partial: Partial<OutlineNode>) => void;
  selectOne: (id: string) => void;
  headerSort: GridSort | null;
  clearHeaderSort: () => void;
}): RowDrag {
  return useMemo(() => {
    const rootsOf = (dragIds: readonly string[]) =>
      selectionMoveRoots(
        new Set(dragIds),
        dragIds,
        (id) => byId.get(id)?.parentId ?? null,
      );

    return {
      resolve: (dragIds, targetId, zone) => {
        const roots = rootsOf(dragIds);
        if (roots.length === 0) return null;
        if (dragIds.includes(targetId)) return null;
        return resolveDrop(roots[0], targetId, zone, byId);
      },
      onDrop: (dragIds, targetId, zone) => {
        const roots = rootsOf(dragIds);
        if (roots.length === 0) return;
        if (dragIds.includes(targetId)) return;

        const primary = roots[0];
        const placement = resolveDrop(primary, targetId, zone, byId);
        if (!placement) return;

        if (headerSort && headerSort.columnId !== "priority") clearHeaderSort();

        const priSlot = priorityDropFromPosition(placement.position);
        const priorityPlan = priSlot
          ? planSiblingPriorityDrop(
              nodes,
              roots,
              priSlot.targetId,
              priSlot.zone,
              placement.parentId,
            )
          : [];

        selectOne(primary);
        for (const assignment of priorityPlan) {
          patch(assignment.id, {
            priorityLetter: assignment.letter,
            priorityRank: assignment.rank,
          });
        }

        apply(async () => {
          let previousId: string | null = null;
          let lastResult: ApplyResult = { ok: true };
          for (const nodeId of roots) {
            const position =
              previousId === null
                ? placement.position
                : { at: "after" as const, siblingId: previousId };
            lastResult = await moveNodeAction({
              nodeId,
              parentId: placement.parentId,
              position,
            });
            if (!lastResult.ok) return lastResult;
            previousId = nodeId;
          }
          for (const assignment of priorityPlan) {
            lastResult = await setPriorityAction(
              assignment.id,
              assignment.letter,
              assignment.rank,
            );
            if (!lastResult.ok) return lastResult;
          }
          if (
            lastResult.ok &&
            placement.parentId &&
            byId.get(placement.parentId)?.collapsed
          ) {
            return setCollapsedAction(placement.parentId, false);
          }
          return lastResult;
        });
      },
    };
  }, [nodes, byId, apply, patch, selectOne, headerSort, clearHeaderSort]);
}
