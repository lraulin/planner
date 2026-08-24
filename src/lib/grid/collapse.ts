import type { GridRow } from "@/lib/tree/slice";

/**
 * Drop group headers that have no surviving members, and restate each remaining
 * header's count to the nodes actually under it.
 *
 * Recounting is the part that is easy to miss and impossible to miss once seen: the counts
 * come from the unfiltered slice, so a header reading "Career (7)" above a single visible
 * row is not a rounding error, it is a claim the user can see is false.
 */
export function dropEmptyGroups<TRow>(
  rows: readonly GridRow<TRow>[],
  passIds: ReadonlySet<string>,
): GridRow<TRow>[] {
  const out: GridRow<TRow>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "node") {
      if (passIds.has(row.id)) out.push(row);
      continue;
    }

    let surviving = 0;
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j];
      if (next.kind === "group" && next.depth <= row.depth) break;
      if (next.kind === "node" && passIds.has(next.id)) surviving += 1;
    }

    if (surviving > 0) out.push({ ...row, count: surviving });
  }

  return out;
}

/**
 * Hide descendants of collapsed group headers. Nested headers under a collapsed parent
 * are omitted from the logical index, not merely undisplayed.
 */
export function applyGroupCollapse<TRow>(
  rows: readonly GridRow<TRow>[],
  collapsed: ReadonlySet<string>,
): GridRow<TRow>[] {
  const out: GridRow<TRow>[] = [];
  let hideUntilDepth: number | null = null;

  for (const row of rows) {
    if (hideUntilDepth !== null) {
      if (row.kind === "group" && row.depth <= hideUntilDepth) {
        hideUntilDepth = null;
      } else if (
        row.kind === "node" ||
        (row.kind === "group" && row.depth > hideUntilDepth)
      ) {
        continue;
      }
    }

    out.push(row);
    if (row.kind === "group" && collapsed.has(row.id)) {
      hideUntilDepth = row.depth;
    }
  }
  return out;
}
