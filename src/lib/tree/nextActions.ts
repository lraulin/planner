import { isSettled } from "./completionCascade";
import type { OutlineNode } from "./types";

/**
 * Achieve's simple **Next Action Only** list (manual §2.6): among sibling *leaves*, keep only
 * the first one still open.
 *
 * The point is planning ahead without paying for it later. Breaking a project into six
 * ordered steps is good practice; being shown all six when you are picking what to do next is
 * not — five of them are not available yet, and they crowd out the one thing from each project
 * that is. So summaries stay (they are the map), and each of them contributes exactly one
 * actionable row.
 *
 * From the manual's worked example — the whole Plan Party project collapses to:
 *
 * ```
 * Plan Party            Plan Party
 *   Make Reservations     Make Reservations
 *     Find location   →       Find location
 *     Call to make…
 *   Order Cake            Order Cake
 *     Select from…            Select from catalog
 *     Call to order…
 * ```
 *
 * **Settled leaves drop out**, which is what makes the list move: finish "Find location" and
 * "Call to make reservations" takes its place. A next-action list that still showed the thing
 * you just ticked off would be the one thing it must not be.
 *
 * Two deliberate choices:
 *
 * - **Leaf-ness is judged within the list given**, not from `hasChildren`. A task whose
 *   subtasks are filtered out of this view is a leaf *here*, and competes as one — otherwise
 *   a view could show a summary row with nothing beneath it and call it a next action.
 * - **Siblings are grouped by real `parentId`**, not by row depth. The Tasks tab re-bases
 *   depth so tasks from different projects all sit at zero; grouping by depth would make them
 *   siblings and leave exactly one next action for the whole tab.
 *
 * The Task Chooser has its own next-action rule (`lib/chooser/views.ts`) and keeps it: it is a
 * flat scored list with no hierarchy to walk, so "first leaf sibling" has nothing to mean
 * there. It answers the same question about a different shape.
 */
export function nextActionsOnly(nodes: readonly OutlineNode[]): OutlineNode[] {
  const hasChildInList = new Set<string>();
  for (const node of nodes) {
    if (node.parentId !== null) hasChildInList.add(node.parentId);
  }

  /** Parents whose next action has already been found. */
  const claimed = new Set<string>();
  const out: OutlineNode[] = [];

  for (const node of nodes) {
    // Summaries are the map, not the work. They always survive.
    if (hasChildInList.has(node.id)) {
      out.push(node);
      continue;
    }

    if (isSettled(node.state)) continue;

    // Top-level leaves share one bucket, which is right: they are siblings of each other.
    const parent = node.parentId ?? "";
    if (claimed.has(parent)) continue;
    claimed.add(parent);
    out.push(node);
  }

  return out;
}
