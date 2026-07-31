import { isValidScope } from "./scopes";

/**
 * The pending-write queue that makes settings survive a failed save.
 *
 * Writes are optimistic: the provider applies them to its own state immediately and only
 * then tells the server. If that call fails — offline, a deploy mid-click, a dead session —
 * the change would otherwise vanish on the next reload, because the server render is the
 * only read path. So every unflushed write is mirrored to `localStorage` and replayed on
 * the next load, layered over the server snapshot.
 *
 * This module is the pure half: coalescing, layering, and the defensive read of a mirror
 * that is as user-editable as any other `localStorage` key. The timers live in the provider.
 */

export type PendingWrite = { scope: string; value: unknown };

/**
 * Last write per scope, in the order each scope was first queued.
 *
 * A burst of filter clicks is a burst of writes to one scope, of which only the final one
 * means anything. Keeping the original position rather than moving the scope to the end
 * makes the drained order stable and the tests readable.
 */
export function coalesceWrites(writes: PendingWrite[]): PendingWrite[] {
  const latest = new Map<string, unknown>();
  for (const write of writes) latest.set(write.scope, write.value);
  return [...latest].map(([scope, value]) => ({ scope, value }));
}

/**
 * The server snapshot with unflushed writes layered on top. Pending is by definition newer
 * than what the server returned, so it wins.
 */
export function applyPending(
  snapshot: Record<string, unknown>,
  pending: PendingWrite[],
): Record<string, unknown> {
  if (pending.length === 0) return snapshot;

  const merged = { ...snapshot };
  for (const write of coalesceWrites(pending)) merged[write.scope] = write.value;
  return merged;
}

/**
 * Read the mirror. Anything malformed is dropped rather than replayed — a corrupt queue
 * must not be able to overwrite good server state, and an unknown scope would be rejected
 * by the write path anyway, failing the batch it rides in.
 */
export function readPending(raw: string | null): PendingWrite[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const writes: PendingWrite[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const { scope, value } = entry as { scope?: unknown; value?: unknown };
    if (typeof scope !== "string" || !isValidScope(scope)) continue;
    if (value === undefined) continue;
    writes.push({ scope, value });
  }

  return coalesceWrites(writes);
}
