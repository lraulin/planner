"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OutlineNode } from "@/lib/tree/types";
import { categoryLabelFromGroupId } from "@/lib/tree/slice";
import { outlineGridRows } from "@/lib/tree/outlineRows";
import {
  allowedChildKinds,
  defaultChildType,
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
  outdentNodeAction,
  renameNodeAction,
  setAllCollapsedAction,
  setCollapsedAction,
  setDeadlineAction,
  setEffortAction,
  setFocusAction,
  setPriorityAction,
  setStateAction,
} from "@/app/plan/outline/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import { type MenuItem } from "@/components/grid/ContextMenu";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { openStateFilters } from "@/lib/grid/stateFilters";
import { shouldDiscardVirginInsert } from "@/lib/grid/virginInsert";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useOptimisticNodes } from "@/components/grid/useOptimisticNodes";
import { useStateChange } from "@/components/grid/useStateChange";
import { useToday } from "@/components/grid/useToday";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { collapsedAncestorIds } from "@/lib/tree/walkUp";
import { isInZoomBranch } from "@/lib/tree/zoom";
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
import { FileImportHost } from "@/components/import/FileImportHost";
import { AchieveTransferPanel } from "@/components/settings/AchieveTransferPanel";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";
import { useSuspendCommandKeys } from "@/components/shell/CommandProvider";
import { zoomBranch, zoomOutRoot } from "@/lib/tree/zoom";
import { owningProjectId } from "@/lib/tree/owningProject";
import { nodeDeleteMessage, nodeDeleteTitle } from "@/lib/tree/deleteMessage";
import { type GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { rowSwipeFor } from "@/lib/grid/rowSwipe";
import type { RowSwipe } from "@/components/grid/CompactRow";
import { pasteMoves, pasteRefusal } from "@/lib/grid/rowClipboard";
import { useRowClipboard } from "@/components/grid/RowClipboardProvider";
import { useAttachFromClipboard } from "@/components/grid/useAttachFromClipboard";
import { planNodeConversion, type ConversionPlan } from "@/lib/tree/conversion";
import { depthForOutlineLevel } from "@/lib/tree/outlineLevel";
import { lifecycleStateRefusal } from "@/lib/tree/lifecycle";

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
    filters: openStateFilters("state", "label", { includeBlanks: true }),
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
  const { attachFromClipboard, noticeDialog } = useAttachFromClipboard(apply);
  const {
    detail: detailId,
    select: selectId,
    zoom,
    setDetail: setDetailId,
    setZoom,
  } = useViewStateUrl();
  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * Row id opened for naming immediately after create. Escape with an empty draft discards
   * that insert (Achieve cancel-blank-row). F2 rename never sets this.
   */
  const [virginInsertId, setVirginInsertId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<readonly OutlineNode[]>([]);
  const [pendingConversion, setPendingConversion] = useState<{
    nodeId: string;
    targetKind: NodeKind;
  } | null>(null);
  const [zoomPickerOpen, setZoomPickerOpen] = useState(false);
  const [expandLevelPickerOpen, setExpandLevelPickerOpen] = useState(false);
  /** The row a new child is being added to, while its kind is being chosen. */
  const [pendingChildOf, setPendingChildOf] = useState<OutlineNode | null>(null);
  const today = useToday();
  const router = useRouter();
  const stateChange = useStateChange({ nodes, patch, apply });
  const { clipboard, pickUp, clear: clearClipboard } = useRowClipboard();

  const outlineColumns = useMemo(() => buildOutlineColumns(today), [today]);
  const views = useModuleViews({
    moduleId: "outline",
    builtIn: OUTLINE_VIEWS,
    defaultViewId: "outline",
    columns: outlineColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;
  const { sort: headerSort, clearSort: clearHeaderSort } = gridState;
  // `useGridState` returns a fresh object every render. Depend on the stable pieces it
  // memoises inside, not on `gridState` itself — a Set rebuilt every render was cascading
  // into `visible` → `navigable` → `copySelectionAsText` → command re-registration until
  // React hit max update depth and the sidebar stopped navigating.
  const switches = gridState.switches;
  const collapsedGroups = gridState.collapsedGroups;
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);

  const hiddenLevels = useMemo(
    () =>
      new Set(
        LEVEL_SWITCHES.filter(
          (entry) => !(switches[entry.id] ?? entry.defaultOn ?? false),
        ).map((entry) => entry.level),
      ),
    [switches],
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

  const flattened = useMemo(
    () => flattenLevels(zoomed.nodes, hiddenLevels),
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

  const preparedRows = useMemo(
    () => outlineGridRows(flattened, byCategory, byId),
    [flattened, byCategory, byId],
  );
  const { rows: gridRows, narrowingRows, visibleNodes: visible } = preparedRows;

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        outlineColumns,
        narrowingRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [outlineColumns, narrowingRows],
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
      if (row.kind === "group") insideCollapsed = collapsedGroups.has(row.id);
      else if (!insideCollapsed) out.push(row.node);
    }
    return out;
  }, [byCategory, visible, gridRows, collapsedGroups]);

  /**
   * What ↑/↓ and Shift-range walk: the rows **the grid is actually showing**.
   *
   * `navigable` above is this tab's own list, before `DataGrid` applies the column filters and
   * the search — and the Outline's default view filters out completed work. Stepping through
   * that list therefore walked rows that were not on screen, and a Shift-range could pick up
   * rows the user could not see. Harmless while the selection only highlighted; not harmless
   * now that the row menu prints its size and Delete acts on it.
   *
   * Seeded from `navigable` so the very first keystroke has an order to walk, before the grid
   * has rendered and reported. **Must be memoised** — an unmemoised fallback is a new array
   * every render, `capabilitiesFor` keys off its identity, and `useRegisterCommands` re-registers
   * until React hits max update depth and the sidebar stops navigating. That is why
   * `useNavigableIds` exists; every other host already uses it.
   */
  const fallbackIds = useMemo(() => navigable.map((n) => n.id), [navigable]);
  const { order: orderedIds, onIdsChange: setScreenIds } = useNavigableIds(fallbackIds);
  const multi = useMultiSelect(
    orderedIds,
    detailId ?? selectId ?? initialNodes[0]?.id ?? null,
  );
  const { selectedId, selectedIds, select, selectOne, move } = multi;

  // Back / forward and deep-links change `?detail=` / `?select=`. Sync selection during
  // render so the open drawer (or the View in Outline landing) has a selected owner
  // without an effect-driven cascade.
  const [seenDetailId, setSeenDetailId] = useState(detailId);
  if (detailId !== seenDetailId) {
    setSeenDetailId(detailId);
    if (detailId) selectOne(detailId);
  }
  const [seenSelectId, setSeenSelectId] = useState(selectId);
  if (selectId !== seenSelectId) {
    setSeenSelectId(selectId);
    if (selectId && byId.has(selectId)) selectOne(selectId);
  }

  // Reveal a `?select=` landing. Two steps, because they settle on different ticks:
  // 1. Expand collapsed ancestors (and persist) so the row can enter `orderedIds`.
  // 2. Re-select once the row is actually on screen. Selecting a still-hidden id is
  //    pruned to the first visible row (`useMultiSelect` / `pruneSelection`).
  const revealedSelectId = useRef<string | null>(null);
  const settledSelectId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectId) {
      revealedSelectId.current = null;
      settledSelectId.current = null;
      return;
    }
    if (revealedSelectId.current === selectId) return;
    if (!byId.has(selectId)) return;
    revealedSelectId.current = selectId;
    settledSelectId.current = null;
    for (const id of collapsedAncestorIds(nodes, selectId)) {
      patch(id, { collapsed: false });
      apply(() => setCollapsedAction(id, false));
    }
    if (zoom && !isInZoomBranch(nodes, zoom, selectId)) {
      setZoom(null, "replace");
    }
  }, [selectId, nodes, byId, patch, apply, zoom, setZoom]);

  useEffect(() => {
    if (!selectId || settledSelectId.current === selectId) return;
    if (!orderedIds.includes(selectId)) return;
    if (selectedId !== selectId) selectOne(selectId);
    settledSelectId.current = selectId;
  }, [selectId, orderedIds, selectedId, selectOne]);

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
      setVirginInsertId(id);
    },
    [selectOne],
  );

  const copySelectionAsText = useCallback(() => {
    // Walk the same order the arrows do (`orderedIds`), not a pre-filter list. Depend on
    // `byId` + ids rather than `navigable` so a transient row-array identity cannot rebuild
    // the command list every render (see `hiddenLevels` / `useRegisterCommands` above).
    const text = copyAsText(
      orderedIds
        .map((id) => byId.get(id))
        .filter((node): node is OutlineNode => node != null)
        .map((node) => ({
          id: node.id,
          name: node.name,
          depth: node.depth,
        })),
      selectedIds,
    );
    void writeClipboardText(text);
  }, [orderedIds, byId, selectedIds]);

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
    (targets: readonly OutlineNode[]) => {
      // Land on a row that will still be there. Taken from the *last* of the deleted rows so a
      // block delete leaves the cursor below the hole rather than inside it.
      const gone = new Set(targets.map((node) => node.id));
      const last = navigable.findIndex((n) => n.id === targets[targets.length - 1]?.id);
      const nextSelection =
        navigable.slice(last + 1).find((n) => !gone.has(n.id))?.id ??
        navigable
          .slice(0, Math.max(last, 0))
          .reverse()
          .find((n) => !gone.has(n.id))?.id ??
        null;
      selectOne(nextSelection);
      for (const node of targets) apply(() => deleteNodeAction(node.id));
    },
    [navigable, apply, selectOne],
  );

  /**
   * Everything the command surfaces can do, stated for **one particular row**.
   *
   * Parameterised rather than closed over the selection, because the toolbar and the row menu
   * are asking about different rows: right-clicking an unselected row selects it in the same
   * event, so the registered commands still describe the previous selection when the menu opens.
   * `useNodeCommandDeck` has had this shape all along; the Outline is the last host to adopt it,
   * and it is what finally gets Convert to, Priority and Zoom onto its right-click menu.
   *
   * Insert / open / rename / delete / move / indent / expand are commands with `bindings` —
   * `CommandKeys` fires them. This host only keeps selection navigation (arrows).
   */
  const capabilitiesFor = useCallback(
    (id: string | null, count: number): GridCommandCapabilities => {
      const node = id ? (byId.get(id) ?? null) : null;
      const siblings = node
        ? nodes.filter((entry) => entry.parentId === node.parentId)
        : [];
      const index = node ? siblings.findIndex((entry) => entry.id === node.id) : -1;
      const selectionIds = selectedIds.has(id ?? "")
        ? selectionMoveRoots(
            selectedIds,
            orderedIds,
            (entry) => byId.get(entry)?.parentId ?? null,
          )
        : id
          ? [id]
          : [];

      return {
        createKinds: ["result_area", "goal", "dream", "project", "task"],
        hierarchy: true,
        clipboard: {
          pickedUp: clipboard?.count ?? 0,
          pasteAfterRefusal: pasteRefusal(
            nodes,
            clipboard,
            id ? { at: "after", targetId: id } : null,
          ),
          pasteChildRefusal: pasteRefusal(
            nodes,
            clipboard,
            id ? { at: "child", targetId: id } : null,
          ),
        },
        conversionKinds: NODE_KINDS,
        outlineZoom: true,
        selection: {
          id,
          count,
          label: node?.name ?? null,
          kind: node ? kindOfNode(node) : undefined,
          state: node?.state,
          stateReason: lifecycleStateRefusal(
            selectionIds.flatMap((entry) => {
              const type = byId.get(entry)?.type;
              return type ? [type] : [];
            }),
          ),
          projectId: owningProjectId(nodes, id),
          hasTasks: node?.hasChildren === true,
          // Roots only: a child selected alongside its parent is already inside that parent's
          // branch, so deleting both would delete it twice and count it twice in the warning.
          // Same reduction the multi-row drag uses.
          ids: selectionIds,
          canMoveUp: index > 0,
          canMoveDown: index >= 0 && index < siblings.length - 1,
          canIndent: index > 0,
          canOutdent: node !== null && node.parentId !== null,
          canExpand: node?.hasChildren === true && node.collapsed,
          canCollapse: node?.hasChildren === true && !node.collapsed,
        },
        actions: {
          onCreate: (kind, mode) => {
            if (mode === "top") {
              if (kind === "result_area") addResultArea();
              else addTopKind(kind);
            } else if (mode === "before" || mode === "after") {
              addSibling(node, mode);
            } else {
              addChild(node);
            }
          },
          onOpen: (nodeId) => {
            selectOne(nodeId);
            setDetailId(nodeId);
          },
          onRename: (nodeId) => {
            selectOne(nodeId);
            setEditingId(nodeId);
          },
          onDelete: (nodeIds) => {
            setPendingDelete(
              nodeIds.map((nodeId) => byId.get(nodeId)).filter((n) => n !== undefined),
            );
          },
          onCopyAsText: copySelectionAsText,
          onAttachFromClipboard: attachFromClipboard,
          onMoveUp: (nodeId) => apply(() => moveNodeVerticallyAction(nodeId, "up")),
          onMoveDown: (nodeId) => apply(() => moveNodeVerticallyAction(nodeId, "down")),
          onIndent: (nodeId) => apply(() => indentNodeAction(nodeId)),
          onOutdent: (nodeId) => apply(() => outdentNodeAction(nodeId)),
          onExpand: (nodeId) => {
            const target = byId.get(nodeId);
            if (target) toggleCollapsed(target, false);
          },
          onCollapse: (nodeId) => {
            const target = byId.get(nodeId);
            if (target) toggleCollapsed(target, true);
          },
          onExpandAll: () => setTreeCollapsed(false),
          onCollapseAll: () => setTreeCollapsed(true),
          onExpandThroughLevel: (level) =>
            apply(() => expandThroughDepthAction(depthForOutlineLevel(level))),
          onChooseExpandThroughLevel: () => setExpandLevelPickerOpen(true),
          onConvert: (nodeId, kind) => {
            setPendingConversion({ nodeId, targetKind: kind });
          },
          // Same three navigations `useNodeCommandDeck` gives the list tabs, and the same
          // `useStateChange` bridge the State cell in this grid already uses.
          onSetState: (nodeIds, state) => {
            // One `request` per row: `useStateChange` cascades each branch and asks once per
            // row that would settle open work under it.
            for (const nodeId of nodeIds) {
              const target = byId.get(nodeId);
              if (target) stateChange.request(target, state, setStateAction);
            }
          },
          onCutRows: pickUp,
          onPasteRows: (targetId, at) => {
            const moves = pasteMoves(nodes, clipboard, { at, targetId });
            if (!moves) return;
            for (const move of moves) {
              apply(() =>
                moveNodeAction({
                  nodeId: move.nodeId,
                  parentId: move.parentId,
                  position: move.afterSiblingId
                    ? { at: "after", siblingId: move.afterSiblingId }
                    : { at: "first" },
                }),
              );
            }
            clearClipboard();
          },
          onScheduleBlock: (nodeId) => router.push(`/schedule?block=${nodeId}`),
          onViewTasks: (nodeId) => router.push(`/tasks?scope=${nodeId}`),
          onViewProject: (projectId) => router.push(`/projects?detail=${projectId}`),
          onZoomIn: (nodeId) => setZoom(nodeId, "push"),
          onZoomOut: () => setZoom(zoomOutRoot(nodes, zoom), "push"),
          onClearZoom: () => setZoom(null, "push"),
          onZoomToItem: () => setZoomPickerOpen(true),
        },
      };
    },
    [
      nodes,
      byId,
      selectedIds,
      orderedIds,
      addResultArea,
      addTopKind,
      addSibling,
      addChild,
      selectOne,
      setDetailId,
      copySelectionAsText,
      attachFromClipboard,
      apply,
      toggleCollapsed,
      setTreeCollapsed,
      setZoom,
      zoom,
      router,
      stateChange,
      clipboard,
      pickUp,
      clearClipboard,
    ],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  /*
   * Selection navigation only. The insert chords, ⏎, ⇧⏎, ⌫, Tab, ⌥↑/↓, collapse and the
   * rest used to live in a second `document` listener here; after the command surface work
   * they are also `bindings` on registered commands, so both listeners fired and ⌘⏎ created
   * two rows. Notes / list tabs already dropped the command half — the Outline was the hold-out.
   *
   * Dialogs are `role="dialog"` / `alertdialog`, so `isModalOpen` covers them. The inline
   * rename is not, so it suspends the dispatcher the same way the other grids do.
   */
  useSuspendCommandKeys(editingId !== null);
  useOutlineSelectionKeys({ move, editingId });

  /**
   * Right-click menu, built from the registry for *this* row.
   *
   * Not the toolbar's command list: the toolbar's is about the selected row, and right-clicking a
   * row that is not selected has to offer commands about the row under the pointer. So the same
   * capabilities are restated for that row and `rowMenuSections` decides what appears.
   *
   * This used to build a **second, narrower** capabilities object of its own — no
   * `priorityMaintenance`, no `conversionKinds`, no `outlineZoom` — so the one view that has
   * Convert to, priority repair and zoom offered none of them on right-click. The richest view
   * had the poorest menu. Sharing `capabilitiesFor` is what fixed it, and is why there is now
   * nowhere for the two to drift apart again.
   */
  const rowMenu = useCallback(
    (nodeId: string | null): MenuItem[] => {
      // Multi-select survives a right-click on a row already in the selection, so the plural
      // commands still say how many they are about to act on.
      const count =
        nodeId && selectedIds.has(nodeId) ? selectedIds.size : nodeId ? 1 : 0;
      return rowMenuFor(capabilitiesFor(nodeId, count));
    },
    [capabilitiesFor, selectedIds],
  );

  /**
   * Swipe, from the same capabilities — right completes, left deletes behind the confirmation
   * this view already owns. `1` rather than the selection size: see `useNodeCommandDeck`, one
   * finger aims at one row.
   *
   * Drag-to-reorder is off below `md` (`responsive.md`), so the compact Outline row has a free
   * horizontal axis and nothing to fight over.
   */
  const rowSwipe = useCallback(
    (nodeId: string): RowSwipe => rowSwipeFor(capabilitiesFor(nodeId, 1)),
    [capabilitiesFor],
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
        // The same plan the server will compute, applied straight to the rows so the ranks do
        // not flicker through their old values while the round trip is in flight. The server
        // is the authority; this is only what the eye sees in the meantime.
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
              // Likewise the priority slot: only the first root lands there, and the rest
              // follow it, appending in order behind it.
              priorityPlacement: previousId === null && priSlot ? priSlot : undefined,
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
      onExpand: (id) => {
        const node = byId.get(id);
        if (!node) return;
        toggleCollapsed(node, false);
      },
    };
  }, [
    byId,
    byCategory,
    nodes,
    apply,
    patch,
    headerSort,
    clearHeaderSort,
    selectOne,
    toggleCollapsed,
  ]);

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
        const index = orderedIds.indexOf(id);
        const nextSelection =
          orderedIds.slice(index + 1).find((entry) => entry !== id) ??
          orderedIds
            .slice(0, Math.max(index, 0))
            .reverse()
            .find((entry) => entry !== id) ??
          null;
        selectOne(nextSelection);
        apply(() => deleteNodeAction(id));
      },
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
      virginInsertId,
      byId,
      orderedIds,
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
        narrowingRows={narrowingRows}
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
        onNavigableIdsChange={setScreenIds}
        rowMenu={rowMenu}
        rowSwipe={rowSwipe}
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
          apply(() => expandThroughDepthAction(depthForOutlineLevel(level)));
        }}
        onCancel={() => setExpandLevelPickerOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete.length > 0}
        title={nodeDeleteTitle(pendingDelete)}
        message={nodeDeleteMessage(pendingDelete)}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const targets = pendingDelete;
          setPendingDelete([]);
          confirmDelete(targets);
        }}
        onCancel={() => setPendingDelete([])}
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

      {noticeDialog}

      <FileImportHost
        commandId="import.achieve"
        label="Import Achieve XML…"
        keywords="achieve xml backup restore merge replace"
        title="Import Achieve XML"
        width="max-w-2xl"
      >
        <AchieveTransferPanel embedded />
      </FileImportHost>
    </div>
  );
}

/**
 * Selection navigation for the outline.
 *
 * Bound to the document rather than the grid: the outline is the whole page, so arrows
 * should work immediately instead of requiring a click to focus the list first. Anything
 * typed into a field is left alone. Command chords (⌘⏎, ⏎, Tab, …) belong to
 * `CommandKeys` — keeping a second copy here was what made ⌘⏎ create two rows.
 */
function useOutlineSelectionKeys({
  move,
  editingId,
}: {
  move: (delta: number, extend: boolean) => void;
  editingId: string | null;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editingId) return;
      if (isModalOpen()) return;
      if (isTypingTarget(event.target)) return;
      // ⌥↑/↓ is Move up / Move down — a registered command. Leave it for the dispatcher.
      if (event.altKey) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [move, editingId]);
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
