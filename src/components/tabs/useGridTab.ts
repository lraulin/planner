"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import {
  renameNodeAction,
  setDeadlineAction,
  setEffortAction,
  setFocusAction,
  setPriorityAction,
  setStateAction,
  setCollapsedAction,
} from "@/app/outline/actions";
import { useOptimisticNodes } from "@/components/grid/useOptimisticNodes";
import { useToday } from "@/components/grid/useToday";
import { buildAncestorPriorities } from "@/components/grid/DataGrid";

/**
 * Shared selection, drawer, rename, and optimistic cell-write handlers for the node-based
 * grid tabs (Projects, Tasks, Goals). Wish List has its own path over `node_items`.
 */
export function useGridTab(initialNodes: OutlineNode[]) {
  const { nodes, byId, patch, apply, error, setError } =
    useOptimisticNodes(initialNodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const today = useToday();

  const ancestorPriorities = useMemo(
    () => buildAncestorPriorities(nodes, byId),
    [nodes, byId],
  );

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const detailNode = detailId ? (byId.get(detailId) ?? null) : null;

  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setDetailId(id);
  }, []);

  const cellHandlers = useMemo(
    () => ({
      today,
      selectedId,
      editingId,
      ancestorPriorities,
      onToggleCollapsed: (node: OutlineNode) => {
        if (!node.hasChildren) return;
        const collapsed = !node.collapsed;
        patch(node.id, { collapsed });
        apply(() => setCollapsedAction(node.id, collapsed));
      },
      onOpenDetail: (node: OutlineNode) => openDetail(node.id),
      onFinishEdit: (node: OutlineNode, name: string) => {
        setEditingId(null);
        if (name !== node.name) {
          patch(node.id, { name });
          apply(() => renameNodeAction(node.id, name));
        }
      },
      onCancelEdit: () => setEditingId(null),
      onPriorityChange: (
        node: OutlineNode,
        letter: Parameters<typeof setPriorityAction>[1],
        rank: Parameters<typeof setPriorityAction>[2],
      ) => {
        patch(node.id, { priorityLetter: letter, priorityRank: rank });
        apply(() => setPriorityAction(node.id, letter, rank));
      },
      onStateChange: (
        node: OutlineNode,
        state: Parameters<typeof setStateAction>[1],
      ) => {
        patch(node.id, { state });
        apply(() => setStateAction(node.id, state));
      },
      onFocusChange: (node: OutlineNode, focus: boolean) => {
        patch(node.id, { focus });
        apply(() => setFocusAction(node.id, focus));
      },
      onDeadlineChange: (node: OutlineNode, deadline: string | null) => {
        patch(node.id, { deadline: deadline ? new Date(deadline) : null });
        apply(() => setDeadlineAction(node.id, deadline));
      },
      onEffortChange: (node: OutlineNode, minutes: number | null) => {
        patch(node.id, {
          effortMinutes: minutes,
          effortRollupMinutes: minutes,
        });
        apply(() => setEffortAction(node.id, minutes));
      },
    }),
    [today, selectedId, editingId, ancestorPriorities, patch, apply, openDetail],
  );

  // Keyboard: Enter opens drawer, F2 renames — same as outline, without tree restructure.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (detailId || editingId) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!selectedId) return;

      if (event.key === "Enter") {
        event.preventDefault();
        setDetailId(selectedId);
      } else if (event.key === "F2") {
        event.preventDefault();
        setEditingId(selectedId);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        // Host grids own relative selection via their visible row lists when needed.
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailId, editingId, selectedId]);

  return {
    nodes,
    byId,
    patch,
    apply,
    error,
    setError,
    today,
    selectedId,
    setSelectedId,
    editingId,
    setEditingId,
    detailId,
    setDetailId,
    selected,
    detailNode,
    openDetail,
    cellHandlers,
    ancestorPriorities,
  };
}
