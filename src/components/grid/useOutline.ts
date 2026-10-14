"use client";

import { useMemo } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { unpackOutline, type OutlineKey, type OutlineWire } from "@/lib/tree/wire";

/**
 * Turn the packed outline a page was sent back into `OutlineNode` rows, once per payload.
 *
 * **Memoised on the wire's identity, and that is load-bearing.** `useOptimisticNodes` drops
 * its patch layer when `initialNodes` changes identity — it is how an accepted edit's
 * overlay is retired in the same render that receives the refreshed tree. So the array
 * must be a new one exactly when the server sent new data, and not on any other render.
 * Unpacking in the render body, or memoising on something that changes every render, would
 * either clear every optimistic patch continuously or never.
 */
export function useOutline<K extends OutlineKey>(
  wire: OutlineWire<K>,
): Pick<OutlineNode, K>[] {
  return useMemo(() => unpackOutline(wire), [wire]);
}
