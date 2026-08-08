"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  convertNodeAction,
  createNodeAction,
  deleteNodeAction,
  moveNodeAction,
  removePriorityGapsAction,
  reprioritizeUniqueAction,
} from "@/app/outline/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { ConversionDialog } from "@/components/outline/ConversionDialog";
import { nodeDeleteMessage, nodeDeleteTitle } from "@/lib/tree/deleteMessage";
import { NODE_KINDS, kindOfNode, type NodeKind } from "@/lib/tree/hierarchy";
import { owningProjectId } from "@/lib/tree/owningProject";
import { selectionMoveRoots } from "@/lib/grid/selection";
import { pasteMoves, pasteRefusal } from "@/lib/grid/rowClipboard";
import { useRowClipboard } from "./RowClipboardProvider";
import type { NodeState } from "@/db/schema";
import { planNodeConversion, type ConversionPlan } from "@/lib/tree/conversion";
import type { ActionResult } from "./useOptimisticNodes";
import type { OutlineNode } from "@/lib/tree/types";
import type { CreateMode, GridCommandCapabilities } from "@/lib/grid/commandDeck";
import type { MenuItem } from "./ContextMenu";
import type { RowSwipe } from "./CompactRow";
import { rowMenuFor } from "./rowMenu";
import { rowSwipeFor } from "./rowSwipe";

/** Shared non-structural commands for list views that are projections of the outline. */
export function useNodeCommandDeck({
  nodes,
  selectedId,
  selectedIds,
  apply,
  create,
  onOpen,
  onRename,
  onCopyAsText,
  onStateChange,
}: {
  nodes: readonly OutlineNode[];
  selectedId: string | null;
  selectedIds: ReadonlySet<string>;
  apply: (
    action: () => Promise<ActionResult>,
    onSuccess?: (id?: string) => void,
  ) => void;
  /**
   * What this module can create, if anything. Omitted leaves the grid read-only in the sense
   * that matters here — it can still edit and delete rows, it just cannot originate them.
   *
   * `New <kind>` files at the **top level** (or under `parentId`, see below) rather than beside
   * the cursor: a module is a list of one kind of thing, and creating relative to whatever
   * happened to be selected is Achieve's behaviour and its most-reported confusion. Filing a row
   * under another is the separate, explicitly-named `New subtask`.
   */
  create?: {
    /** The kinds offered. The first is what the toolbar button makes. */
    kinds: readonly NodeKind[];
    /**
     * Where a top-level create lands, when the module is narrowed to a branch. Tasks scoped to
     * a project makes tasks *in that project* — otherwise `New task` would file a row the view
     * it was made from cannot show.
     */
    parentId?: string | null;
    /** Offer `New subtask` / `New subproject` under the selected row. */
    child?: boolean;
    /** Select the new row and open its name for typing. `useGridTab.startNaming`. */
    onCreated?: (id?: string) => void;
  };
  onOpen: (id: string) => void;
  onRename: (id: string) => void;
  /**
   * Copy as text. Here rather than registered separately by `useGridTab`, so that one capabilities
   * object describes everything these grids can do — which is what lets the row menu be derived
   * from it instead of written out again.
   */
  onCopyAsText: () => void;
  /**
   * The host's `useStateChange` bridge — `useGridTab` already exposes exactly this shape as
   * `cellHandlers.onStateChange`. Taking it rather than calling `setStateAction` here is what
   * keeps `Complete` on the menu and the State cell on the same code path, cascade,
   * confirmation and all.
   */
  onStateChange: (node: OutlineNode, state: NodeState) => void;
}): {
  capabilities: GridCommandCapabilities;
  rowMenu: (nodeId: string | null) => MenuItem[];
  /**
   * Swipe gestures for a compact row: right completes, left deletes behind the confirmation
   * this hook already renders. Hosts pass it straight to `DataGrid`; it is ignored above `md`.
   */
  rowSwipe: (nodeId: string) => RowSwipe;
  /** The conversion and delete confirmations. Hosts render this once, anywhere in their tree. */
  dialogs: ReactNode;
} {
  const [pendingConversion, setPendingConversion] = useState<{
    nodeId: string;
    targetKind: NodeKind;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<readonly OutlineNode[]>([]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const router = useRouter();
  const { clipboard, pickUp, clear: clearClipboard } = useRowClipboard();

  const onConvert = useCallback((id: string, targetKind: NodeKind) => {
    setPendingConversion({ nodeId: id, targetKind });
  }, []);

  /*
   * Read as fields rather than kept as one object, because everything downstream keys off
   * identity: a `create={{ … }}` literal is a fresh object every render, and `capabilitiesFor`
   * would rebuild the whole command list with it. The fields are primitives and stable
   * references, so hosts can write the literal inline and nothing churns.
   */
  const createKinds = create?.kinds;
  const createParentId = create?.parentId ?? null;
  const createChild = create?.child;
  const onCreated = create?.onCreated;

  /**
   * The actions, independent of which row is selected.
   *
   * Split out from `capabilities` so `rowMenu` can reuse it with a *different* selection. Priority
   * repair is the one action that needs the row id, so it takes it as an argument here rather than
   * closing over `selectedId` the way it used to — otherwise a right-click on an unselected row
   * would repair the selected row's sibling group instead.
   */
  const actions = useMemo(
    () => ({
      onOpen,
      onRename,
      onCopyAsText,
      onRemovePriorityGaps: () => {},
      onReprioritizeUnique: (id: string) => apply(() => reprioritizeUniqueAction(id)),
      onConvert,
      onSetState: (ids: readonly string[], state: NodeState) => {
        // One `request` per row. `useStateChange` cascades each branch and asks once per row
        // that would settle open work underneath it — which is the honest prompt: two projects
        // with children are two separate "and everything under it?" questions.
        for (const id of ids) {
          const node = byId.get(id);
          if (node) onStateChange(node, state);
        }
      },
      /*
       * Delete. Five modules had none at all — no toolbar button, no menu row, no `⌘K` entry —
       * so a task created on `/tasks` could only be removed by going to the Outline and finding
       * it there. Every other item verb these grids offer (New, Rename, Convert) works in place.
       *
       * Owned here rather than by each host for the same reason the conversion dialog is: one
       * confirmation, one branch warning, five callers.
       */
      onDelete: (ids: readonly string[]) => {
        setPendingDelete(
          ids.map((id) => byId.get(id)).filter((node) => node !== undefined),
        );
      },
      onCutRows: pickUp,
      /*
       * Paste is `moveNode` per row and nothing else — Achieve's `Pickup Row(s)` marks rows to
       * be *relocated*, and that mutation already exists with its cycle and nesting checks.
       *
       * The buffer is cleared on success: rows that have moved are no longer picked up, and a
       * second paste would try to move them again from wherever they now are.
       */
      onPasteRows: (targetId: string, at: "after" | "child") => {
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
      /*
       * The three cross-module verbs, implemented once here rather than five times in the hosts.
       *
       * All three are plain navigations, which is the point: `?scope=` and `?detail=` are already
       * the app's addressable state, so `View tasks…` is the Tasks module the user could have
       * reached by hand — reload and Back both work — rather than a mode this grid pushes into
       * another one.
       */
      onScheduleBlock: (id: string) => router.push(`/schedule?block=${id}`),
      onViewTasks: (id: string) => router.push(`/tasks?scope=${id}`),
      onViewProject: (projectId: string) =>
        router.push(`/projects?detail=${projectId}`),
    }),
    [
      apply,
      byId,
      nodes,
      clipboard,
      pickUp,
      clearClipboard,
      onConvert,
      onOpen,
      onRename,
      onCopyAsText,
      onStateChange,
      router,
    ],
  );

  const capabilitiesFor = useCallback(
    (id: string | null, count: number): GridCommandCapabilities => {
      const node = id ? (byId.get(id) ?? null) : null;
      return {
        createKinds,
        createChild,
        priorityMaintenance: true,
        conversionKinds: NODE_KINDS,
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
        selection: {
          id,
          count,
          label: node?.name ?? null,
          kind: node ? kindOfNode(node) : undefined,
          state: node?.state,
          projectId: owningProjectId(nodes, id),
          // `hasChildren` is the honest proxy: if nothing is filed under this row there are no
          // tasks to scope to, whatever level the row sits at.
          hasTasks: node?.hasChildren === true,
          // Roots only: a child selected alongside its parent is already inside that parent's
          // branch, so deleting both would delete it twice and count it twice in the warning.
          ids:
            id && selectedIds.has(id)
              ? selectionMoveRoots(
                  selectedIds,
                  // Tree order rather than screen order. These tabs re-base depth and filter
                  // rows, so the on-screen list is not the tree — but the roots are a property
                  // of ancestry, and the full tree is the one ordering that contains every
                  // selected id whatever the view is showing.
                  nodes.map((entry) => entry.id),
                  (entry) => byId.get(entry)?.parentId ?? null,
                )
              : id
                ? [id]
                : [],
        },
        actions: {
          ...actions,
          onRemovePriorityGaps: () => {
            if (id) apply(() => removePriorityGapsAction(id));
          },
          /*
           * Bound to the row this capability set is *about*, not to the selection: the row menu
           * asks about the row that was right-clicked, and `New subtask` there has to file the
           * task under that row.
           *
           * Undefined when the module declares no `create`, which is what keeps the New commands
           * out of the deck entirely rather than greyed.
           */
          onCreate: createKinds
            ? (kind: NodeKind, mode: CreateMode) => {
                const parentId = mode === "child" ? id : createParentId;
                if (mode === "child" && !parentId) return;
                apply(
                  () => createNodeAction({ parentId, kind, position: { at: "last" } }),
                  onCreated,
                );
              }
            : undefined,
        },
      };
    },
    [
      actions,
      apply,
      byId,
      nodes,
      selectedIds,
      clipboard,
      createKinds,
      createChild,
      createParentId,
      onCreated,
    ],
  );

  const capabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (nodeId: string | null): MenuItem[] => {
      // Multi-select survives a right-click on a row already in the selection, so `Copy as text`
      // still says how many it is about to copy.
      const count =
        nodeId && selectedIds.has(nodeId) ? selectedIds.size : nodeId ? 1 : 0;
      return rowMenuFor(capabilitiesFor(nodeId, count));
    },
    [capabilitiesFor, selectedIds],
  );

  /**
   * `1`, deliberately, where `rowMenu` passes the selection size.
   *
   * A swipe is aimed at one row with one finger. Reading the selection would let a gesture on
   * a row that happens to still be in a multi-select delete five rows, with a rail that said
   * "Delete" in the singular — the gesture would have been honest about the row and lied
   * about the scope.
   */
  const rowSwipe = useCallback(
    (nodeId: string): RowSwipe => rowSwipeFor(capabilitiesFor(nodeId, 1)),
    [capabilitiesFor],
  );

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
  }, [byId, nodes, pendingConversion]);

  const deleteDialog = (
    <ConfirmDialog
      open={pendingDelete.length > 0}
      title={nodeDeleteTitle(pendingDelete)}
      message={nodeDeleteMessage(pendingDelete)}
      confirmLabel="Delete"
      destructive
      onConfirm={() => {
        const targets = pendingDelete;
        setPendingDelete([]);
        for (const target of targets) apply(() => deleteNodeAction(target.id));
      }}
      onCancel={() => setPendingDelete([])}
    />
  );

  const conversionDialog = pendingConversion ? (
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
  ) : null;

  return {
    capabilities,
    rowMenu,
    rowSwipe,
    dialogs: (
      <>
        {deleteDialog}
        {conversionDialog}
      </>
    ),
  };
}
