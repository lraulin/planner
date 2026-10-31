import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * `id = ? AND user_id = ?` — the row with this id, and only if `userId` owns it.
 *
 * Per-user scoping is the core invariant (`development/security.md`), and a write that drops
 * `userId` matches someone else's row or nothing at all, both of which look like success.
 * Spelled out inline, the scope is one of two `eq`s that is easy to leave off in the
 * three-hundredth copy; here it is a required argument.
 *
 * Built with `sql` rather than `and()` because `and()` is typed `SQL | undefined`, and this
 * condition always exists. Combine it with more conditions through `and()` as usual.
 */
export function ownedRow(
  table: { id: AnyPgColumn; userId: AnyPgColumn },
  id: string,
  userId: string,
): SQL {
  return sql`(${eq(table.id, id)} and ${eq(table.userId, userId)})`;
}
