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

/** Shared non-structural commands for list views that are projections of the outline. */
export function useNodeCommandDeck({
  nodes,
  selectedId,
  selectedCount,
  apply,
  onOpen,
  onRename,
}: {
  nodes: readonly OutlineNode[];
  selectedId: string | null;
  selectedCount: number;
  apply: (action: () => Promise<ActionResult>) => void;
  onOpen: (id: string) => void;
  onRename: (id: string) => void;
}): { capabilities: GridCommandCapabilities; conversionDialog: ReactNode } {
  const [pendingConversion, setPendingConversion] = useState<{
    nodeId: string;
    targetKind: NodeKind;
  } | null>(null);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const onConvert = useCallback((id: string, targetKind: NodeKind) => {
    setPendingConversion({ nodeId: id, targetKind });
  }, []);

  const capabilities = useMemo<GridCommandCapabilities>(
    () => ({
      priorityMaintenance: true,
      conversionKinds: NODE_KINDS,
      selection: {
        id: selectedId,
        count: selectedCount,
        label: selected?.name ?? null,
        kind: selected ? kindOfNode(selected) : undefined,
      },
      actions: {
        onOpen,
        onRename,
        onRemovePriorityGaps: () => {
          if (selectedId) apply(() => removePriorityGapsAction(selectedId));
        },
        onReprioritizeUnique: (id) => apply(() => reprioritizeUniqueAction(id)),
        onConvert,
      },
    }),
    [apply, onConvert, onOpen, onRename, selected, selectedCount, selectedId],
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

  return { capabilities, conversionDialog };
}
