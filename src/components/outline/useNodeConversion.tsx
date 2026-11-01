"use client";

import { useCallback, useState } from "react";
import { convertNodeAction } from "@/app/(shell)/plan/outline/actions";
import type { ActionResult } from "@/components/grid/useOptimisticNodes";
import { planNodeConversion } from "@/lib/tree/conversion";
import { kindOfNode, type NodeKind } from "@/lib/tree/hierarchy";
import type { OutlineNode } from "@/lib/tree/types";
import { ConversionDialog } from "./ConversionDialog";

/**
 * Convert a node to another kind, behind the confirmation that shows what the conversion
 * will do to its children. `request` opens it; `dialog` is rendered once by the host; the
 * write goes through the host's `apply` so it lands with every other outline write.
 */
export function useNodeConversion({
  nodes,
  byId,
  apply,
}: {
  nodes: readonly OutlineNode[];
  byId: ReadonlyMap<string, OutlineNode>;
  apply: (action: () => Promise<ActionResult>) => void;
}) {
  const [pending, setPending] = useState<{
    nodeId: string;
    targetKind: NodeKind;
  } | null>(null);

  const source = pending ? byId.get(pending.nodeId) : undefined;
  const plan =
    pending && source
      ? planNodeConversion({
          nodeId: source.id,
          sourceKind: kindOfNode(source),
          targetKind: pending.targetKind,
          nodes,
        })
      : null;

  const dialog = pending ? (
    <ConversionDialog
      open
      nodeName={source?.name ?? ""}
      targetKind={pending.targetKind}
      plan={plan}
      onConfirm={() => {
        const target = pending;
        setPending(null);
        apply(() => convertNodeAction(target.nodeId, target.targetKind));
      }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  // Stable, because hosts list it in the dependencies of their memoised command sets.
  const request = useCallback(
    (nodeId: string, targetKind: NodeKind) => setPending({ nodeId, targetKind }),
    [],
  );

  return { request, dialog };
}
