/**
 * A depth-indented list of rows as a forest.
 *
 * Sort and structured export both need this: the hierarchy the grid is *showing*, which is
 * not always the outline model's children. Projects drops tasks, a filter can drop a
 * mid-level parent, and depth has already been rebased. Walking `node.children` would put
 * rows back that are not on screen.
 *
 * Orphan depths (a jump of more than one, or a first row deeper than the base) attach to
 * the nearest open ancestor so a hole in the middle still produces a coherent tree rather
 * than dropping rows.
 */

export type DepthRow = { depth: number };

export type ForestNode<T> = {
  row: T;
  children: ForestNode<T>[];
};

export function parseDepthForest<T extends DepthRow>(
  rows: readonly T[],
): ForestNode<T>[] {
  if (rows.length === 0) return [];

  const baseDepth = Math.min(...rows.map((row) => row.depth));
  const root: ForestNode<T>[] = [];
  /** Stack of open parents, root-most first. */
  const stack: { depth: number; node: ForestNode<T> }[] = [];

  for (const row of rows) {
    const node: ForestNode<T> = { row, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].depth >= row.depth) {
      stack.pop();
    }

    if (stack.length === 0 || row.depth <= baseDepth) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ depth: row.depth, node });
  }

  return root;
}
