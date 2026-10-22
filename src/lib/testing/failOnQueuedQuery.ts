import pg from "pg";
import { afterAll, afterEach } from "vitest";

/**
 * Fail the test that issued a statement on a node-postgres client that was already running
 * one.
 *
 * pg 8 queues such a statement, and pg 9 removes the queue. Its own notice is too weak to
 * gate on: it fires only once a statement is already *waiting* behind the running one — a
 * plain two-way overlap never prints it — and `util.deprecate` prints once per process, so
 * every offence after the first in a worker is silent. This checks the client's state on
 * every call instead, which catches the overlap pg 9 will refuse, every time.
 *
 * `src/db/pool.ts` serialises every transaction client, so under the app's own `db` this
 * cannot fire. What trips it is a path that gets a client some other way — a `pg.Client`
 * constructed directly, a callback- or cursor-style call that bypasses the serialiser —
 * which is exactly what should be found now rather than as a failure on the day the queue
 * is removed.
 *
 * Registered through `setupFiles` for the integration project only.
 */

/** The two private fields pg 8 decides "busy" by (`client.js`, `query()`). */
type ClientState = {
  _activeQuery?: unknown;
  _queryQueue?: unknown[];
  pipeline?: boolean;
};
type Query = (this: pg.Client, ...args: unknown[]) => unknown;

type Watch = { offenders: string[] };
const slot = globalThis as unknown as { __queuedQueryWatch?: Watch };

// pg is loaded once per worker process, not once per test file, so the prototype is shared
// across files: wrap it once, and keep the list where every file's hooks can see it.
if (!slot.__queuedQueryWatch) {
  const watch: Watch = { offenders: [] };
  slot.__queuedQueryWatch = watch;

  const prototype = pg.Client.prototype as unknown as { query: Query };
  const original = prototype.query;
  prototype.query = function (this: pg.Client, ...args: unknown[]) {
    const state = this as unknown as ClientState;
    // If an upgrade renames these, a check reading `undefined` would pass forever. Refuse
    // instead, so the tripwire is repaired rather than quietly disarmed.
    if (!Array.isArray(state._queryQueue) || !("_activeQuery" in state)) {
      throw new Error(
        "failOnQueuedQuery: pg.Client no longer has _activeQuery / _queryQueue. " +
          "Re-read node_modules/pg/lib/client.js query() and update the busy check.",
      );
    }
    const busy = state._activeQuery != null || state._queryQueue.length > 0;
    if (busy && !state.pipeline) {
      watch.offenders.push(new Error("query() on a busy pg.Client").stack ?? "");
    }
    return original.apply(this, args);
  };
}

function failIfQueued(): void {
  const watch = slot.__queuedQueryWatch;
  if (!watch || watch.offenders.length === 0) return;
  const [first] = watch.offenders.splice(0);
  throw new Error(
    `A statement was issued on a node-postgres client that was already running one.\n` +
      `Transaction clients are serialised in src/db/pool.ts, so this came from a client ` +
      `obtained some other way.\n\n${first}`,
  );
}

afterEach(failIfQueued);
afterAll(failIfQueued);
