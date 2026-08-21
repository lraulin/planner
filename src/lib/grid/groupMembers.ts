import type { GridRow } from "@/lib/tree/slice";

/**
 * Node payloads sitting under each group header — nested groups included.
 *
 * A parent group's members are the union of the groups nested inside it. Call this on the
 * list the grid is actually showing (after a filter has restated counts, before collapse
 * hides the rows) so a header's summary matches the rows you would see if you expanded it.
 */
export function groupMembers<T>(rows: readonly GridRow<T>[]): Map<string, T[]> {
  const members = new Map<string, T[]>();
  const stack: { depth: number; list: T[] }[] = [];

  for (const row of rows) {
    if (row.kind === "group") {
      while (stack.length > 0 && stack[stack.length - 1].depth >= row.depth) {
        stack.pop();
      }
      const list: T[] = [];
      members.set(row.id, list);
      stack.push({ depth: row.depth, list });
      continue;
    }
    for (const frame of stack) frame.list.push(row.node);
  }

  return members;
}
