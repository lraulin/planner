import { afterAll, afterEach } from "vitest";

/**
 * Fail the test that made node-postgres warn about a query issued on a busy client.
 *
 * pg 8 prints "Calling client.query() when the client is already executing a query is
 * deprecated and will be removed in pg@9.0" and queues the statement; pg 9 drops the queue.
 * A warning on stderr is how that would otherwise go unnoticed: it prints once per process,
 * between thousands of lines of passing tests.
 *
 * `src/db/pool.ts` serialises every transaction client, so under the app's own `db` this
 * cannot fire. What trips it is a path that gets a client some other way — a `pg.Client`
 * constructed directly, a callback- or cursor-style call — which is exactly what should be
 * found now rather than as a hang on the day the queue is removed.
 *
 * Registered through `setupFiles` for the integration project only.
 */

const QUEUED_QUERY = /already executing a query/;

type Watch = { registered: boolean; offenders: string[] };
const slot = globalThis as unknown as { __queuedQueryWatch?: Watch };
// `process` outlives each test file's module registry, so the listener and its list live
// there too; a second registration would report every offence twice.
const watch = (slot.__queuedQueryWatch ??= { registered: false, offenders: [] });

if (!watch.registered) {
  watch.registered = true;
  process.on("warning", (warning) => {
    if (warning.name === "DeprecationWarning" && QUEUED_QUERY.test(warning.message)) {
      watch.offenders.push(warning.stack ?? warning.message);
    }
  });
}

function failIfWarned(): void {
  if (watch.offenders.length === 0) return;
  const [first] = watch.offenders.splice(0);
  throw new Error(
    `node-postgres reported a query issued on a client that was already running one.\n` +
      `Transaction clients are serialised in src/db/pool.ts, so this came from a client ` +
      `obtained some other way.\n\n${first}`,
  );
}

afterEach(failIfWarned);
afterAll(failIfWarned);
