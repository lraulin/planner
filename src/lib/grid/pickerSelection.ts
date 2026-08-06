/**
 * Which row a searchable picker would act on.
 *
 * A picker keeps its own selection while the list under it is filtered by a query, and the
 * two drift apart the moment the query excludes what was selected: the list shows one
 * candidate, nothing looks selected, and confirming acts on a row that is not on screen.
 * The confirm target has to be something the user can currently see, so a selection that
 * has been filtered away falls back to the first remaining candidate.
 *
 * Returns null only when there is nothing to pick, which is what disables confirm.
 */
export function resolvePickerSelection(
  candidates: readonly { id: string }[],
  selectedId: string | null,
): string | null {
  if (selectedId !== null && candidates.some((entry) => entry.id === selectedId)) {
    return selectedId;
  }
  return candidates[0]?.id ?? null;
}
