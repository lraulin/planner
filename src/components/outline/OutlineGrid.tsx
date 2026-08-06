"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  NODE_KINDS,
  type NodeKind,
} from "@/lib/tree/hierarchy";
import {
  resolveCategoryGroupDrop,
  resolveDrop,
  withRootCategoryFromPlacement,
} from "@/lib/tree/dnd";
import {
  planSiblingPriorityDrop,
  priorityDropFromPosition,
} from "@/lib/tree/outlinePriority";
import {
  createNodeAction,
  convertNodeAction,
  expandThroughDepthAction,
  deleteNodeAction,
  indentNodeAction,
  moveNodeAction,
  moveNodeVerticallyAction,
  removePriorityGapsAction,
  reprioritizeUniqueAction,
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
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { GridToolbar, switchValue } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { openStateFilters } from "@/lib/grid/stateFilters";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useOptimisticNodes } from "@/components/grid/useOptimisticNodes";
import { useStateChange } from "@/components/grid/useStateChange";
import { useToday } from "@/components/grid/useToday";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import {
  flattenLevels,
  LEVEL_LABELS,
  type FlattenableLevel,
} from "@/lib/tree/flattenLevels";
import { selectionMoveRoots } from "@/lib/grid/selection";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { HintBar } from "./HintBar";
import { NewChildDialog } from "./NewChildDialog";
import { ConversionDialog } from "./ConversionDialog";
import { ExpandLevelDialog, OutlineZoomDialog } from "./OutlineCommandDialogs";
import {
  buildOutlineColumns,
  OUTLINE_COLUMN_IDS,
  type OutlineColumnCtx,
} from "./outlineColumns";
import { isTypingTarget } from "@/lib/keyboard";
import { zoomBranch, zoomOutRoot } from "@/lib/tree/zoom";
import {
  buildGridCommands,
  type GridCommandCapabilities,
} from "@/lib/grid/commandDeck";
import { planNodeConversion, type ConversionPlan } from "@/lib/tree/conversion";

/**
 * Achieve's Areas and Goals checkboxes: **on means the level exists.** Turning one off
 * dissolves it and promotes its children — see `lib/tree/flattenLevels.ts` for why that is
 * a different question from filtering, and not the thing the old type checkboxes did.
 */
const LEVEL_SWITCHES = [
  {
    id: "levelAreas",
    level: "result_area" as FlattenableLevel,
    label: LEVEL_LABELS.result_area,
    defaultOn: true,
    title: "Off: goals and projects rise to the top level",
  },
  {
    id: "levelGoals",
    level: "goal" as FlattenableLevel,
    label: LEVEL_LABELS.goal,
    defaultOn: true,
    title: "Off: projects rise to sit directly under their result area",
  },
];

/**
 * The Outline has one built-in view, and that is not a placeholder.
 *
 * Achieve's Outline is a single arrangement of everything; the per-type lists are the Projects,
 * Goals and Tasks modules. What the Outline *does* need is somewhere to keep the setups you
 * arrive at by hand — the levels dissolved, the states shown, a column set — which is what
 * saved views are for. So: one preset, and as many of your own as you like.
 */
const OUTLINE_VIEWS = [{ id: "outline", label: "Full Outline" }] as const;

function viewDefaults(): GridDefaults {
  return {
    order: [...OUTLINE_COLUMN_IDS],
    /**
     * The Outline opens with finished work hidden — Achieve's default, and what the old
     * `Show completed` checkbox did. It is an ordinary State filter now: it says so in the
     * chip bar, `Clear all` removes it, and `Reset this grid` brings it back. That is the
     * whole difference between a default and a mode.
     */
    filters: openStateFilters("state", "label"),
  };
}

/**
 * Outline tab host: tree commands, the completed filter, drawer, and the shared DataGrid
 * with the outline's column set. Optional "By category" lays group headers over the tree
 * and lets root result areas change category by drag.
 *
 * Filtering by type or focus is not here — those are the `type` / `icon` and `focus`
 * columns, filtered from their column menus like everything else.
 */
export function OutlineGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const { nodes, byId, patch, apply, error } = useOptimisticNodes(initialNodes);
  const { detail: detailId, zoom, setDetail: setDetailId, setZoom } = useViewStateUrl();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OutlineNode | null>(null);
  const [pendingConversion, setPendingConversion] = useState<{
    nodeId: string;
    targetKind: NodeKind;
  } | null>(null);
  const [zoomPickerOpen, setZoomPickerOpen] = useState(false);
  const [expandLevelPickerOpen, setExpandLevelPickerOpen] = useState(false);
  /** The row a new child is being added to, while its kind is being chosen. */
  const [pendingChildOf, setPendingChildOf] = useState<OutlineNode | null>(null);
  const today = useToday();
  const stateChange = useStateChange({ nodes, patch, apply });

  const outlineColumns = useMemo(() => buildOutlineColumns(today), [today]);
  const views = useModuleViews({
    moduleId: "outline",
    builtIn: OUTLINE_VIEWS,
    defaultViewId: "outline",
    // The Outline had no view picker before, so its stored layout lives at `grid:outline`.
    // Gaining one must not move it. See the option's own note.
    defaultViewSharesModuleScope: true,
    columns: outlineColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;
  const { sort: headerSort, clearSort: clearHeaderSort } = gridState;
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);

  const hiddenLevels = useMemo(
    () =>
      new Set(
        LEVEL_SWITCHES.filter((entry) => !switchValue(gridState, entry)).map(
          (entry) => entry.level,
        ),
      ),
    [gridState],
  );

  /**
   * Any dissolved level, then the rows the tree itself hides (an ancestor is collapsed).
   *
   * That order matters: a collapsed row that the switch just dissolved is gone, so it can no
   * longer hide its children — `flattenLevels` works out which ancestors are still standing
   * and re-sets `hidden` before we drop anything.
   *
   * Nothing else is dropped here any more. Completed rows used to be, along with their whole
   * subtree; completing a node now settles the work under it, so an ordinary State filter
   * removes a finished branch on its own — no special case, and it shows as a chip.
   */
  const zoomed = useMemo(() => zoomBranch(nodes, zoom), [nodes, zoom]);
  useEffect(() => {
    if (zoomed.stale) setZoom(null, "replace");
  }, [zoomed.stale, setZoom]);

  const visible = useMemo(
    () => flattenLevels(zoomed.nodes, hiddenLevels).filter((node) => !node.hidden),
    [zoomed.nodes, hiddenLevels],
  );

  /**
   * The outline is the tree itself, so its rows are a flat list at tree depth. Grouping by
   * Category lays headers over that without disturbing it — see `groupByCategory`.
   *
   * It is the standard `Group by` picker rather than a bespoke toggle, per `data-grid.md`:
   * a tab's arrangement is its `groupBy`. Category is the only dimension the Outline offers,
   * because everything else worth grouping by is already a level of the tree.
   */
  const byCategory = gridState.groupBy.includes("category");

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

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        outlineColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [outlineColumns, gridRows],
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

  const conversionPlan = useMemo<ConversionPlan | null>(() => {
    if (!pendingConversion) return null;
    const source = byId.get(pendingConversion.nodeId);
    if (!source) return null;
    return planNodeConversion({
      nodeId: source.id,
      sourceKind: kindOfNode(source),
      targetKind: pendingConversion.targetKind,
      nodes,
    });
  }, [pendingConversion, byId, nodes]);

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

  const addTopKind = useCallback(
    (kind: NodeKind) => {
      apply(
        () => createNodeAction({ parentId: null, kind, position: { at: "last" } }),
        startNaming,
      );
    },
    [apply, startNaming],
  );

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

  const commandCapabilities = useMemo<GridCommandCapabilities>(() => {
    const siblings = selected
      ? nodes.filter((node) => node.parentId === selected.parentId)
      : [];
    const index = selected ? siblings.findIndex((node) => node.id === selected.id) : -1;
    return {
      createKinds: ["result_area", "goal", "dream", "project", "task"],
      hierarchy: true,
      priorityMaintenance: true,
      conversionKinds: NODE_KINDS,
      outlineZoom: true,
      selection: {
        id: selectedId,
        count: selectedIds.size,
        label: selected?.name ?? null,
        kind: selected ? kindOfNode(selected) : undefined,
        canMoveUp: index > 0,
        canMoveDown: index >= 0 && index < siblings.length - 1,
        canIndent: index > 0,
        canOutdent: selected?.parentId !== null,
        canExpand: selected?.hasChildren === true && selected.collapsed,
        canCollapse: selected?.hasChildren === true && !selected.collapsed,
      },
      actions: {
        onCreate: (kind, mode) => {
          if (mode === "top") {
            if (kind === "result_area") addResultArea();
            else addTopKind(kind);
          } else if (mode === "before" || mode === "after") {
            addSibling(selected, mode);
          } else {
            addChild(selected);
          }
        },
        onOpen: (id) => {
          selectOne(id);
          setDetailId(id);
        },
        onRename: (id) => {
          selectOne(id);
          setEditingId(id);
        },
        onDelete: (id) => {
          const node = byId.get(id);
          if (node) setPendingDelete(node);
        },
        onCopyAsText: copySelectionAsText,
        onMoveUp: (id) => apply(() => moveNodeVerticallyAction(id, "up")),
        onMoveDown: (id) => apply(() => moveNodeVerticallyAction(id, "down")),
        onIndent: (id) => apply(() => indentNodeAction(id)),
        onOutdent: (id) => apply(() => outdentNodeAction(id)),
        onExpand: (id) => {
          const node = byId.get(id);
          if (node) toggleCollapsed(node, false);
        },
        onCollapse: (id) => {
          const node = byId.get(id);
          if (node) toggleCollapsed(node, true);
        },
        onExpandAll: () => setTreeCollapsed(false),
        onCollapseAll: () => setTreeCollapsed(true),
        onExpandThroughLevel: (level) => apply(() => expandThroughDepthAction(level)),
        onChooseExpandThroughLevel: () => setExpandLevelPickerOpen(true),
        onRemovePriorityGaps: () =>
          selectedId && apply(() => removePriorityGapsAction(selectedId)),
        onReprioritizeUnique: (id) => apply(() => reprioritizeUniqueAction(id)),
        onConvert: (id, kind) => {
          setPendingConversion({ nodeId: id, targetKind: kind });
        },
        onZoomIn: (id) => setZoom(id, "push"),
        onZoomOut: () => setZoom(zoomOutRoot(nodes, zoom), "push"),
        onClearZoom: () => setZoom(null, "push"),
        onZoomToItem: () => setZoomPickerOpen(true),
      },
    };
  }, [
    selected,
    nodes,
    selectedId,
    selectedIds,
    byId,
    addResultArea,
    addTopKind,
    addSibling,
    addChild,
    selectOne,
    setDetailId,
    copySelectionAsText,
    apply,
    toggleCollapsed,
    setTreeCollapsed,
    setZoom,
    zoom,
  ]);

  const suspended =
    detailId !== null ||
    pendingDelete !== null ||
    pendingChildOf !== null ||
    pendingConversion !== null ||
    zoomPickerOpen ||
    expandLevelPickerOpen;
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

      const kind = kindOfNode(node);
      const rowCommands = buildGridCommands({
        createKinds: [kind],
        hierarchy: true,
        selection: {
          id: nodeId,
          count: selectedIds.has(nodeId) ? selectedIds.size : 1,
          canMoveUp: index > 0,
          canMoveDown: index < siblings.length - 1,
          canIndent: index > 0,
          canOutdent: node.parentId !== null,
          canExpand: node.hasChildren && node.collapsed,
          canCollapse: node.hasChildren && !node.collapsed,
        },
        actions: {
          onCreate: (_kind, mode) => {
            if (mode === "before") command.addSiblingBefore();
            else if (mode === "after") command.addSiblingAfter();
            else if (mode === "child") command.addChild();
          },
          onOpen: () => command.openDetail(),
          onRename: () => command.rename(),
          onCopyAsText: copySelectionAsText,
          onDelete: () => command.remove(),
          onMoveUp: () => command.moveUp(),
          onMoveDown: () => command.moveDown(),
          onIndent: () => command.indent(),
          onOutdent: () => command.outdent(),
          onExpand: () => command.expand(),
          onCollapse: () => command.collapse(),
        },
      }).filter((entry) =>
        [
          "record.open",
          "record.rename",
          "record.copy-as-text",
          "grid.create.after",
          "grid.create.before",
          "grid.create.child",
          "record.indent",
          "record.outdent",
          "record.move-up",
          "record.move-down",
          "record.expand-collapse",
          "record.delete",
        ].includes(entry.id),
      );

      return rowCommands.map((entry) => ({
        label: entry.label,
        shortcut: entry.shortcut,
        title: entry.title,
        disabled: entry.disabled,
        destructive: entry.destructive,
        onSelect: entry.run,
      }));
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
   * Achieve-style drag: drop targets resolve by row identity (no need to clear sort first).
   * Sibling before/after also rewrites priority letter/rank among the destination parent's
   * children. Inside reparent only moves structure. A priority header sort stays on so the
   * renumber is what you see; any other column sort is cleared so a non-priority view does
   * not hide the new order.
   */
  const rowDrag: RowDrag | undefined = useMemo(() => {
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

        // Priority sort is the Achieve default and matches sibling renumber; other sorts hide it.
        if (headerSort && headerSort.columnId !== "priority") clearHeaderSort();

        const placement = drop;
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
          for (const assignment of priorityPlan) {
            lastResult = await setPriorityAction(
              assignment.id,
              assignment.letter,
              assignment.rank,
            );
            if (!lastResult.ok) return lastResult;
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
  }, [byId, byCategory, nodes, apply, patch, headerSort, clearHeaderSort, selectOne]);

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
      // Settling a row settles the open work under it, and re-opening one re-opens the
      // settled rows above it — see `useStateChange`, which also owns the confirmation.
      onStateChange: (node, state) => stateChange.request(node, state, setStateAction),
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
      stateChange,
    ],
  );

  const detailNode = detailId ? (byId.get(detailId) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Outline"
        allColumns={outlineColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        switches={LEVEL_SWITCHES}
        groupDimensions={["category"]}
        groupIds={groupIds}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      {zoom && !zoomed.stale && (
        <div className="flex flex-none items-center gap-2 border-b border-rule bg-surface-raised/50 px-3 py-1 text-[0.75rem] text-ink-muted">
          <span className="font-medium text-ink">Zoomed outline</span>
          <span className="truncate">{byId.get(zoom)?.name ?? "Selected branch"}</span>
          <button
            type="button"
            onClick={() => setZoom(null, "push")}
            className="ml-auto text-ink underline decoration-ink-faint underline-offset-2 hover:text-ink"
          >
            Clear zoom
          </button>
        </div>
      )}

      <DataGrid
        rows={gridRows}
        columns={gridState.columns}
        allColumns={outlineColumns}
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
        sorts={gridState.sorts}
        onSortChange={gridState.toggleSort}
        onSetSort={gridState.setSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        onGroupIdsChange={setGroupIds}
        density={gridState.density}
        empty={
          <EmptyState
            filtered={nodes.length > 0}
            onAddResultArea={addResultArea}
            onClearFilters={gridState.clearFilters}
          />
        }
      />

      <HintBar />

      <NodeDetailDrawer
        node={detailNode}
        nodes={nodes}
        onClose={() => setDetailId(null)}
      />

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

      {pendingConversion && (
        <ConversionDialog
          open
          nodeName={byId.get(pendingConversion.nodeId)?.name ?? ""}
          targetKind={pendingConversion.targetKind}
          plan={conversionPlan}
          onConfirm={() => {
            const target = pendingConversion;
            setPendingConversion(null);
            apply(() => convertNodeAction(target.nodeId, target.targetKind));
          }}
          onCancel={() => setPendingConversion(null)}
        />
      )}

      {zoomPickerOpen && (
        <OutlineZoomDialog
          open
          nodes={nodes}
          initialId={zoom}
          onConfirm={(nodeId) => {
            setZoomPickerOpen(false);
            setZoom(nodeId, "push");
          }}
          onCancel={() => setZoomPickerOpen(false)}
        />
      )}

      <ExpandLevelDialog
        open={expandLevelPickerOpen}
        onConfirm={(level) => {
          setExpandLevelPickerOpen(false);
          apply(() => expandThroughDepthAction(level));
        }}
        onCancel={() => setExpandLevelPickerOpen(false)}
      />

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

      {stateChange.prompt && (
        <ConfirmDialog
          open
          title={stateChange.prompt.title}
          message={stateChange.prompt.message}
          confirmLabel={stateChange.prompt.confirmLabel}
          onConfirm={stateChange.confirm}
          onCancel={stateChange.cancel}
        />
      )}
    </div>
  );
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
