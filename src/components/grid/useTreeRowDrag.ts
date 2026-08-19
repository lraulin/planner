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
import { moveNodeAction, setCollapsedAction } from "@/app/plan/outline/actions";

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
  headerSorts,
  clearHeaderSort,
}: {
  nodes: OutlineNode[];
  byId: Map<string, OutlineNode>;
  apply: (work: () => Promise<ApplyResult>) => void;
  patch: (id: string, partial: Partial<OutlineNode>) => void;
  selectOne: (id: string) => void;
  /** Active sort keys. Drag is only compatible with a priority sort — see `onDrop`. */
  headerSorts: readonly GridSort[];
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

        // A drop rewrites letter/rank among the new siblings, so a priority sort stays
        // meaningful and is kept. Any other sort would immediately re-order the row away
        // from where it was just dropped, so it is cleared instead — including when it is
        // only a secondary key, because a secondary key still decides where ties land.
        if (headerSorts.some((entry) => entry.columnId !== "priority")) {
          clearHeaderSort();
        }

        // The same plan the server will compute, applied straight to the rows so the ranks
        // do not flicker through their old values while the round trip is in flight. The
        // server is the authority; this is only what the eye sees in the meantime.
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
              // Only the first root lands at the named slot; the rest follow it, so each
              // takes the rank after the one before by appending in order.
              priorityPlacement: previousId === null && priSlot ? priSlot : undefined,
            });
            if (!lastResult.ok) return lastResult;
            previousId = nodeId;
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
      onExpand: (id) => {
        const node = byId.get(id);
        if (!node?.hasChildren || !node.collapsed) return;
        patch(id, { collapsed: false });
        apply(() => setCollapsedAction(id, false));
      },
    };
  }, [nodes, byId, apply, patch, selectOne, headerSorts, clearHeaderSort]);
}
