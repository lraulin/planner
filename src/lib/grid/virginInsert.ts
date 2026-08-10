/**
 * Achieve-style cancel of a blank grid insert: Esc removes a row that was just created and
 * never named. See `docs/achieve-planner/user-manual.md` §3.3.1.
 *
 * "Virgin" is set only by the create → `startNaming` path, not by F2 rename. The **draft**
 * (what is in the editor) matters: committed name is still `""` until blur/Enter, so typing
 * then Esc must not delete the row.
 */
export function shouldDiscardVirginInsert(args: {
  virginInsertId: string | null;
  editingId: string | null;
  committedName: string;
  draftName: string;
}): boolean {
  const { virginInsertId, editingId, committedName, draftName } = args;
  if (editingId == null || virginInsertId == null) return false;
  if (virginInsertId !== editingId) return false;
  if (committedName.trim() !== "") return false;
  if (draftName.trim() !== "") return false;
  return true;
}
