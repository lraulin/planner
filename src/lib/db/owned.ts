import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DbExecutor } from "@/db/executor";

type OwnedTable = PgTable & { id: AnyPgColumn; userId: AnyPgColumn };

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

/**
 * The caller's row with this id, or `null` when there is none — including when the id is
 * real but belongs to another user, which must read exactly like a missing row.
 */
export async function findOwnedRow<T extends OwnedTable>(
  executor: DbExecutor,
  table: T,
  id: string,
  userId: string,
): Promise<T["$inferSelect"] | null> {
  // Drizzle cannot resolve `.from()` over a generic table (its selection type is a
  // conditional on `T` that TypeScript leaves unevaluated), so the query reads the table as
  // a plain `PgTable`, whose columns are loosely typed, and the declared return type gives
  // the row back its table's shape. That is the one unchecked step here, and it holds
  // because `select()` with no fields returns the full row of the table it reads — exactly
  // what `$inferSelect` describes.
  const source: PgTable = table;
  const [row] = await executor
    .select()
    .from(source)
    .where(ownedRow(table, id, userId))
    .limit(1);
  if (!row) return null;
  return row;
}

/**
 * The caller's row with this id, or throw `notFound`. The guard every mutation runs before
 * acting on an id that came from a request: an id is a claim, and this checks it.
 */
export async function requireOwnedRow<T extends OwnedTable>(
  executor: DbExecutor,
  table: T,
  id: string,
  userId: string,
  notFound: string,
): Promise<T["$inferSelect"]> {
  const row = await findOwnedRow(executor, table, id, userId);
  if (!row) throw new Error(notFound);
  return row;
}
