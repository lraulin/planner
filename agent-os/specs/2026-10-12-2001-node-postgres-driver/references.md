# References for Node-postgres driver

## Governing specs

### `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/`

- **Relationship:** Supersedes decision 3's detection method.
- **Relevant decisions:** database errors are redacted at the client boundary and logged
  first; no `UserFacingError` hierarchy. Both carry forward. Only "detect via
  `error.name === "PostgresError"` or `code`" is replaced (D4).

### `agent-os/specs/2026-08-26-2242-parallel-test-suite/`

- **Relationship:** Extends.
- **Relevant decisions:** `databaseReachable()` keeps its loud skip for a manual `npm test`;
  pre-push starts Postgres and fails if it cannot. D6 changes the driver under the probe only.

### `agent-os/specs/2026-08-27-0736-pull-request-ci/`

- **Relationship:** Extends.
- **Relevant decisions:** an unreachable database throws when `CI` is set. Unchanged.

## Context, not governing

- `agent-os/specs/2026-08-10-1940-daily-use-performance/` — the earlier performance pass. It
  ruled out new runtime dependencies for itself; that constraint was that delta's, not a
  standing one.
- `agent-os/specs/2026-09-13-1127-ingest-by-identity/` — owns
  `scripts/ingest-identity-replay.ts`, the one script that builds its own postgres.js client.
- `agent-os/specs/2026-09-05-0906-production-backup-recovery/` — backups use `pg_dump` over a
  direct least-privilege connection and do not touch the driver.
- Commits `8ffb6889` … `ce88a45e` on master — the loader fixes the "about 7 round trips"
  baseline is measured after. `8ffb6889` introduces `oncePerRequest`.
- Commits `56e43be3` and `5f665924` — `npm run perf:routes` and
  `agent-os/standards/database/read-latency.md`, which already names the driver as the cause
  of the doubling.

## Code

### Where the two round trips come from

- **Location:** `node_modules/drizzle-orm/postgres-js/session.js` (`client.unsafe(query,
params)`), `node_modules/postgres/src/connection.js` `build()` (`describeFirst`).
- **Relevance:** the cause this spec removes.

### What replaces it

- **Location:** `node_modules/drizzle-orm/node-postgres/session.js` and `driver.js`.
- **Key points:** `execute` returns pg's `QueryResult`; string parsers are installed per query
  for timestamptz, timestamp, date, interval and their arrays; `transaction` takes a client
  from the pool with `connect()` (not wrapped in `DrizzleQueryError`) and sends `begin` and
  `commit` as their own round trips; nested transactions are savepoints.

### `attachDatabasePool`

- **Location:** `@vercel/functions` 3.9.11, `db-connections/index.js`.
- **Key points:** on each pool `release` it calls `waitUntil` with a promise that resolves
  after `idleTimeoutMillis + 100` ms, capped by the invocation deadline. It returns
  immediately unless `VERCEL_URL` and `VERCEL_REGION` are set. Vercel's guide: create the pool
  in module scope, do not use `max: 1`, and it suggests a 5 s idle timeout.

### pg defaults that differ from postgres.js

- **Location:** `pg-pool/index.js`, `pg-connection-string/index.js`, `pg/lib/client.js`.
- **Key points:** `max` 10; `idleTimeoutMillis` 10 000 (postgres.js: never);
  `connectionTimeoutMillis` 0, meaning wait forever (postgres.js: 30 s); `sslmode=require`
  verifies the certificate and warns that it is treated as `verify-full`; the queued-query
  deprecation is `queryQueueLengthDeprecationNotice`.

### drizzle-kit's driver choice

- **Location:** `node_modules/drizzle-kit/bin.cjs`, `preparePostgresDB`.
- **Key points:** tries `pg`, then `postgres`, then `@vercel/postgres`, then
  `@neondatabase/serverless`. With a `url` it builds `new pg.Pool({ connectionString, max: 1 })`.

### Telling the pool from a transaction

- **Location:** `src/lib/db/requestMemo.ts`.
- **Relevance:** `executor === db` is the existing test for "this is the shared pool, not a
  transaction". D5's helper uses the same one.

### Direct driver users to port

- `src/db/index.ts`, `src/lib/testing/database.ts`, `scripts/postgres-reachable.mjs`,
  `scripts/ingest-identity-replay.ts`.
- Comments and fixtures naming `PostgresError`: `src/lib/security/safeError.ts` (+ test),
  `src/lib/db/constraints.ts` (+ test).

## Measuring

### On master

- **Location:** `scripts/pg-latency-proxy.mjs`, `scripts/route-round-trips.mjs`,
  `scripts/page-routes.mjs`; `npm run perf:routes` with `npm run dev:latency`.
- **Key points:** the proxy listens on `:5433`, delays each direction, and counts
  `statements` (`S` or `Q`) and `describes` (`H`). The route script loads each page with and
  without the delay and divides the difference by the round-trip time, which is the longest
  chain of queries that waited on each other. It needs the dev login bypass, so its floor is
  the bypass's.

### The one used while shaping

A separate throwaway, since master's had not landed in this worktree yet. Two things it did
that master's does not, both needed only for Task 8's reconnect measurement:

- **Flights:** per connection, increment when a client chunk arrives and the server has sent
  something since the previous client chunk. Summed, this is the number of times a client
  waited on the server, including during connection setup. It needs no parsing, so it still
  works when the stream is TLS.
- It treated SSLRequest (`80877103`) as a startup packet that is followed by another one.
  Master's parser marks startup as seen after the first packet, which is right for local
  Postgres and wrong once TLS is requested.

For Neon through a proxy, pg has to be pointed at `127.0.0.1` with `ssl.servername` set to the
Neon host, since Neon routes on SNI and the certificate names that host.
