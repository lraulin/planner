import { lifecycleStateRefusal } from "@/lib/tree/lifecycle";
import { kindOfNode } from "@/lib/tree/hierarchy";
import { owningProjectId } from "@/lib/tree/owningProject";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridCommandCapabilities, GridSelectionCapability } from "./commandDeck";
import { pasteRefusal, type RowClipboard } from "./rowClipboard";

/** The row clipboard as one row sees it: how much is picked up, and where it may land. */
export function clipboardCapability(
  nodes: readonly OutlineNode[],
  clipboard: RowClipboard | null,
  id: string | null,
): NonNullable<GridCommandCapabilities["clipboard"]> {
  return {
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
  };
}

/**
 * What every node grid says about its selection: the row, its kind and state, whether the
 * selection may take a lifecycle state at all, and the project it sits in.
 *
 * `ids` are the selection's roots only: a child selected alongside its parent is already
 * inside that parent's branch, so deleting both would delete it twice and count it twice in
 * the warning. Hosts that move rows add their own `canMove…` flags on top.
 */
export function nodeSelection(
  nodes: readonly OutlineNode[],
  byId: ReadonlyMap<string, OutlineNode>,
  id: string | null,
  count: number,
  selectionIds: readonly string[],
): GridSelectionCapability {
  const node = id ? (byId.get(id) ?? null) : null;
  return {
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
    // `hasChildren` is the honest proxy: if nothing is filed under this row there are no
    // tasks to scope to, whatever level the row sits at.
    hasTasks: node?.hasChildren === true,
    ids: selectionIds,
  };
}
