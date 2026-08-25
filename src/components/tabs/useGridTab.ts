"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import {
  deleteNodeAction,
  renameNodeAction,
  setDeadlineAction,
  setEffortAction,
  setFocusAction,
  setPriorityAction,
  setStateAction,
  setCollapsedAction,
} from "@/app/plan/outline/actions";
import { useOptimisticNodes } from "@/components/grid/useOptimisticNodes";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useStateChange } from "@/components/grid/useStateChange";
import { useToday } from "@/components/grid/useToday";
import { useSuspendCommandKeys } from "@/components/shell/CommandProvider";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { shouldDiscardVirginInsert } from "@/lib/grid/virginInsert";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { isTypingTarget } from "@/lib/keyboard";

/**
 * Shared selection, drawer, rename, and optimistic cell-write handlers for the node-based
 * grid tabs (Projects, Tasks, Goals). Wish List has its own path over `node_items`.
 *
 * The open drawer is owned by `?detail=` so reload and shared links reopen it, and so the
 * browser Back button closes it.
 *
 * Hosts should call `setNavigableIds` with the on-screen node ids (after filter/sort/group)
 * so Shift-range and arrow multi-select walk what the user sees. Until they do, the full
 * tree order is used as a stand-in.
 */
export function useGridTab(initialNodes: OutlineNode[]) {
  const { nodes, byId, patch, apply, error, setError } =
    useOptimisticNodes(initialNodes);
  const {
    detail: detailId,
    setDetail: setDetailId,
    scope,
    setScope,
  } = useViewStateUrl();
  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * Row id opened for naming immediately after create. Escape with an empty draft discards
   * that insert (Achieve cancel-blank-row). F2 rename never sets this.
   */
  const [virginInsertId, setVirginInsertId] = useState<string | null>(null);
  const [navigableIds, setNavigableIds] = useState<readonly string[]>([]);
  const today = useToday();

  // Memoised because the fallback branch builds a new array, and everything downstream keys
  // off its identity: `copySelectionAsText` was being rebuilt on every single render, which
  // stayed invisible until a consumer registered it as a command and the churn had somewhere
  // to become a re-render loop.
  const order = useMemo(
    () => (navigableIds.length > 0 ? navigableIds : nodes.map((n) => n.id)),
    [navigableIds, nodes],
  );
  const multi = useMultiSelect(order, detailId);
  const {
    selectedId,
    selectedIds,
    select,
    selectOne,
    selectAll,
    toggleSelectAll,
    headerState,
    move,
  } = multi;

  // Back / forward and deep-links change `?detail=`. Sync the row highlight during render
  // (same idiom as DayView re-syncing server props) so the open drawer always has a
  // selected owner without an effect-driven cascade.
  const [seenDetailId, setSeenDetailId] = useState(detailId);
  if (detailId !== seenDetailId) {
    setSeenDetailId(detailId);
    if (detailId) selectOne(detailId);
  }

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const detailNode = detailId ? (byId.get(detailId) ?? null) : null;

  const openDetail = useCallback(
    (id: string) => {
      selectOne(id);
      setDetailId(id);
    },
    [setDetailId, selectOne],
  );

  /**
   * Land on a freshly created row and open its name for typing — the same gesture the Outline
   * makes, so a row created here is named where it was created rather than arriving blank and
   * waiting to be found again. Marks the row as a virgin insert so Esc can cancel it.
   */
  const startNaming = useCallback(
    (id?: string) => {
      if (!id) return;
      selectOne(id);
      setEditingId(id);
      setVirginInsertId(id);
    },
    [selectOne],
  );

  const copySelectionAsText = useCallback(() => {
    const text = copyAsText(
      order
        .map((id) => byId.get(id))
        .filter((node): node is OutlineNode => node != null)
        .map((node) => ({
          id: node.id,
          name: node.name,
          // List tabs re-base depth for subprojects/subtasks; for clipboard we only need
          // relative nesting among the selected rows, so tree depth is fine.
          depth: node.depth,
        })),
      selectedIds,
    );
    void writeClipboardText(text);
  }, [order, byId, selectedIds]);

  const stateChange = useStateChange({ nodes, patch, apply });

  const cellHandlers = useMemo(
    () => ({
      today,
      selectedId,
      editingId,
      onToggleCollapsed: (node: OutlineNode) => {
        if (!node.hasChildren) return;
        const collapsed = !node.collapsed;
        patch(node.id, { collapsed });
        apply(() => setCollapsedAction(node.id, collapsed));
      },
      onOpenDetail: (node: OutlineNode) => openDetail(node.id),
      onFinishEdit: (node: OutlineNode, name: string) => {
        setEditingId(null);
        setVirginInsertId(null);
        if (name !== node.name) {
          patch(node.id, { name });
          apply(() => renameNodeAction(node.id, name));
        }
      },
      onCancelEdit: (draft: string) => {
        const id = editingId;
        const discard =
          id != null &&
          shouldDiscardVirginInsert({
            virginInsertId,
            editingId: id,
            committedName: byId.get(id)?.name ?? "",
            draftName: draft,
          });
        setEditingId(null);
        setVirginInsertId(null);
        if (!discard || !id) return;
        // Same neighbor pick as Outline delete: land below the hole when possible.
        const index = order.indexOf(id);
        const nextSelection =
          order.slice(index + 1).find((entry) => entry !== id) ??
          order
            .slice(0, Math.max(index, 0))
            .reverse()
            .find((entry) => entry !== id) ??
          null;
        selectOne(nextSelection);
        apply(() => deleteNodeAction(id));
      },
      onPriorityChange: (
        node: OutlineNode,
        letter: Parameters<typeof setPriorityAction>[1],
        rank: Parameters<typeof setPriorityAction>[2],
      ) => {
        patch(node.id, { priorityLetter: letter, priorityRank: rank });
        apply(() => setPriorityAction(node.id, letter, rank));
      },
      // Settling a row settles the open work under it, and re-opening one re-opens the
      // settled rows above it — see `useStateChange`, which also owns the confirmation.
      onStateChange: (node: OutlineNode, state: Parameters<typeof setStateAction>[1]) =>
        stateChange.request(node, state, setStateAction),
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
    [
      today,
      selectedId,
      editingId,
      virginInsertId,
      byId,
      order,
      patch,
      apply,
      openDetail,
      selectOne,
      stateChange,
    ],
  );

  /*
   * There is no `rowMenu` and no command registration here any more.
   *
   * Both moved to `useNodeCommandDeck`, which is where the rest of these grids' commands already
   * lived. This hook had a hand-written three-item menu saying `Open record` while the toolbar said
   * `Open`, and it registered `Copy as text` separately from the capabilities object that describes
   * everything else — two halves of one view's vocabulary, kept in two places. One capabilities
   * object now produces the toolbar, the menus, the row menu and the palette entries.
   *
   * These tabs still carry no restructuring commands: they are views onto the tree rather than the
   * tree, so move/indent/collapse belong to the Outline. That is `useNodeCommandDeck` declining to
   * declare `hierarchy`, which is one decision in one place rather than a menu and an allowlist
   * that have to agree.
   */

  /*
   * Selection navigation only.
   *
   * Enter, F2 and ⌘C used to be here too. They are commands with menu rows, so they are now
   * `bindings` on those commands and `CommandKeys` fires them — which is what makes the printed
   * `F2` and the key that renames the same fact. Arrows are not commands: moving the selection has
   * no menu row and no label, it is how you get around a row set.
   */
  useSuspendCommandKeys(editingId !== null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (detailId || editingId) return;
      if (isTypingTarget(event.target)) return;
      if (!selectedId) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailId, editingId, selectedId, move]);

  return {
    nodes,
    byId,
    patch,
    apply,
    error,
    setError,
    today,
    selectedId,
    selectedIds,
    setSelectedId: selectOne,
    select,
    selectOne,
    selectAll,
    toggleSelectAll,
    headerState,
    move,
    /** Tell multi-select which ids are on screen, in screen order. */
    setNavigableIds,
    editingId,
    setEditingId,
    startNaming,
    detailId,
    setDetailId,
    selected,
    detailNode,
    openDetail,
    cellHandlers,
    /** Cascade confirmation state — the host renders the dialog. */
    stateChange,
    copySelectionAsText,
    /**
     * The branch this tab is narrowed to, from `?scope=`. Local state before, which meant the
     * narrowing survived neither reload nor Back — and left `View tasks…` with nowhere to land.
     */
    scope,
    setScope,
  };
}
