"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { OutlineNode } from "@/lib/tree/types";
// The contract a server action returns; components may import the type, never the runner.
import type { ActionResult } from "@/app/actionResult";

export type { ActionResult };

/**
 * Layers optimistic patches on top of the server-provided tree. The server remains the
 * source of truth: accepted changes arrive via `initialNodes` on the next render, and
 * rejected ones visibly revert when the patch layer is cleared.
 *
 * Patches stay until `initialNodes` refreshes (or the action fails). Clearing them when
 * the action Promise settles races the RSC re-render — one frame shows the pre-mutation
 * tree with no overlay, which is the complete/priority flicker.
 */
export function useOptimisticNodes(initialNodes: OutlineNode[]) {
  const [patches, setPatches] = useState<Record<string, Partial<OutlineNode>>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Same compare-props idiom as DayView / ScheduleView: drop the overlay in the same
  // render that receives the refreshed tree, not in an effect after paint.
  const [baseline, setBaseline] = useState(initialNodes);
  if (initialNodes !== baseline) {
    setBaseline(initialNodes);
    if (Object.keys(patches).length > 0) {
      setPatches({});
    }
  }

  const nodes = useMemo(
    () => initialNodes.map((n) => (patches[n.id] ? { ...n, ...patches[n.id] } : n)),
    [initialNodes, patches],
  );

  const byId = useMemo(() => {
    const map = new Map<string, OutlineNode>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  const patch = useCallback((nodeId: string, changes: Partial<OutlineNode>) => {
    setPatches((current) => ({
      ...current,
      [nodeId]: { ...current[nodeId], ...changes },
    }));
  }, []);

  const apply = useCallback(
    (action: () => Promise<ActionResult>, onSuccess?: (id?: string) => void) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (result.ok) onSuccess?.(result.id);
        else {
          setError(result.error);
          // Rejected: revert immediately. Success waits for `initialNodes` above.
          setPatches({});
        }
      });
    },
    [],
  );

  return { nodes, byId, patch, apply, error, setError };
}
