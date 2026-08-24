/**
 * Payee ids embedded in a conditions blob, and how to move them when payees merge.
 *
 * `finance_rules` holds `{field: "payee", …}` conditions as JSONB, which carries no foreign
 * key, so nothing in the database stops a merge or a delete from leaving an id in there
 * pointing at a payee that no longer exists. The row would not fail; it would quietly match
 * nothing. These functions are the only guard, which is why they are pure and tested rather
 * than inlined into each mutation.
 */

/** Payee ids in a conditions blob, including a malformed-but-recognizable condition. */
export function storedConditionPayeeIds(conditions: unknown): string[] {
  if (!Array.isArray(conditions)) return [];
  const ids: string[] = [];

  for (const condition of conditions) {
    if (
      typeof condition !== "object" ||
      condition === null ||
      (condition as { field?: unknown }).field !== "payee"
    ) {
      continue;
    }
    const value = (condition as { value?: unknown }).value;
    if (typeof value === "string") ids.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === "string") ids.push(entry);
    }
  }

  return [...new Set(ids)];
}

/**
 * Point every `payee` condition holding a merged id at the survivor instead.
 *
 * Returns `null` when nothing referenced a merged payee, so a caller can skip the write
 * rather than touching every row on every merge.
 *
 * Rewrites in TypeScript rather than SQL: the blob is a validated shape, and a JSONB path
 * update would have to re-encode that shape in SQL where nothing checks it.
 */
export function rewriteMergedPayeeIds(
  conditions: unknown,
  merged: ReadonlySet<string>,
  targetId: string,
): unknown[] | null {
  if (!Array.isArray(conditions)) return null;
  let changed = false;

  const next = conditions.map((condition) => {
    if (
      typeof condition !== "object" ||
      condition === null ||
      (condition as { field?: unknown }).field !== "payee"
    ) {
      return condition;
    }
    const value = (condition as { value?: unknown }).value;

    if (typeof value === "string" && merged.has(value)) {
      changed = true;
      return { ...(condition as object), value: targetId };
    }
    if (Array.isArray(value) && value.some((entry) => merged.has(entry as string))) {
      changed = true;
      // De-duplicate: merging two payees one condition listed separately must not leave the
      // survivor named twice.
      const rewritten = [
        ...new Set(
          value.map((entry) => (merged.has(entry as string) ? targetId : entry)),
        ),
      ];
      return { ...(condition as object), value: rewritten };
    }
    return condition;
  });

  return changed ? next : null;
}
