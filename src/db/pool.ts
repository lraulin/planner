import pg from "pg";

/**
 * The connection pool, and the three things node-postgres does by default that this app
 * must not accept. `src/db/index.ts` owns the one shared instance; this module only knows
 * how to build one, so a test can build another aimed at a server that is not there.
 */

/**
 * pg formats a raw `Date` parameter in the process's local time, so `03:30Z` bound to a
 * `date` column became `2026-10-11` under New York. Drizzle's column encoders hand pg an ISO
 * string and never reach this, but a `Date` inside a raw `sql` template does. The app's
 * calendar days are UTC-noon (`agent-os/standards/development/dates.md`), so a bound `Date`
 * has to mean the same instant on every machine.
 *
 * Process-wide by pg's design, which is why it is set here at import and not per pool.
 */
pg.defaults.parseInputDatesAsUTC = true;

/**
 * A database that could not be reached when a transaction asked for a connection.
 *
 * Drizzle wraps every failed *query* in a `DrizzleQueryError`, and `isInternalError` keys on
 * that. It does not wrap `pool.connect()`, which `db.transaction` calls before its first
 * query: a connect timeout there arrives as a plain `Error("Connection terminated due to
 * connection timeout")` with no `code` at any depth, indistinguishable from a sentence this
 * codebase wrote, and it would be shown to the person as written. The message is harmless
 * today; the point is that "no code, so we wrote it" is the assumption the redaction rests
 * on, and this is the one path where the driver breaks it.
 *
 * It carries a `code` because that is the tell `safeError.ts` already honours for errors
 * nobody wrote for a reader. The original is kept as `cause` and is what gets logged.
 */
export class DatabaseConnectionError extends Error {
  readonly code = "DATABASE_CONNECTION_FAILED";

  constructor(cause: unknown) {
    super("Could not connect to the database.", { cause });
    this.name = "DatabaseConnectionError";
  }
}

type ConnectCallback = Parameters<pg.Pool["connect"]>[0];

/**
 * Make a checked-out client run one statement at a time, in the order they were issued.
 *
 * A transaction is one connection, and a connection runs one statement at a time. Code
 * written against the shared `db` fans reads out with `Promise.all` — the latency standard
 * asks for it — and the same functions take a `DbExecutor`, so they fan out on a `tx` too.
 * postgres.js queued those silently. node-postgres queues them and prints "Calling
 * client.query() when the client is already executing a query is deprecated", and pg 9
 * removes the queue.
 *
 * Doing the queueing here, at the one place a transaction obtains its client, keeps that
 * invariant out of every call site: roughly thirty `Promise.all`s sit under functions that
 * take an executor, and each would otherwise need to know whether it was handed a pool or a
 * transaction. Nothing is slower than before; the wire order is the same.
 *
 * Only the promise form of `query` is serialised, because it is the only form Drizzle uses.
 * A callback or a `Submittable` (a cursor, a stream) passes through untouched, and still
 * trips pg's warning if it overlaps — which the integration suite treats as a failure, so a
 * path that bypasses this is found rather than silently queued.
 */
function serialise(client: pg.PoolClient): pg.PoolClient {
  const query = client.query.bind(client) as (...args: unknown[]) => unknown;
  let tail: Promise<unknown> = Promise.resolve();

  client.query = ((...args: unknown[]) => {
    const first = args[0];
    const promiseForm =
      !args.some((arg) => typeof arg === "function") &&
      !(typeof first === "object" && first !== null && "submit" in first);
    if (!promiseForm) return query(...args);

    const run = tail.then(() => query(...args));
    // The next statement waits for this one to *finish*, however it finishes: a failed
    // statement must not wedge the queue, and its rejection belongs to its own caller.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }) as pg.PoolClient["query"];

  return client;
}

/**
 * `pg.Pool` with its promise-form `connect()` — the call `db.transaction` makes — returning a
 * serialised client, and failing recognisably.
 *
 * Only the promise form is touched. `pool.query()` checks a client out through the callback
 * form for one statement and reports through its own promise, which Drizzle already wraps as
 * a query error; wrapping that path as well would bury the driver's own `code` under a
 * second layer.
 */
class AppPool extends pg.Pool {
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: NonNullable<ConnectCallback>): void;
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    if (callback) return super.connect(callback);
    return super.connect().then(serialise, (cause: unknown) => {
      throw new DatabaseConnectionError(cause);
    });
  }
}

export const POOL_DEFAULTS = {
  /**
   * The postgres.js default every baseline in `agent-os/specs/2026-10-12-2001-node-postgres-
   * driver/` was measured under. A wave wider than this queues on the pool; fold reads of one
   * table into a query before raising it (`database/read-latency.md`).
   */
  max: 10,
  /**
   * Long enough that a normal pause between clicks does not pay a reconnect (about five
   * round trips: SSLRequest, TLS, startup, two SCRAM steps), short enough that an idle
   * serverless instance does not hold a connection for minutes. Vercel suggests 5 s; that
   * would spend more reconnecting than the driver swap saves.
   */
  idleTimeoutMillis: 60_000,
  /** pg's default is to wait forever, which is a request that never answers. */
  connectionTimeoutMillis: 10_000,
} as const;

/**
 * A pool with this app's settings. Connects lazily, so building one is harmless.
 *
 * The `error` listener is not optional. An idle client that the server drops is an `error`
 * event on the pool, and an event with no listener is an `uncaughtException` that takes the
 * process down. With one, the pool discards the client and the next query reconnects.
 */
export function createPool(config: pg.PoolConfig): pg.Pool {
  const pool = new AppPool({ ...POOL_DEFAULTS, ...config });
  pool.on("error", (error) => {
    // The message only: the config holds the connection string, and an error object can
    // carry the pool's options on some paths.
    console.error(`[db] idle client dropped: ${error.message}`);
  });
  return pool;
}
