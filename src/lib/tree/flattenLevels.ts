import type { NodeKind } from "./hierarchy";
import { kindOfNode } from "./hierarchy";
import type { OutlineNode } from "./types";

/**
 * Removing a **level** from the outline, as distinct from filtering rows out of it.
 *
 * These answer different questions and it took a wrong turn to see it. *Filtering* asks
 * "which rows do I want to look at", and a filtered tree keeps every parent, because a row
 * indented under nothing is a lie about where it lives (`lib/grid/ancestors.ts`).
 * *Flattening* asks "stop organising my work this way": turn Result Areas off and every
 * goal becomes top-level, as if the layer were not there at all.
 *
 * The Outline's four type checkboxes used to be filters and behaved like neither — they
 * dropped a node's whole subtree, so unticking Result Areas emptied the grid rather than
 * promoting what was underneath. Achieve's Areas and Goals checkboxes do the promoting
 * version, which is the one worth having; type *filtering* is now the `type` column, where
 * every other filter lives.
 *
 * Only the organising levels are offered. Projects are what tasks belong to and tasks nest
 * arbitrarily, so "flatten tasks" has no level to remove — a flat task list is the Tasks tab.
 */

/** The levels that can be dissolved, outermost first. */
export const FLATTENABLE_LEVELS = ["result_area", "goal"] as const;
export type FlattenableLevel = (typeof FLATTENABLE_LEVELS)[number];

/**
 * Dreams are Goals with a flag and sit at the same level, so one switch governs both — the
 * label says so rather than leaving a dream stranded at a depth its siblings just left.
 */
export const LEVEL_LABELS: Record<FlattenableLevel, string> = {
  result_area: "Areas",
  goal: "Goals/Dreams",
};

function levelOf(node: OutlineNode): FlattenableLevel | null {
  const kind: NodeKind = kindOfNode(node);
  if (kind === "result_area") return "result_area";
  if (kind === "goal" || kind === "dream") return "goal";
  return null;
}

/**
 * Drop every node at a hidden level and re-depth what is left, so the survivors sit where
 * they would if the level had never existed.
 *
 * Rows arrive in tree order at tree depth and leave the same way — only shallower. Depth is
 * recomputed from the surviving ancestry rather than by subtracting a constant, because how
 * many hidden levels a row sat under varies from branch to branch: a task under
 * area → goal → project rises by two, one under area → project by one.
 *
 * `hidden` — "an ancestor is collapsed, do not render me" — is recomputed for the same
 * reason. A collapsed row that is itself dissolved has no twisty left to click, so its
 * collapse cannot be undone and must not still be hiding anything: with Areas off, a
 * collapsed area's goals come up to the top level like every other area's. Being collapsed
 * is not a filter, and a level that is gone cannot hold its subtree shut.
 *
 * Every row is returned, hidden ones included, exactly as they arrive — the caller drops
 * `hidden` rows as it always did, once the flag means what it should.
 *
 * The tree itself is untouched. This is a view, and turning the switch back on restores
 * every row to where it was, still collapsed.
 */
export function flattenLevels(
  nodes: readonly OutlineNode[],
  hidden: ReadonlySet<FlattenableLevel>,
): OutlineNode[] {
  if (hidden.size === 0) return [...nodes];

  /** Surviving depth per node id, for the rows that survive. */
  const depthById = new Map<string, number>();
  /** Whether a node's children are hidden — it or a surviving ancestor is collapsed. */
  const childrenHiddenById = new Map<string, boolean>();
  const out: OutlineNode[] = [];

  for (const node of nodes) {
    // A parent that was itself dropped has no entry, so its children inherit the depth of
    // the nearest surviving ancestor — which is what "as if the level were not there" means.
    const parentDepth =
      node.parentId === null ? -1 : (depthById.get(node.parentId) ?? -1);
    const rowHidden =
      node.parentId === null ? false : (childrenHiddenById.get(node.parentId) ?? false);

    const level = levelOf(node);
    if (level !== null && hidden.has(level)) {
      // Dropped, but still a step on the path: its children take its own surviving depth,
      // and whatever hid it still hides them — its own collapse leaves with it.
      depthById.set(node.id, parentDepth);
      childrenHiddenById.set(node.id, rowHidden);
      continue;
    }

    const depth = parentDepth + 1;
    depthById.set(node.id, depth);
    childrenHiddenById.set(node.id, rowHidden || node.collapsed);
    out.push(
      depth === node.depth && rowHidden === node.hidden
        ? node
        : { ...node, depth, hidden: rowHidden },
    );
  }

  return out;
}
