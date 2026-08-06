/**
 * The gap between what the menu says and what the mutation takes.
 *
 * Achieve numbers outline levels from **1**: "Expand to Level N — expand all rows until
 * level N in parent/child hierarchy is reached and then collapse all remaining children",
 * where Level 1 is the top row of result areas. `expandThroughDepth` takes the tree's own
 * **0-based** `depth` instead, because that is what the rows carry.
 *
 * One row of result areas is Level 1 and depth 0, so the two differ by one everywhere and
 * passing a level straight through shows one level too many.
 */
export function depthForOutlineLevel(level: number): number {
  return Math.max(0, Math.floor(level) - 1);
}
