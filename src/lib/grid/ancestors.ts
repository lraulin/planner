/**
 * Ancestor closure for a filtered row set.
 *
 * **A row that survives narrowing brings its ancestors with it.** Without this, filtering a
 * tree grid keeps the matching rows at their original indentation and deletes the rows they
 * were indented *under* — so a task sits three levels in with nothing above it, claiming a
 * parent that is not on screen. That is the one thing `data-grid.md` says filtering may
 * never do.
 *
 * This is how Achieve behaves and it is the only self-consistent answer: the alternative,
 * dropping a matching row because its parent did not match, hides work you explicitly asked
 * to see. (The Outline's old type checkboxes did exactly that, which is why unticking
 * "Result Areas" emptied the whole grid.)
 *
 * Ancestry is read from the **row order and depth**, not from the payload: rows arrive in
 * tree order with a depth per row, so the nearest preceding row at a shallower depth is the
 * parent. That keeps this working for every grid — the tabs that re-base depth for
 * subprojects, and the Notes and Day lists that have no tree at all (every row is depth 0,
 * so every row is its own ancestor set and this is a no-op).
 */

/** The only two things ancestry needs from a row. */
export type DepthRow = { id: string; depth: number };

/**
 * `passIds` plus every ancestor of every id in it.
 *
 * Returns the original set unchanged when nothing would be added, so the common flat-list
 * case costs one walk and no allocation downstream.
 */
export function withAncestors(
  rows: readonly DepthRow[],
  passIds: ReadonlySet<string>,
): ReadonlySet<string> {
  if (passIds.size === 0) return passIds;

  const out = new Set(passIds);
  /** Rows currently open above the cursor, outermost first. */
  const stack: DepthRow[] = [];

  for (const row of rows) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= row.depth) {
      stack.pop();
    }
    if (passIds.has(row.id)) {
      for (const ancestor of stack) out.add(ancestor.id);
    }
    stack.push(row);
  }

  return out.size === passIds.size ? passIds : out;
}
