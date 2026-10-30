/**
 * Matching the rows of a before and an after checkpoint, for the Activity drawer and its
 * export. A row can be added or removed by the event, so either side may be missing — but
 * never both, since the keys come from the two sides themselves. The union says so, which
 * lets a renderer reach the surviving side without asserting it exists.
 */

export type CheckpointPair<T extends object> =
  | { kind: "kept"; before: T; after: T }
  | { kind: "removed"; before: T; after: null }
  | { kind: "added"; before: null; after: T };

/** Rows of both checkpoints matched by key: before's order first, then rows only in after. */
export function pairCheckpointRows<T extends object>(
  before: readonly T[],
  after: readonly T[],
  keyOf: (row: T) => string,
): { key: string; pair: CheckpointPair<T> }[] {
  const beforeByKey = new Map(before.map((row) => [keyOf(row), row]));
  const afterByKey = new Map(after.map((row) => [keyOf(row), row]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])];
  return keys.map((key) => ({
    key,
    pair: pairOf(beforeByKey.get(key), afterByKey.get(key), key),
  }));
}

function pairOf<T extends object>(
  before: T | undefined,
  after: T | undefined,
  key: string,
): CheckpointPair<T> {
  if (before !== undefined && after !== undefined)
    return { kind: "kept", before, after };
  if (before !== undefined) return { kind: "removed", before, after: null };
  if (after !== undefined) return { kind: "added", before: null, after };
  throw new Error(`checkpoint row ${key} is in neither checkpoint`);
}

/** The side to name the row by: after when it survived the event, before when removed. */
export function latestSide<T extends object>(pair: CheckpointPair<T>): T {
  return pair.kind === "removed" ? pair.before : pair.after;
}
