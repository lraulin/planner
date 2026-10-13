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
 * `pg.Pool` with its promise-form `connect()` made recognisable when it fails.
 *
 * Only the promise form is wrapped. `pool.query()` checks a client out through the callback
 * form and reports through its own promise, which Drizzle already wraps as a query error;
 * wrapping that path as well would bury the driver's own `code` under a second layer.
 */
class AppPool extends pg.Pool {
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: NonNullable<ConnectCallback>): void;
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    if (callback) return super.connect(callback);
    return super.connect().catch((cause: unknown) => {
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
