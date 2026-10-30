/**
 * Narrows a raw-SQL value to one member of a closed set — a `pgEnum`'s `enumValues` or a
 * CHECK-backed `as const` tuple. `db.execute` types every column `unknown`, and casting the
 * text to the union would let a value the type forbids flow on as a lie; this throws instead,
 * naming the column and what it held.
 */
export function oneOf<const T extends string>(
  values: readonly T[],
  raw: unknown,
  column: string,
): T {
  const found = values.find((value) => value === raw);
  if (found === undefined) {
    throw new Error(
      `${column} holds ${JSON.stringify(raw)}, which is not one of ${values.join(", ")}`,
    );
  }
  return found;
}

/**
 * `oneOf` for a column that is legitimately null — a nullable column, or one reached through a
 * LEFT JOIN. Only SQL null passes; `undefined` means the column is missing from the SELECT,
 * which is a bug, so it throws like any other stray value.
 */
export function oneOfOrNull<const T extends string>(
  values: readonly T[],
  raw: unknown,
  column: string,
): T | null {
  if (raw === null) return null;
  return oneOf(values, raw, column);
}
