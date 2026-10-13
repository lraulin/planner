import { config } from "dotenv";
import pg from "pg";

/**
 * Exit 0 and print where (credential-free) when the database the test suite is about to use
 * already answers a query; exit 1 otherwise. `.husky/pre-push` calls this to skip
 * `docker compose up` when a Postgres is already up — the compose container from an earlier
 * push, or a native install on a machine with no Docker at all.
 *
 * Both halves deliberately match what the suite itself does, because a check that is looser
 * than the suite reopens the hole the hook exists to close:
 *
 * - **Which database:** resolved as vitest.config.ts resolves it — `DATABASE_URL` from the
 *   environment, else from `.env.local` (dotenv never overrides a variable already set).
 * - **What "up" means:** what `databaseReachable()` in src/lib/testing/database.ts means —
 *   an authenticated `select 1`, not an open port. Docker Desktop's port forwarder accepts
 *   TCP on 5432 while the container is still starting, and `pg_isready` says yes to a server
 *   that would reject these credentials. Either would skip the container here, the
 *   integration suites would then skip themselves as unreachable, and the push would carry
 *   untested database code — with a green gate.
 *
 * Every failure, including an unset `DATABASE_URL` or missing node_modules, exits 1 so the
 * hook falls through to `docker compose up` exactly as it did before this script existed.
 */
config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) process.exit(1);

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 2000,
  query_timeout: 2000,
});
// A server that drops the connection after it was established is an `error` event, and an
// event with no listener is an uncaught exception rather than "no".
client.on("error", () => {});
let reachable = false;
try {
  await client.connect();
  await client.query("select 1");
  reachable = true;
} catch {
  // Not reachable, or not usable with these credentials: the caller starts the container.
} finally {
  await client.end().catch(() => {});
}
if (!reachable) process.exit(1);

// Host, port, and database only — never the password. Same shape as describeDatabaseUrl()
// in src/lib/db/target.ts, which a .mjs cannot import.
try {
  const { hostname, port, pathname } = new URL(url);
  console.log(`${hostname}:${port || "5432"}${pathname}`);
} catch {
  console.log("DATABASE_URL");
}
