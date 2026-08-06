"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  convertNodeAction,
  removePriorityGapsAction,
  reprioritizeUniqueAction,
} from "@/app/outline/actions";
import { ConversionDialog } from "@/components/outline/ConversionDialog";
import { NODE_KINDS, kindOfNode, type NodeKind } from "@/lib/tree/hierarchy";
import { planNodeConversion, type ConversionPlan } from "@/lib/tree/conversion";
import type { ActionResult } from "./useOptimisticNodes";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import type { MenuItem } from "./ContextMenu";
import { rowMenuFor } from "./rowMenu";

/** Shared non-structural commands for list views that are projections of the outline. */
export function useNodeCommandDeck({
  nodes,
  selectedId,
  selectedIds,
  apply,
  onOpen,
  onRename,
  onCopyAsText,
}: {
  nodes: readonly OutlineNode[];
  selectedId: string | null;
  selectedIds: ReadonlySet<string>;
  apply: (action: () => Promise<ActionResult>) => void;
  onOpen: (id: string) => void;
  onRename: (id: string) => void;
  /**
   * Copy as text. Here rather than registered separately by `useGridTab`, so that one capabilities
   * object describes everything these grids can do — which is what lets the row menu be derived
   * from it instead of written out again.
   */
  onCopyAsText: () => void;
}): {
  capabilities: GridCommandCapabilities;
  rowMenu: (nodeId: string | null) => MenuItem[];
  conversionDialog: ReactNode;
} {
  const [pendingConversion, setPendingConversion] = useState<{
    nodeId: string;
    targetKind: NodeKind;
  } | null>(null);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const onConvert = useCallback((id: string, targetKind: NodeKind) => {
    setPendingConversion({ nodeId: id, targetKind });
  }, []);

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
    }),
    [apply, onConvert, onOpen, onRename, onCopyAsText],
  );

  const capabilitiesFor = useCallback(
    (id: string | null, count: number): GridCommandCapabilities => {
      const node = id ? (byId.get(id) ?? null) : null;
      return {
        priorityMaintenance: true,
        conversionKinds: NODE_KINDS,
        selection: {
          id,
          count,
          label: node?.name ?? null,
          kind: node ? kindOfNode(node) : undefined,
        },
        actions: {
          ...actions,
          onRemovePriorityGaps: () => {
            if (id) apply(() => removePriorityGapsAction(id));
          },
        },
      };
    },
    [actions, apply, byId],
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

  return { capabilities, rowMenu, conversionDialog };
}
