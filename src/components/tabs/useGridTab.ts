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
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useStateChange } from "@/components/grid/useStateChange";
import { useToday } from "@/components/grid/useToday";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import type { Command } from "@/lib/commands/registry";
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
  const { detail: detailId, setDetail: setDetailId } = useViewStateUrl();
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const { selectedId, selectedIds, select, selectOne, move } = multi;

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
    [today, selectedId, editingId, patch, apply, openDetail, stateChange],
  );

  /**
   * Right-click menu for the list tabs. Deliberately short: these tabs are views onto the
   * tree, not the tree itself, so they carry no restructuring commands — the menu offers
   * exactly what their toolbar and keyboard already do. Restructuring lives on the Outline.
   *
   * Collapse/expand is left off on purpose even though the rows have an expander. These
   * tabs list matching nodes rather than a walkable tree, so collapsing one changes nothing
   * on screen — the effect only shows up over on the Outline. A menu entry that appears to
   * do nothing where you clicked it is worse than no entry.
   */
  const rowMenu = useCallback(
    (nodeId: string): MenuItem[] => {
      if (!byId.has(nodeId)) return [];
      const multiCount = selectedIds.has(nodeId) ? selectedIds.size : 1;

      return [
        { label: "Open record", shortcut: "Enter", onSelect: () => openDetail(nodeId) },
        { label: "Rename", shortcut: "F2", onSelect: () => setEditingId(nodeId) },
        {
          label: multiCount > 1 ? `Copy as text (${multiCount})` : "Copy as text",
          shortcut: "⌘C",
          onSelect: copySelectionAsText,
        },
      ];
    },
    [byId, openDetail, selectedIds, copySelectionAsText],
  );

  /**
   * The one row-menu command with no button anywhere.
   *
   * Open and Rename reach the registry through `GridToolbar`'s `rowActions`; Copy as text is
   * right-click-or-⌘C only, which `ux-principles.md` calls broken on touch. Registering it
   * here gives all three list tabs a visible path at once, via `⋯`.
   */
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "record.copy-as-text",
        label:
          selectedIds.size > 1 ? `Copy as text (${selectedIds.size})` : "Copy as text",
        group: "record",
        shortcut: "⌘C",
        keywords: "clipboard export outline",
        disabled: selectedId === null,
        title: selectedId === null ? "Select a row first" : undefined,
        run: copySelectionAsText,
      },
    ],
    [selectedId, selectedIds, copySelectionAsText],
  );

  useRegisterCommands(commands);

  // Keyboard: Enter opens drawer, F2 renames, arrows move/extend selection, ⌘C copies text.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (detailId || editingId) return;
      if (isTypingTarget(event.target)) return;
      if (!selectedId) return;

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        (event.key === "c" || event.key === "C")
      ) {
        event.preventDefault();
        copySelectionAsText();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        openDetail(selectedId);
      } else if (event.key === "F2") {
        event.preventDefault();
        setEditingId(selectedId);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailId, editingId, selectedId, openDetail, move, copySelectionAsText]);

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
    move,
    /** Tell multi-select which ids are on screen, in screen order. */
    setNavigableIds,
    editingId,
    setEditingId,
    detailId,
    setDetailId,
    selected,
    detailNode,
    openDetail,
    cellHandlers,
    /** Cascade confirmation state — the host renders the dialog. */
    stateChange,
    rowMenu,
    copySelectionAsText,
  };
}
