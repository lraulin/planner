"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NodeType } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import {
  categoryLabelFromGroupId,
  groupByCategory,
  type GridRow,
} from "@/lib/tree/slice";
import {
  allowedChildKinds,
  defaultChildType,
  KIND_LABELS,
  kindOfNode,
  TYPE_LABELS,
  type NodeKind,
} from "@/lib/tree/hierarchy";
import {
  resolveCategoryGroupDrop,
  resolveDrop,
  withRootCategoryFromPlacement,
} from "@/lib/tree/dnd";
import {
  createNodeAction,
  deleteNodeAction,
  indentNodeAction,
  moveNodeAction,
  moveNodeVerticallyAction,
  outdentNodeAction,
  renameNodeAction,
  setAllCollapsedAction,
  setCollapsedAction,
  setDeadlineAction,
  setEffortAction,
  setFocusAction,
  setPriorityAction,
  setStateAction,
} from "@/app/outline/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { SortChip, sortColumnLabel } from "@/components/grid/SortChip";
import { useGridState } from "@/components/grid/useGridState";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useOptimisticNodes } from "@/components/grid/useOptimisticNodes";
import { useToday } from "@/components/grid/useToday";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import {
  parseOutlineFilters,
  serializeOutlineFilters,
  type OutlineFilters,
} from "@/lib/settings/outline";
import { OUTLINE_FILTERS_SCOPE } from "@/lib/settings/scopes";
import { selectionMoveRoots } from "@/lib/grid/selection";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { HintBar } from "./HintBar";
import { NewChildDialog } from "./NewChildDialog";
import {
  outlineColumns,
  OUTLINE_COLUMN_IDS,
  type OutlineColumnCtx,
} from "./outlineColumns";
import { isTypingTarget } from "@/lib/keyboard";

const OUTLINE_FILTERS_CODEC: SettingCodec<OutlineFilters> = {
  parse: parseOutlineFilters,
  serialize: serializeOutlineFilters,
};

/**
 * Outline tab host: tree commands, type filters, drawer, and the shared DataGrid with the
 * outline's column set. Optional "By category" lays group headers over the tree and lets
 * root result areas change category by drag.
 */
export function OutlineGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const { nodes, byId, patch, apply, error, setError } =
    useOptimisticNodes(initialNodes);
  const { detail: detailId, setDetail: setDetailId } = useViewStateUrl();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OutlineNode | null>(null);
  /** The row a new child is being added to, while its kind is being chosen. */
  const [pendingChildOf, setPendingChildOf] = useState<OutlineNode | null>(null);
  const [byCategory, setByCategory] = useState(false);
  const today = useToday();

  const {
    value: typeFilters,
    patch: patchTypeFilters,
    reset: resetTypeFilters,
  } = useSetting(OUTLINE_FILTERS_SCOPE, OUTLINE_FILTERS_CODEC);
  const { types: filters, focusOnly } = typeFilters;

  const gridState = useGridState("outline", outlineColumns, [...OUTLINE_COLUMN_IDS]);

  const visible = useMemo(() => {
    const dropped = new Set<string>();
    return nodes.filter((node) => {
      const parentDropped = node.parentId ? dropped.has(node.parentId) : false;
      const filteredOut = !filters[node.type] || (focusOnly && !node.focus);
      if (parentDropped || filteredOut) {
        dropped.add(node.id);
        return false;
      }
      return !node.hidden;
    });
  }, [nodes, filters, focusOnly]);

  /**
   * The outline is the tree itself, so its rows are a flat list at tree depth. By Category
   * lays headers over that without disturbing it — see `groupByCategory`.
   */
  const gridRows: GridRow[] = useMemo(
    () =>
      byCategory
        ? groupByCategory(visible, byId)
        : visible.map((node) => ({
            kind: "node" as const,
            id: node.id,
            node,
            depth: node.depth,
          })),
    [visible, byCategory, byId],
  );

  /**
   * The rows the arrow keys walk: what is on screen, in screen order. Grouping puts rows
   * in category order rather than tree order, and a collapsed category takes its rows off
   * screen entirely — either way `visible` is no longer what ↑/↓ should step through.
   */
  const navigable = useMemo(() => {
    if (!byCategory) return visible;
    const out: OutlineNode[] = [];
    let insideCollapsed = false;
    for (const row of gridRows) {
      if (row.kind === "group") insideCollapsed = gridState.collapsedGroups.has(row.id);
      else if (!insideCollapsed) out.push(row.node);
    }
    return out;
  }, [byCategory, visible, gridRows, gridState.collapsedGroups]);

  const orderedIds = useMemo(() => navigable.map((n) => n.id), [navigable]);
  const multi = useMultiSelect(orderedIds, detailId ?? initialNodes[0]?.id ?? null);
  const { selectedId, selectedIds, select, selectOne, move } = multi;

  // Back / forward and deep-links change `?detail=`. Sync selection during render so the
  // open drawer always has a selected owner without an effect-driven cascade.
  const [seenDetailId, setSeenDetailId] = useState(detailId);
  if (detailId !== seenDetailId) {
    setSeenDetailId(detailId);
    if (detailId) selectOne(detailId);
  }

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const startNaming = useCallback(
    (id?: string) => {
      if (!id) return;
      selectOne(id);
      setEditingId(id);
    },
    [selectOne],
  );

  const copySelectionAsText = useCallback(() => {
    const text = copyAsText(
      navigable.map((node) => ({
        id: node.id,
        name: node.name,
        depth: node.depth,
      })),
      selectedIds,
    );
    void writeClipboardText(text);
  }, [navigable, selectedIds]);

  const addSibling = useCallback(
    (node: OutlineNode | null, where: "before" | "after") => {
      if (!node) return;
      apply(
        () =>
          createNodeAction({
            parentId: node.parentId,
            // A sibling matches what it sits beside, dream and all: you are continuing a
            // list, so there is nothing to ask. (This used to be the parent's default
            // child type, which meant a sibling of a goal came back a project.)
            kind: kindOfNode(node),
            position: { at: where, siblingId: node.id },
          }),
        startNaming,
      );
    },
    [apply, startNaming],
  );

  const addChildOfKind = useCallback(
    (parentId: string, kind: NodeKind) => {
      apply(
        () => createNodeAction({ parentId, kind, position: { at: "last" } }),
        startNaming,
      );
    },
    [apply, startNaming],
  );

  /**
   * Adding a child asks what kind it should be, unless the hierarchy leaves only one
   * answer — under a task, everything below is a task, and a dialog with one button is a
   * dialog that should not have opened.
   */
  const addChild = useCallback(
    (node: OutlineNode | null) => {
      if (!node) return;
      const kinds = allowedChildKinds(node.type);
      if (kinds.length === 1) addChildOfKind(node.id, kinds[0]);
      else setPendingChildOf(node);
    },
    [addChildOfKind],
  );

  const addResultArea = useCallback(() => {
    apply(
      () =>
        createNodeAction({
          parentId: null,
          kind: "result_area",
          position: { at: "last" },
        }),
      startNaming,
    );
  }, [apply, startNaming]);

  const addGoal = useCallback(() => {
    if (!selected) return;
    const host =
      selected.type === "result_area" || selected.type === "goal"
        ? selected
        : nearestGoalHost(selected, byId);

    if (!host) {
      setError("Goals sit under a result area. Select one first.");
      return;
    }

    apply(
      () =>
        createNodeAction({
          parentId: host.id,
          kind: "goal",
          position: { at: "last" },
        }),
      startNaming,
    );
  }, [selected, byId, apply, startNaming, setError]);

  const toggleCollapsed = useCallback(
    (node: OutlineNode, collapsed: boolean) => {
      if (!node.hasChildren) return;
      patch(node.id, { collapsed });
      apply(() => setCollapsedAction(node.id, collapsed));
    },
    [patch, apply],
  );

  /** Achieve's Expand All / Collapse All — one write for the whole tree. */
  const setTreeCollapsed = useCallback(
    (collapsed: boolean) => {
      for (const node of nodes) {
        if (node.hasChildren) patch(node.id, { collapsed });
      }
      apply(() => setAllCollapsedAction(collapsed));
    },
    [nodes, patch, apply],
  );

  const confirmDelete = useCallback(
    (node: OutlineNode) => {
      const index = navigable.findIndex((n) => n.id === node.id);
      const nextSelection =
        navigable[index + 1]?.id ?? navigable[index - 1]?.id ?? null;
      selectOne(nextSelection);
      apply(() => deleteNodeAction(node.id));
    },
    [navigable, apply, selectOne],
  );

  /**
   * The tree commands, bound to whichever node they are asked about. The keyboard and
   * toolbar bind them to the selection; the right-click menu binds them to the row that was
   * clicked, which is not always the same thing at the moment the menu opens.
   */
  const commandsFor = useCallback(
    (node: OutlineNode | null) => ({
      addSiblingAfter: () => addSibling(node, "after"),
      addSiblingBefore: () => addSibling(node, "before"),
      addChild: () => addChild(node),
      indent: () => node && apply(() => indentNodeAction(node.id)),
      outdent: () => node && apply(() => outdentNodeAction(node.id)),
      moveUp: () => node && apply(() => moveNodeVerticallyAction(node.id, "up")),
      moveDown: () => node && apply(() => moveNodeVerticallyAction(node.id, "down")),
      remove: () => node && setPendingDelete(node),
      rename: () => node && setEditingId(node.id),
      openDetail: () => node && setDetailId(node.id),
      collapse: () => node && toggleCollapsed(node, true),
      expand: () => node && toggleCollapsed(node, false),
    }),
    [addSibling, addChild, apply, toggleCollapsed, setDetailId],
  );

  const commands = useMemo(
    () => ({
      ...commandsFor(selected),
      selectUp: () => move(-1, false),
      selectDown: () => move(1, false),
      extendUp: () => move(-1, true),
      extendDown: () => move(1, true),
      copyAsText: copySelectionAsText,
      collapseAll: () => setTreeCollapsed(true),
      expandAll: () => setTreeCollapsed(false),
    }),
    [commandsFor, selected, move, copySelectionAsText, setTreeCollapsed],
  );

  const suspended =
    detailId !== null || pendingDelete !== null || pendingChildOf !== null;
  useOutlineKeyboard({ commands, editingId, suspended });

  /**
   * Right-click menu. Every entry is a command that also has a shortcut and a toolbar
   * button — the menu adds discoverability, not capability — and each one is greyed out on
   * exactly the conditions that would make it fail, so nothing here raises an error banner.
   */
  const rowMenu = useCallback(
    (nodeId: string): MenuItem[] => {
      const node = byId.get(nodeId);
      if (!node) return [];

      const command = commandsFor(node);
      const siblings = nodes.filter((n) => n.parentId === node.parentId);
      const index = siblings.findIndex((n) => n.id === node.id);

      const multiCount = selectedIds.has(nodeId) ? selectedIds.size : 1;

      return [
        { label: "Open record", shortcut: "Enter", onSelect: command.openDetail },
        { label: "Rename", shortcut: "F2", onSelect: command.rename },
        {
          label: multiCount > 1 ? `Copy as text (${multiCount})` : "Copy as text",
          shortcut: "⌘C",
          onSelect: copySelectionAsText,
        },
        "separator",
        {
          label: "Add sibling after",
          shortcut: "Insert",
          onSelect: command.addSiblingAfter,
        },
        {
          label: "Add sibling before",
          shortcut: "⇧Insert",
          onSelect: command.addSiblingBefore,
        },
        { label: "Add child", shortcut: "⌃Insert", onSelect: command.addChild },
        "separator",
        {
          label: "Indent",
          shortcut: "Tab",
          // Indenting makes a node the last child of the sibling above it; the first node
          // at a level has none.
          disabled: index <= 0,
          onSelect: command.indent,
        },
        {
          label: "Outdent",
          shortcut: "⇧Tab",
          disabled: node.parentId === null,
          onSelect: command.outdent,
        },
        {
          label: "Move up",
          shortcut: "⌥↑",
          disabled: index <= 0,
          onSelect: command.moveUp,
        },
        {
          label: "Move down",
          shortcut: "⌥↓",
          disabled: index === siblings.length - 1,
          onSelect: command.moveDown,
        },
        "separator",
        node.collapsed
          ? {
              label: "Expand",
              shortcut: "→",
              disabled: !node.hasChildren,
              onSelect: command.expand,
            }
          : {
              label: "Collapse",
              shortcut: "←",
              disabled: !node.hasChildren,
              onSelect: command.collapse,
            },
        "separator",
        {
          label: `Delete ${KIND_LABELS[kindOfNode(node)].toLowerCase()}`,
          shortcut: "Delete",
          destructive: true,
          onSelect: command.remove,
        },
      ];
    },
    [byId, nodes, commandsFor, selectedIds, copySelectionAsText],
  );

  /**
   * Drag-to-move. `resolveDrop` runs against the whole tree rather than the visible rows,
   * so hovering beside a row still resolves through ancestors that filters have hidden.
   * With "By category" on, group headers and root-level placements can also reassign a
   * result area's category (categories live only on result areas; other types inherit
   * display grouping from their nearest area).
   * Nothing is patched optimistically — a move changes depth, order and rollups at once,
   * and the server round-trip that `apply` already performs is the honest way to get them.
   */
  /**
   * Drag is the hand-built tree order. While a header sort is active the rows on screen
   * are not that order, so dragging would write a sortKey the user cannot see. Stand down
   * entirely and let the SortChip clear the way back.
   */
  const rowDrag: RowDrag | undefined = useMemo(() => {
    if (gridState.sort) return undefined;

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
        // Multi-drag cannot land on a member of the block.
        if (dragIds.includes(targetId)) return null;

        const primary = roots[0];
        if (categoryLabelFromGroupId(targetId) !== null) {
          return byCategory
            ? resolveCategoryGroupDrop(primary, targetId, byId, nodes)
            : null;
        }
        const drop = resolveDrop(primary, targetId, zone, byId);
        if (!drop) return null;
        return byCategory ? withRootCategoryFromPlacement(drop, primary, byId) : drop;
      },
      onDrop: (dragIds, targetId, zone) => {
        const roots = rootsOf(dragIds);
        if (roots.length === 0) return;
        if (dragIds.includes(targetId)) return;

        const primary = roots[0];
        let drop =
          categoryLabelFromGroupId(targetId) !== null
            ? byCategory
              ? resolveCategoryGroupDrop(primary, targetId, byId, nodes)
              : null
            : resolveDrop(primary, targetId, zone, byId);
        if (!drop) return;
        if (byCategory && categoryLabelFromGroupId(targetId) === null) {
          drop = withRootCategoryFromPlacement(drop, primary, byId);
        }

        selectOne(primary);
        const placement = drop;
        apply(async () => {
          // Move the block as consecutive siblings: first to the resolved placement, each
          // later root after the previous. Children of a selected parent ride along with it
          // (they never appear in `roots`).
          let previousId: string | null = null;
          let lastResult: { ok: true } | { ok: false; error: string } = { ok: true };
          for (const nodeId of roots) {
            const position =
              previousId === null
                ? placement.position
                : { at: "after" as const, siblingId: previousId };
            lastResult = await moveNodeAction({
              nodeId,
              parentId: placement.parentId,
              position,
              // Category only applies to the first root landing at the root level.
              category: previousId === null ? placement.category : undefined,
            });
            if (!lastResult.ok) return lastResult;
            previousId = nodeId;
          }
          // Dropping into a closed row would otherwise read as the node vanishing.
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
  }, [byId, byCategory, nodes, apply, gridState.sort, selectOne]);

  const columnCtx: OutlineColumnCtx = useMemo(
    () => ({
      today,
      selectedId,
      editingId,
      onToggleCollapsed: (node) => toggleCollapsed(node, !node.collapsed),
      onOpenDetail: (node) => {
        selectOne(node.id);
        setDetailId(node.id);
      },
      onFinishEdit: (node, name) => {
        setEditingId(null);
        if (name !== node.name) {
          patch(node.id, { name });
          apply(() => renameNodeAction(node.id, name));
        }
      },
      onCancelEdit: () => setEditingId(null),
      onPriorityChange: (node, letter, rank) => {
        patch(node.id, { priorityLetter: letter, priorityRank: rank });
        apply(() => setPriorityAction(node.id, letter, rank));
      },
      onStateChange: (node, state) => {
        patch(node.id, { state });
        apply(() => setStateAction(node.id, state));
      },
      onFocusChange: (node, focus) => {
        patch(node.id, { focus });
        apply(() => setFocusAction(node.id, focus));
      },
      onDeadlineChange: (node, deadline) => {
        patch(node.id, { deadline: deadline ? new Date(deadline) : null });
        apply(() => setDeadlineAction(node.id, deadline));
      },
      onEffortChange: (node, minutes) => {
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
      toggleCollapsed,
      patch,
      apply,
      setDetailId,
      selectOne,
    ],
  );

  const detailNode = detailId ? (byId.get(detailId) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <FilterBar
        filters={filters}
        onToggleType={(type) =>
          patchTypeFilters((current) => ({
            ...current,
            types: { ...current.types, [type]: !current.types[type] },
          }))
        }
        focusOnly={focusOnly}
        onToggleFocusOnly={() =>
          patchTypeFilters((current) => ({
            ...current,
            focusOnly: !current.focusOnly,
          }))
        }
        byCategory={byCategory}
        onToggleByCategory={() => setByCategory((v) => !v)}
        commands={commands}
        onAddResultArea={addResultArea}
        onAddGoal={addGoal}
        hasSelection={selected !== null}
        onResetGrid={gridState.reset}
      />

      {error && (
        <p
          role="alert"
          className="flex-none border-b border-priority-a/40 bg-priority-a/10 px-4 py-1.5 text-[0.8125rem] text-priority-a"
        >
          {error}
        </p>
      )}

      {gridState.sort && (
        <SortChip
          sort={gridState.sort}
          columnLabel={sortColumnLabel(gridState.sort, outlineColumns)}
          onClear={gridState.clearSort}
        />
      )}

      <DataGrid
        rows={gridRows}
        columns={gridState.columns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={(id) => {
          selectOne(id);
          setDetailId(id);
        }}
        ariaLabel="Outline"
        rowDrag={rowDrag}
        rowMenu={rowMenu}
        enableFilters
        enableSort
        sort={gridState.sort}
        onSortChange={gridState.toggleSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        empty={
          <EmptyState
            filtered={nodes.length > 0}
            onAddResultArea={addResultArea}
            onClearFilters={() => {
              resetTypeFilters();
              gridState.clearFilters();
            }}
          />
        }
      />

      <HintBar />

      <NodeDetailDrawer node={detailNode} onClose={() => setDetailId(null)} />

      {pendingChildOf && (
        <NewChildDialog
          open
          parentName={pendingChildOf.name}
          kinds={allowedChildKinds(pendingChildOf.type)}
          defaultKind={defaultChildType(pendingChildOf.type)}
          onPick={(kind) => {
            const parent = pendingChildOf;
            setPendingChildOf(null);
            addChildOfKind(parent.id, kind);
          }}
          onCancel={() => setPendingChildOf(null)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete this ${pendingDelete ? KIND_LABELS[kindOfNode(pendingDelete)].toLowerCase() : "row"}?`}
        message={deleteMessage(pendingDelete)}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) confirmDelete(target);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function nearestGoalHost(
  from: OutlineNode,
  byId: Map<string, OutlineNode>,
): OutlineNode | null {
  let current = from.parentId ? (byId.get(from.parentId) ?? null) : null;
  while (current) {
    if (current.type === "result_area" || current.type === "goal") return current;
    current = current.parentId ? (byId.get(current.parentId) ?? null) : null;
  }
  return null;
}

function deleteMessage(node: OutlineNode | null): string {
  if (!node) return "";
  const label = node.name || `This ${KIND_LABELS[kindOfNode(node)].toLowerCase()}`;
  return node.hasChildren
    ? `${label} and all ${node.childCount} items under it will be deleted. This cannot be undone.`
    : `${label} will be deleted. This cannot be undone.`;
}

/**
 * Keyboard control. Achieve's bindings, with Cmd+Return standing in for Insert — Apple
 * keyboards have no Insert key, but Insert still works for anyone with one.
 *
 * Bound to the document rather than the grid: the outline is the whole page, so arrows
 * and inserts should work immediately instead of requiring a click to focus the list
 * first. Anything typed into a field is left alone.
 */
function useOutlineKeyboard({
  commands,
  editingId,
  suspended,
}: {
  commands: Record<string, () => void>;
  editingId: string | null;
  suspended: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editingId || suspended) return;

      if (isTypingTarget(event.target)) return;

      const insert = event.key === "Insert" || (event.key === "Enter" && event.metaKey);

      if (insert) {
        event.preventDefault();
        if (event.ctrlKey) commands.addChild();
        else if (event.shiftKey) commands.addSiblingBefore();
        else commands.addSiblingAfter();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        (event.key === "c" || event.key === "C")
      ) {
        // Copy selected rows as indented plain text. The browser's own copy still wins
        // inside a field (isTypingTarget above); here the grid owns the clipboard.
        event.preventDefault();
        commands.copyAsText();
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          if (event.altKey) commands.moveUp();
          else if (event.shiftKey) commands.extendUp();
          else commands.selectUp();
          break;
        case "ArrowDown":
          event.preventDefault();
          if (event.altKey) commands.moveDown();
          else if (event.shiftKey) commands.extendDown();
          else commands.selectDown();
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (event.metaKey || event.ctrlKey) {
            if (typeof commands.collapseAll === "function") commands.collapseAll();
            else commands.collapse();
          } else {
            commands.collapse();
          }
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.metaKey || event.ctrlKey) {
            if (typeof commands.expandAll === "function") commands.expandAll();
            else commands.expand();
          } else {
            commands.expand();
          }
          break;
        case "Tab":
          event.preventDefault();
          if (event.shiftKey) commands.outdent();
          else commands.indent();
          break;
        case "Enter":
          event.preventDefault();
          commands.openDetail();
          break;
        case "F2":
          event.preventDefault();
          commands.rename();
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          commands.remove();
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commands, editingId, suspended]);
}

function FilterBar({
  filters,
  onToggleType,
  focusOnly,
  onToggleFocusOnly,
  byCategory,
  onToggleByCategory,
  commands,
  onAddResultArea,
  onAddGoal,
  hasSelection,
  onResetGrid,
}: {
  filters: OutlineFilters["types"];
  onToggleType: (type: NodeType) => void;
  focusOnly: boolean;
  onToggleFocusOnly: () => void;
  byCategory: boolean;
  onToggleByCategory: () => void;
  commands: Record<string, () => void>;
  onAddResultArea: () => void;
  onAddGoal: () => void;
  hasSelection: boolean;
  onResetGrid: () => void;
}) {
  return (
    // Scrolls sideways below `md` rather than wrapping into three rows, matching
    // `TabToolbar`. The buttons stay — several of them are the only tappable path to a
    // keyboard-only command.
    <div className="flex flex-none flex-nowrap items-center gap-x-4 gap-y-2 overflow-x-auto border-b border-rule px-3 py-2 md:flex-wrap md:overflow-x-visible">
      <div className="flex flex-none items-center gap-1">
        <Command onClick={onAddResultArea}>New result area</Command>
        <Command onClick={onAddGoal} disabled={!hasSelection}>
          New goal
        </Command>
        <Command onClick={commands.addSiblingAfter} disabled={!hasSelection}>
          Add sibling
        </Command>
        <Command onClick={commands.addChild} disabled={!hasSelection}>
          Add child
        </Command>
      </div>

      <span className="h-4 w-px flex-none bg-rule" aria-hidden />

      <div className="flex flex-none items-center gap-1">
        <Command onClick={commands.openDetail} disabled={!hasSelection} title="Enter">
          Open
        </Command>
        <Command onClick={commands.rename} disabled={!hasSelection} title="F2">
          Rename
        </Command>
      </div>

      <span className="h-4 w-px flex-none bg-rule" aria-hidden />

      <div className="flex flex-none items-center gap-1">
        <Command onClick={commands.outdent} disabled={!hasSelection} title="Shift+Tab">
          ←
        </Command>
        <Command onClick={commands.indent} disabled={!hasSelection} title="Tab">
          →
        </Command>
        <Command onClick={commands.moveUp} disabled={!hasSelection} title="Alt+Up">
          ↑
        </Command>
        <Command onClick={commands.moveDown} disabled={!hasSelection} title="Alt+Down">
          ↓
        </Command>
        <Command onClick={commands.remove} disabled={!hasSelection} title="Delete">
          Delete
        </Command>
        <Command onClick={commands.expandAll} title="Expand all (⌘→)">
          Expand all
        </Command>
        <Command onClick={commands.collapseAll} title="Collapse all (⌘←)">
          Collapse all
        </Command>
        <Command
          onClick={onResetGrid}
          title="Clear filters, sort, column layout and collapsed groups"
        >
          Reset this grid
        </Command>
      </div>

      <div className="ml-auto flex items-center gap-3 text-[0.8125rem] text-ink-muted">
        {(Object.keys(TYPE_LABELS) as NodeType[]).map((type) => (
          <Toggle
            key={type}
            checked={filters[type]}
            onChange={() => onToggleType(type)}
            label={`${TYPE_LABELS[type]}s`}
          />
        ))}
        <Toggle checked={focusOnly} onChange={onToggleFocusOnly} label="Focus only" />
        <Toggle
          checked={byCategory}
          onChange={onToggleByCategory}
          label="By category"
        />
      </div>
    </div>
  );
}

function Command({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="min-h-tap flex-none rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none whitespace-nowrap text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent md:min-h-0"
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-[var(--select-edge)]"
      />
      {label}
    </label>
  );
}

function EmptyState({
  filtered,
  onAddResultArea,
  onClearFilters,
}: {
  filtered: boolean;
  onAddResultArea: () => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {filtered ? (
        <>
          <p className="text-[0.9375rem] text-ink-muted">
            Every row is hidden by the current filters.
          </p>
          <Command onClick={onClearFilters}>Show everything</Command>
        </>
      ) : (
        <>
          <p className="max-w-sm text-[0.9375rem] text-ink-muted">
            Result areas are the major dimensions of your life — the roles the rest of
            the outline hangs from. Start with one.
          </p>
          <Command onClick={onAddResultArea}>New result area</Command>
        </>
      )}
    </div>
  );
}
