import type { NoteNode, NoteRow } from "./types";

/**
 * Computes what the notes grid shows but does not store: child counts and which rows sit
 * under a collapsed ancestor.
 *
 * The notes counterpart of `src/lib/tree/derive.ts`, minus the rollups — notes carry no
 * effort or priority to roll up.
 *
 * `rows` must arrive in depth-first order, parents before their children, which is what
 * ordering by the accumulated sort-key path produces.
 */
export function deriveNotes(rows: NoteRow[]): NoteNode[] {
  const byId = new Map<string, NoteRow>();
  const childCounts = new Map<string, number>();

  for (const row of rows) {
    byId.set(row.id, row);
    if (row.parentId) {
      childCounts.set(row.parentId, (childCounts.get(row.parentId) ?? 0) + 1);
    }
  }

  // A row is hidden when *any* ancestor is collapsed, not only its parent. Parents precede
  // children, so one forward pass carries the flag down.
  const hiddenById = new Map<string, boolean>();

  return rows.map((row) => {
    const parentHidden = row.parentId
      ? (hiddenById.get(row.parentId) ?? false) ||
        (byId.get(row.parentId)?.collapsed ?? false)
      : false;
    hiddenById.set(row.id, parentHidden);

    const childCount = childCounts.get(row.id) ?? 0;

    return {
      ...row,
      childCount,
      hasChildren: childCount > 0,
      hidden: parentHidden,
    };
  });
}
