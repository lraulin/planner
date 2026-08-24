export type RecentCategoryChoice = { id: string; categoryId: string | null };

/** Actual-style 3-of-latest-5 learning. Nulls occupy a slot but never vote. */
export function learnedCategory(
  editedId: string,
  latest: readonly RecentCategoryChoice[],
): string | null {
  const window = latest.slice(0, 5);
  if (!window.some((row) => row.id === editedId)) return null;
  const counts = new Map<string, number>();
  for (const row of window) {
    if (row.categoryId)
      counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
  }
  return [...counts].find(([, count]) => count >= 3)?.[0] ?? null;
}
