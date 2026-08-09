/**
 * The percent a grid cell / chip / sort should use for a row.
 *
 * Leaves show their own stored progress. Parents show the effort-weighted rollup
 * (`derive` sets that to 0 when the subtree has no estimates). Using the rollup for
 * leaves too would hide real progress on tasks that never got an effort estimate —
 * the common case, not the exception.
 */
export function displayPercentComplete(node: {
  hasChildren: boolean;
  percentComplete: number | null;
  percentCompleteRollup: number;
}): number {
  return node.hasChildren ? node.percentCompleteRollup : (node.percentComplete ?? 0);
}
