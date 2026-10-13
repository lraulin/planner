# Node-postgres driver

**Status: active**  
Spec folder: `agent-os/specs/2026-10-12-2001-node-postgres-driver/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — decision 3's
  detection method only (`error.name === "PostgresError"` or a `code`). Redaction at the client
  boundary, the logged original and the "no `UserFacingError` hierarchy" ruling all carry
  forward.
- **Extends:** `agent-os/specs/2026-08-26-2242-parallel-test-suite/` — the loud local skip in
  `databaseReachable()` and the pre-push container start.
- **Extends:** `agent-os/specs/2026-08-27-0736-pull-request-ci/` — an unreachable database throws
  under `CI`.

## Context

Production is Vercel (iad1) talking to Neon, so a page costs one network round trip for every
query that has to wait for another. Drizzle's postgres-js session calls
`client.unsafe(query, params)`; postgres.js runs that unprepared, and an unprepared query with
parameters sets `describeFirst`: Parse+Describe+Flush, wait, then Bind+Execute+Sync. Every
parameterised query is two sequential round trips. `prepare: true` does not help: each of the
ten pooled connections has to learn each statement separately, and a wave is as slow as its
slowest member.

Measured 2026-10-12 through a delay proxy (20 ms each way) against local Postgres 17, warm
pools, pg 8.23.1 / postgres.js 3.4.9 / drizzle-orm 0.45.3:

| Scenario                        | postgres.js             | node-postgres            |
| ------------------------------- | ----------------------- | ------------------------ |
| 1 parameterised query           | 2 trips (P,D,H → B,E,S) | 1 trip (P,B,D,E,S, no H) |
| Wave of 5 on the pool           | 2                       | 1                        |
| Wave of 15, pool max 10         | 4                       | 2                        |
| Transaction, 3 queries in turn  | 8                       | 5                        |
| Transaction, `Promise.all` of 5 | 12                      | 7                        |
| Cold first query (no TLS)       | 6 flights               | 4 flights                |

Baseline after the loader fixes on master: about 7 sequential round trips per signed-in page,
4 of them the session → user lookups. `npm run perf:routes` (master, `56e43be3`) reports the
same doubling from the app's side: 350 of 353 queries made a separate describe trip. The full
tables are in `shape.md`.

### What this is worth in production

Less than the trip counts suggest. A separate measurement the same day put one production
round trip at about 4.5 ms (public `/signup` with and without its single query, 20 runs each,
64 against 73 ms median TTFB): Neon is close to `iad1`. Taking a signed-in page from about 7
sequential trips to about 4 therefore saves roughly 15 ms. This spec does **not** explain the
0.5–1 s tab switch Lee sees in production; that gap is still open, with Vercel CPU, connection
setup and cold starts as the candidates.

What the swap buys besides those milliseconds: no describe trip to reason around when reading
`perf:routes`, no prepared-statement state against a transaction-mode pooler, and a pool that
`attachDatabasePool` understands, so connection lifetime across a Fluid suspension becomes
something measured (Task 8) rather than assumed. If Task 8 shows reconnects are common today,
that is the larger finding.

## Decisions

**D1 — One driver.** `pg` under `drizzle-orm/node-postgres`; `postgres` leaves `package.json`.
Add `pg`, `@vercel/functions`, and `@types/pg` (dev). No dual-driver period: `db` is one object.

**D2 — The pool** (`src/db/index.ts`). One `pg.Pool`, still cached on `globalThis` in
development. It connects lazily, so importing `@/db` stays harmless.

- `max: 10` — the postgres.js default every baseline was measured under. Not raised here.
- `idleTimeoutMillis: 60_000` — Lee's call, 2026-10-12. Reconnecting costs about 5 round trips
  (SSLRequest, TLS, startup, two SCRAM steps), so Vercel's suggested 5 s would spend more on
  reconnecting after a normal pause than this spec saves. The TLS share of that figure is from
  the protocol, not measured. Confirmed or changed in Task 8.
- `connectionTimeoutMillis: 10_000` — pg's default waits forever.
- `attachDatabasePool(pool)` — holds the instance awake until idle clients close, so none are
  left open across a Fluid suspension. A no-op outside Vercel (it returns unless `VERCEL_URL`
  and `VERCEL_REGION` are set).
- A `pool.on("error")` listener that logs without credentials. Measured: an idle client dying
  with no listener is an `uncaughtException`; with one, the pool drops it and the next query
  reconnects.
- No custom type parsers. `pg.defaults.parseInputDatesAsUTC = true`, the one setting beyond
  parity: pg accepts a raw `Date` parameter (postgres.js threw) and formats it in process-local
  time, which turned `03:30Z` into `2026-10-11` under New York. UTC matches the UTC-noon
  calendar-day rule.

**D3 — Raw `execute` results are read as `.rows`.** Give `db.execute` its row type and delete
the `as unknown as` casts, so typecheck sees the shape. No wrapper helper. Readers:
`src/lib/tree/queries.ts`, `src/lib/tree/path.ts`, `src/lib/notes/queries.ts` (four, plus
`mapFlatNoteRows(rows: unknown)`), `src/lib/finances/ingestion.ts`. The two statement-only
calls (`finances/mutations.ts`, `achieve/import.ts`) read nothing. Integration tests that read
an `execute` result change the same way.

**D4 — Redaction is structural, not driver-shaped.** `isInternalError` treats a
`DrizzleQueryError` (from `drizzle-orm/errors`) anywhere in the cause chain as internal, and
keeps the `code` rule for Node system errors. The `name === "PostgresError"` branch goes: pg's
class is `DatabaseError` with `name: "error"`. Measured reason: a pg connect timeout or dropped
connection has **no `code` at any depth**, so today's check would hand the browser
`Failed query: <SQL> params: <values>`.

A connect failure inside `db.transaction` is not Drizzle-wrapped at all (plain
`Error("Connection terminated due to connection timeout")`). It must be redacted too; the
likely place is the pool's `connect`, since that is the only unwrapped path.

`src/lib/db/constraints.ts` keeps reading `code` (unchanged by the driver). Nothing reads
`constraint_name` / `table_name`, which become `constraint` / `table`.

**D5 — No query is issued on a transaction while another is in flight.** pg 8 warns
("…deprecated and will be removed in pg@9.0") and queues them; postgres.js already ran them one
at a time on the wire, so nothing is lost. Where the executor is statically `tx`, use sequential
awaits. Where a function takes a `DbExecutor` and fans out (`bankSnapshotApply.ts`,
`billLastCharge.ts`, others the gate finds), use one shared helper in `src/lib/db/` that runs
concurrently on the shared `db` and in order on a transaction — the same `executor === db` test
`oncePerRequest` uses. The integration suite fails on that warning, permanently.

**D6 — Probes and scripts.** `databaseReachable()` and `scripts/postgres-reachable.mjs` keep
their meaning exactly (an authenticated `select 1` within 2 s; any failure is "no"), on a
`pg.Client`. `scripts/ingest-identity-replay.ts` is ported, with verified TLS in place of
postgres.js's unverified `ssl: "require"`; it needs the backup Keychain, so it is typechecked,
not run.

**D7 — Migrations.** drizzle-kit 0.31 tries `pg` before `postgres`, so `drizzle-kit migrate`
needs no change. `sslmode=require` under pg means full certificate verification (postgres.js
did not verify) and prints a one-time warning; the Vercel URLs move to `sslmode=verify-full`.

**D8 — better-auth** uses the same `db` through `drizzleAdapter(db, { provider: "pg" })` and
touches nothing driver-specific. Its two lookups go from 4 round trips to 2.

**Considered and declined:** `@neondatabase/serverless` (ties the runtime to one host, against
the mission's lock-in rule, and local Docker would run a different driver); named prepared
statements; raising `max`.

**Type parity, measured.** Identical on both drivers under Drizzle: int4/int2 → number;
int8, `count(*)`, `sum`, numeric → string; date, timestamp, timestamptz, time, interval →
string; json/jsonb → parsed; text/int/uuid/bool arrays → arrays; numeric[]/date[]/timestamptz[]
→ raw literal (Drizzle parses these for columns); bytea → Buffer. Two differences, neither
reached by a current raw call site: an enum array in raw SQL arrives as `'{open}'` text, and a
NULL inside `text[]` is `null` rather than postgres.js's `"NULL"`.

## Acceptance criteria

- [ ] `postgres` is not in `package.json` and nothing imports it or `drizzle-orm/postgres-js`.
- [ ] `npm run perf:routes` reports no describe trips on any route.
- [ ] Every route's statement count equals its recorded baseline exactly, and its longest chain
      is no higher than the larger of its two baseline runs (identical runs differ by 1). The
      floor falls (4–5 under the dev bypass, about 7 signed in, today). Before and after numbers
      are in **As built**.
- [ ] `npm test` passes with the integration suite **not skipped**, and with pg's
      queued-query warning treated as a failure.
- [ ] `npm run smoke` passes against a dev server on the new driver.
- [ ] A connect timeout and a dropped connection, in a query and in a transaction, both return
      the generic message at the client boundary and log the original.
- [ ] A real unique and a real CHECK violation through `db` satisfy `isUniqueViolation` /
      `isCheckViolation`.
- [ ] One integration test pins the JS type of each raw selection kind the app relies on.
- [ ] Each raw `.rows` reader in D3 is exercised by an integration test.
- [ ] `npm run db:migrate` reports the `pg` driver locally and in CI.
- [ ] A preview deployment renders signed-in pages against Neon's pooled endpoint.
- [ ] Reconnect cost against the pooled endpoint is measured and the idle timeout confirmed or
      changed, with the number recorded.
- [ ] `security.md`, `migrations.md`, `read-latency.md`, `tech-stack.md` and `.env.example`
      describe the new driver.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                              | Why                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Acceptance compares statement counts exactly and chain length with a tolerance of 1 | Task 2 ran the measurement twice: statement counts were identical, chain lengths differed by 1 on 11 of 44 routes. "No higher than baseline" would fail on noise alone. |

## Task 1: Save spec documentation

Create `agent-os/specs/2026-10-12-2001-node-postgres-driver/` with `plan.md`, `shape.md`,
`standards.md` and `references.md`. No visuals: nothing on screen changes.

## Task 2: Record the baseline

The proxy and the measurement already exist on master (`scripts/pg-latency-proxy.mjs`,
`scripts/route-round-trips.mjs`). Run `npm run perf:routes` against `npm run dev:latency` on
postgres.js and keep the per-route output: longest chain, statements, describes.

Done 2026-10-12: two runs, recorded in `shape.md` under **Baseline**. The script prints
describes only as a total across routes, not per route.

## Task 3: Make redaction structural (D4)

Lands on postgres.js; it is correct under both drivers. Unit tests gain the two no-`code`
shapes and pg's `DatabaseError` fixture.

## Task 4: Swap the driver (D1, D2, D3, D6)

`package.json`, `src/db/index.ts`, the `.rows` readers, both probes, the replay script. Read
the relevant guide in `node_modules/next/dist/docs/` first (AGENTS.md). `DbExecutor` keeps its
derivation in `src/db/executor.ts`.

## Task 5: One query at a time on a transaction (D5)

Turn the warning into a suite failure, fix what it finds, leave the gate on.

## Task 6: Parity tests

The type-pin test, the real constraint violations, the transaction connect-failure redaction,
and coverage for any D3 reader that lacks it.

## Task 7: Verify locally

`npm test` (check for the skip warning), dev server + `npm run smoke`, `npm run db:migrate`,
then `npm run perf:routes` again and compare with Task 2.

## Task 8: Verify against Neon, then ship

Push the branch for a preview deployment (previews share the Neon database and skip
migrations). Load signed-in pages. Measure what a reconnect costs against the pooled endpoint
and settle the idle timeout; `pg-latency-proxy.mjs` takes a `targetHost` but counts statements,
not connection setup, so it needs a flight count for this (see `references.md`). Then master. The first production build is the
first `drizzle-kit migrate` over pg against Neon; if it fails the build fails and the old
deploy stays up. **Lee:** change `sslmode=require` to `sslmode=verify-full` in Vercel's
`DATABASE_URL` and `DIRECT_DATABASE_URL`.

## Task 9: Documents

`agent-os/standards/development/security.md` (the tell), `database/migrations.md`
(Connections), `database/read-latency.md` (the "counts twice" note and the floors go; reads go
out together on the pool but one at a time on a transaction),
`agent-os/product/tech-stack.md` (driver, pool settings, why), `.env.example`.

## Task 10: Verify, freeze spec, update roadmap

- Confirm the acceptance criteria.
- Add **As built** with the before/after round-trip table and the settled idle timeout.
- Complete **Changes from original plan**; mark `plan.md` and `shape.md`
  **Status: frozen / complete** (date) and pin the standards commit.
- Add a line under daily-use performance in `agent-os/product/roadmap.md`.

> While this spec is **active**, a material change to requirements, design or scope (including
> from feedback on what was implemented) updates the relevant section and adds a row to
> **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Follow-ups (new work — not amendments to this spec)

- Collapse better-auth's session → user lookup into one query.
- Raise `max` if any route's widest wave exceeds 10.
- Delete `scripts/ingest-identity-replay.ts` if the Sep 10–13 replay is no longer needed.
