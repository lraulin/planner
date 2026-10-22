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
- A listener on each client `connect()` hands out, for as long as it is checked out. pg-pool
  detaches the pool's listener on checkout, so a transaction's connection dropping _between_
  statements was an `uncaughtException` too (found by the dropped-connection test, which
  crashed the run). The next statement fails through Drizzle and release discards the client.
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
at a time on the wire, so nothing is lost. **Enforced once, in `src/db/pool.ts`**: the client
`db.transaction` obtains through `pool.connect()` is serialised, so statements handed to it
together run one at a time in the order issued. Callers keep writing `Promise.all`, which is
what the latency standard asks of them on the shared `db`, and nothing at a call site needs to
know whether its executor is a pool or a transaction. The integration suite fails on pg's
warning, permanently (`src/lib/testing/failOnQueuedQuery.ts`), as a tripwire for a client
obtained some other way.

_Superseded design:_ the shaped D5 was a helper in `src/lib/db/` called wherever a function
taking a `DbExecutor` fans out, concurrent on `db` and sequential on `tx`. Task 5 measured
the sites first: 3,500 collisions across 25 test files and a dozen source files
(`budget/queries.ts`, `dashboardQueries.ts`, `billLastCharge.ts`, `bankSnapshotApply.ts`, and
the loaders they compose), several chained off a shared promise, so a thunk-taking helper
would have meant restructuring each. Those were one cause, not thirty — a driver constraint
with a single point where it can be held — so it is held there.

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

- [x] `postgres` is not in `package.json` and nothing imports it or `drizzle-orm/postgres-js`.
- [x] `npm run perf:routes` reports no describe trips on any route.
- [x] Every route's statement count equals its recorded baseline exactly, and its longest chain
      is no higher than the larger of its two baseline runs (identical runs differ by 1). The
      floor falls (4–5 under the dev bypass, about 7 signed in, today). Before and after numbers
      are in **As built**, against a baseline re-measured on master `28822a2a` (row 5).
- [x] `npm test` passes with the integration suite **not skipped**, and with pg's
      queued-query warning treated as a failure (stricter than the warning: row 3).
- [x] `npm run smoke` passes against a dev server on the new driver.
- [x] A connect timeout and a dropped connection, in a query and in a transaction, both return
      the generic message at the client boundary and log the original.
- [x] A real unique and a real CHECK violation through `db` satisfy `isUniqueViolation` /
      `isCheckViolation`.
- [x] One integration test pins the JS type of each raw selection kind the app relies on.
- [x] Each raw `.rows` reader in D3 is exercised by an integration test.
- [x] `npm run db:migrate` reports the `pg` driver locally and in CI.
- [ ] A preview deployment renders signed-in pages against Neon's pooled endpoint. _Partly
      done 2026-10-22: the preview built and its public pages queried Neon through pg (see
      **As built**); signed-in pages need Lee's login._
- [ ] Reconnect cost against the pooled endpoint is measured and the idle timeout confirmed or
      changed, with the number recorded. _Timeout confirmed at 60 s on the direct endpoint (9.5
      trips, **As built**); one run against the `-pooler` string remains._
- [x] `security.md`, `migrations.md`, `read-latency.md`, `tech-stack.md` and `.env.example`
      describe the new driver.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                       | Why                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Acceptance compares statement counts exactly and chain length with a tolerance of 1                                          | Task 2 ran the measurement twice: statement counts were identical, chain lengths differed by 1 on 11 of 44 routes. "No higher than baseline" would fail on noise alone.                                                                                                                                                 |
| 2   | D5 is enforced by serialising a transaction's client in `src/db/pool.ts`, not by a helper at each fan-out                    | Measured the sites first: ~3,500 collisions, a dozen source files, many chained off shared promises. One driver constraint with one place to hold it; per-site fixes would be the same patch repeated and would have to be remembered by every future caller. The invariant and the acceptance criterion are unchanged. |
| 3   | The suite's tripwire checks each pg client's busy state on every `query()`, instead of listening for pg's deprecation notice | pg prints the notice only once a statement is already _waiting_ behind the running one, and `util.deprecate` prints it once per process. A test overlapping two queries on a bare `pg.Client` passed under the listener. The new check fails on any overlap, which is what pg 9 refuses.                                |
| 4   | D2 gains a listener on each checked-out client                                                                               | Not in the shaped design: pg-pool leaves a checked-out client with no `error` listener, so a transaction's connection dropping between statements crashed the process. Found by Task 6's dropped-connection test.                                                                                                       |
| 5   | Acceptance compares against a baseline re-measured on master `28822a2a`, not Task 2's `5f665924`                             | Master moved 69 commits (narrowed finance reads, outline payload packing) before the swap landed, so Task 2's statement counts no longer described the page code. Both baselines are kept: Task 2's in `shape.md`, the new one in **As built**.                                                                         |
| 6   | Task 8's reconnect cost is measured by timing (`scripts/pg-reconnect-cost.mjs`), not by a flight count in the proxy          | A ratio of connect-plus-query to a warm query needs no proxy in front of Neon and includes SCRAM's CPU time, which a reconnect really spends.                                                                                                                                                                           |

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

Done 2026-10-12 (`safeError.ts`, `safeError.test.ts`, `driverErrors.integration.test.ts`,
and the `security.md` section it described, which moved here from Task 9). The pool-`connect`
half of D4 — the one error Drizzle never wraps — is pg-specific and lands with Task 4.

## Task 4: Swap the driver (D1, D2, D3, D6)

`package.json`, `src/db/index.ts`, the `.rows` readers, both probes, the replay script. Read
the relevant guide in `node_modules/next/dist/docs/` first (AGENTS.md). `DbExecutor` keeps its
derivation in `src/db/executor.ts`.

## Task 5: One query at a time on a transaction (D5)

Turn the warning into a suite failure, fix what it finds, leave the gate on.

Done 2026-10-12 as one change in `pool.ts` rather than call-site fixes; see D5 and the row in
**Changes from original plan**.

## Task 6: Parity tests

The type-pin test, the real constraint violations, the transaction connect-failure redaction,
and coverage for any D3 reader that lacks it.

Done 2026-10-22. The constraint violations were already in `driverErrors.integration.test.ts`
(Task 3). `src/db/pool.integration.test.ts` adds a dropped connection, in a query and in a
transaction, through a TCP relay that is cut, and a listener-count check across checkouts;
`src/db/rawTypes.integration.test.ts` pins the types and calls the ingestion watermark, the
one D3 reader only import paths reached. The other readers were already covered
(`crossUserReads`, `path`, `notes/mutations`, and every suite that calls `loadOutline`).

## Task 7: Verify locally

`npm test` (check for the skip warning), dev server + `npm run smoke`, `npm run db:migrate`,
then `npm run perf:routes` again and compare with Task 2.

Done 2026-10-22 after rebasing onto master `28822a2a`: smoke 64 of 64 and `db:migrate`
printing `Using 'pg' driver` locally; CI run `39834784936` printed the same and passed 4,692
unit and 1,301 integration tests, none skipped. Perf is in **As built**.

## Task 8: Verify against Neon, then ship

Push the branch for a preview deployment (previews share the Neon database and skip
migrations). Load signed-in pages. Measure what a reconnect costs against the pooled endpoint
and settle the idle timeout; `pg-latency-proxy.mjs` takes a `targetHost` but counts statements,
not connection setup, so it needs a flight count for this (see `references.md`). Then master. The first production build is the
first `drizzle-kit migrate` over pg against Neon; if it fails the build fails and the old
deploy stays up. **Lee:** change `sslmode=require` to `sslmode=verify-full` in Vercel's
`DATABASE_URL` and `DIRECT_DATABASE_URL`.

Status 2026-10-22: preview built and its public pages reached Neon; shipped to master, so the
production deploy runs the first pg migration. Left for Lee, which keeps this spec active:

1. Sign in on production (or the preview) and load a few signed-in pages — outline, register,
   budget — to close the preview criterion. A failure would show as a 500 or as
   "Something went wrong." with `[db]` lines in the Vercel function log.
2. Run `DATABASE_URL='<Neon pooled string>' node scripts/pg-reconnect-cost.mjs` and record the
   result in **As built**. Keep `idleTimeoutMillis` at 60 s if a reconnect costs about five
   round trips or more; lower it toward Vercel's 5 s only if it costs one or two.
3. The `sslmode` change above. Until then pg prints a one-time SSL warning; behaviour is the
   same.

## Task 9: Documents

Done 2026-10-22.

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

## As built

### Round trips per route (Tasks 2 and 7)

`npm run perf:routes` against `npm run dev:latency`, 10 ms each way, dev login bypass as the
seeded `test@example.com`, both drivers against the same local database on 2026-10-22, two
runs each. postgres.js is master `28822a2a`; node-postgres is that plus this spec's commits.
The machine was under load (load average 6–12), which is the noise the tolerance of 1 is for.

- **Describes:** 326 of 326 queries on postgres.js, **0 of 326** on node-postgres.
- **Statements:** identical on every route (326 in total), so nothing was added or dropped.
- **Longest chain:** lower on every route, never higher than either baseline run. The mean
  across routes went from 5.5 to 2.4. The floor under the dev bypass went from 4–5 to 2
  (`/chooser`, `/finances/activity` and `/plan/projects` read 1 in a run, which is noise).
  Signed in, better-auth's session and user lookups go from 4 trips to 2, so a signed-in page's
  floor is about 4, not 7.
- **What that is worth in production:** about 3 trips off each signed-in page, ~13–15 ms at
  the 4.5 ms production round trip, and more on the finance pages (`/finances/bills` 9 → 3–4,
  `/finances/scenarios` 9–10 → 4–5: ~25 ms).

| Route                    | Queries | postgres.js | node-postgres |
| ------------------------ | ------- | ----------- | ------------- |
| `/chooser`               | 4       | 4, 4        | 1, 2          |
| `/finances/accounts`     | 13      | 8, 7        | 3, 3          |
| `/finances/activity`     | 3       | 4, 5        | 1, 1          |
| `/finances/bills`        | 26      | 9, 9        | 4, 3          |
| `/finances/budget`       | 24      | 8, 9        | 4, 4          |
| `/finances/insights`     | 21      | 7, 7        | 3, 2          |
| `/finances/orders`       | 10      | 5, 4        | 2, 2          |
| `/finances/payees`       | 8       | 5, 5        | 2, 3          |
| `/finances/register`     | 17      | 6, 7        | 3, 3          |
| `/finances/scenarios`    | 17      | 10, 9       | 4, 5          |
| `/finances/statements`   | 5       | 6, 7        | 3, 3          |
| `/finances/supplies`     | 6       | 5, 5        | 2, 2          |
| `/find`                  | 2       | 5, 5        | 2, 3          |
| `/fitness/exercises`     | 9       | 5, 4        | 2, 2          |
| `/fitness/exercises/new` | 9       | 4, 5        | 2, 2          |
| `/fitness/log`           | 9       | 5, 5        | 3, 2          |
| `/fitness/sessions`      | 9       | 5, 5        | 2, 2          |
| `/library/contacts`      | 6       | 5, 5        | 2, 2          |
| `/library/houses`        | 3       | 5, 5        | 2, 2          |
| `/library/jobs`          | 3       | 5, 5        | 2, 2          |
| `/library/residences`    | 3       | 5, 5        | 2, 2          |
| `/library/resources`     | 7       | 5, 5        | 2, 2          |
| `/library/timeline`      | 5       | 5, 5        | 2, 2          |
| `/login`                 | 2       | 5, 5        | 2, 2          |
| `/metrics`               | 5       | 5, 5        | 2, 2          |
| `/notes/grid`            | 6       | 7, 7        | 5, 3          |
| `/notes/journal`         | 3       | 5, 5        | 2, 2          |
| `/oauth/authorize`       | 2       | 5, 5        | 2, 3          |
| `/organize`              | 3       | 5, 5        | 2, 2          |
| `/plan/goals`            | 3       | 5, 5        | 2, 2          |
| `/plan/outline`          | 3       | 5, 4        | 2, 2          |
| `/plan/overview`         | 4       | 5, 5        | 3, 3          |
| `/plan/projects`         | 3       | 3, 4        | 1, 2          |
| `/plan/result-areas`     | 3       | 4, 4        | 2, 2          |
| `/plan/tasks`            | 5       | 5, 5        | 2, 2          |
| `/plan/wishes`           | 5       | 5, 5        | 2, 2          |
| `/schedule/agenda`       | 7       | 7, 7        | 3, 3          |
| `/schedule/calendar`     | 7       | 7, 7        | 3, 3          |
| `/schedule/day`          | 9       | 7, 6        | 3, 3          |
| `/schedule/plan`         | 15      | 6, 6        | 3, 3          |
| `/schedule/time-charts`  | 3       | 4, 5        | 2, 2          |
| `/schedule/week-plan`    | 4       | 5, 5        | 2, 2          |
| `/settings`              | 13      | 7, 7        | 3, 3          |
| `/signup`                | 2       | 5, 5        | 2, 2          |

### Against Neon (Task 8)

- **Preview** `planner-j756m1vnw-lee-5344.vercel.app` (branch `claude/musing-williamson-5ea114`,
  2026-10-22) built and serves `/login` and `/signup`. `/signup?invite=<unknown token>` runs one
  read-only invite lookup through the pool and answered "invalid or has been revoked" (not a 500) six times: about 1.0 s for the first request, a cold instance connecting, then
  0.08–0.14 s.
  Signed-in pages redirect to `/login` and were not loaded: that needs Lee's login.
- **Production** deployed `f1bf90a5` on 2026-10-22: the build's `drizzle-kit migrate` ran over
  pg against Neon without failing the build, and the same invite probe answered in 0.13–0.47 s.
- **Reconnect cost**, `scripts/pg-reconnect-cost.mjs` from Lee's Mac, 2026-10-22, 15 runs, against
  Neon's **direct** endpoint (`ep-…` with no `-pooler`), not the pooled one the app uses: one
  query on a warm client 9.6 ms, connect plus one query 100.7 ms, so a reconnect costs as much
  as **9.5 round trips** — nearly double the five-trip estimate, the excess being TLS and
  SCRAM's hashing. At ~4.5 ms a trip from iad1, about 40 ms per reconnect.
- **Idle timeout: 60 s, confirmed.** Vercel's 5 s would pay ~40 ms after every pause longer
  than five seconds, more than the ~15 ms a page saves. The pooled endpoint terminates TLS and
  authentication at PgBouncer instead, which may cost somewhat differently but not little
  enough to change this; one run with the `-pooler` string closes the criterion.

## Follow-ups (new work — not amendments to this spec)

- Collapse better-auth's session → user lookup into one query.
- Raise `max` if any route's widest wave exceeds 10.
- Delete `scripts/ingest-identity-replay.ts` if the Sep 10–13 replay is no longer needed.
