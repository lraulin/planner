import { cache } from "react";
import { db } from "@/db";
import type { DbExecutor } from "@/db/executor";

type Primitive = string | number | boolean | null | undefined;

/**
 * Run a read once per page render, however many loaders ask for it.
 *
 * Loaders here are built from other loaders, and the ones at the bottom — the account list,
 * the pending selection, the classified rows — sit under nearly all of them. Called plainly,
 * a page that composes four loaders reads the accounts four times, each one a round trip to
 * a database that is not on the same machine. The Bills page read the account list four
 * times and every classified transaction twice before this existed.
 *
 * Three things keep sharing a read from ever meaning a stale one:
 *
 * - **Only a read against the shared `db` is shared.** Inside a transaction the answer
 *   depends on what that transaction has already written, so a `tx` executor always reads
 *   for itself.
 * - **Only a render shares.** React's `cache` keeps its results on the request being
 *   rendered. A server action, a route handler, the agent API and a test have no such
 *   request, so there every call reads again and a read after a write sees the write.
 * - **No render writes what it shares.** Writes go through server actions. The one read
 *   that writes on the way — the Day view carrying yesterday's open items forward — shares
 *   nothing here; a page that began writing something it also shares would have to stop
 *   sharing it.
 *
 * Arguments are matched by identity, so they have to be primitives — an options object
 * built at the call site would be a new key every time and share nothing. The result is
 * handed to every caller, so treat it as read-only: copy before sorting or pushing.
 */
export function oncePerRequest<Args extends readonly Primitive[], Result>(
  read: (executor: DbExecutor, ...args: Args) => Promise<Result>,
): (executor: DbExecutor, ...args: Args) => Promise<Result> {
  const shared = cache((...args: Args) => read(db, ...args));
  return (executor, ...args) =>
    executor === db ? shared(...args) : read(executor, ...args);
}
