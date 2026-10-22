# Node-postgres driver — Shaping Notes

**Status: frozen / complete** (2026-10-22). As built, the re-measured baseline
and the Neon numbers are in `plan.md`; the Task 2 baseline below is the shaping-time one.

## Scope

Replace the `postgres` (postgres.js) driver with node-postgres (`pg`) under Drizzle, so a
parameterised query costs one network round trip instead of two. Everything that touches the
driver directly moves with it: client construction, the reachability probes, the raw
`execute` readers, error recognition, and one script.

### Out of scope

- Collapsing better-auth's session → user lookup into one query. The swap takes it from 4
  round trips to 2; a join would make it 1.
- Raising the pool's `max`, pg pipeline mode, named prepared statements (`.prepare()` is not
  used anywhere).
- Any schema change. There is no migration in this spec.
- Deleting `scripts/ingest-identity-replay.ts`. It is ported so `postgres` can be removed.

## Decisions

See `plan.md` D1–D8. The ones shaping changed from the brief:

- **Error redaction has to change, not just its fixtures.** The brief noted
  `constraint_name` vs `constraint`. Nothing reads either. What matters is that pg's
  connection-level errors carry no `code`, which is the tell `safeError.ts` relies on.
- **`Promise.all` on a transaction becomes a rule.** Not in the brief; found by the
  experiment's deprecation warning.
- **The pool needs an `error` listener and a connect timeout.** Both are silent defaults that
  differ from postgres.js.
- **Idle timeout is 60 s, not Vercel's 5 s.** Lee chose it on 2026-10-12 from the reconnect
  cost; Task 8 measures and confirms.

## Evidence

All from a scratch folder outside the repo, 2026-10-12: a Node `net` proxy in front of the
local `planner-postgres` container (Postgres 17), pg 8.23.1, postgres.js 3.4.9,
drizzle-orm 0.45.3. Round trips: 20 ms delay each way, pools warmed first.

### Round trips

Frontend message counts per scenario. `flights` is the number of times the client had to wait
for the server.

| Scenario                        | Driver        | Wall ms | Flights | P   | B   | D   | E   | H   | S   | Q   |
| ------------------------------- | ------------- | ------- | ------- | --- | --- | --- | --- | --- | --- | --- |
| 1 raw param query               | postgres.js   | 87      | 2       | 1   | 1   | 1   | 1   | 1   | 1   | 0   |
| 1 raw param query               | node-postgres | 44      | 1       | 1   | 1   | 1   | 1   | 0   | 1   | 0   |
| 1 builder query                 | postgres.js   | 88      | 2       | 1   | 1   | 1   | 1   | 1   | 1   | 0   |
| 1 builder query                 | node-postgres | 45      | 1       | 1   | 1   | 1   | 1   | 0   | 1   | 0   |
| Same statement again            | postgres.js   | 87      | 2       | 1   | 1   | 1   | 1   | 1   | 1   | 0   |
| Same statement again            | node-postgres | 44      | 1       | 1   | 1   | 1   | 1   | 0   | 1   | 0   |
| Wave of 5 (pool)                | postgres.js   | 87      | 10      | 5   | 5   | 5   | 5   | 5   | 5   | 0   |
| Wave of 5 (pool)                | node-postgres | 44      | 5       | 5   | 5   | 5   | 5   | 0   | 5   | 0   |
| Wave of 15 (pool max 10)        | postgres.js   | 181     | 30      | 15  | 15  | 15  | 15  | 15  | 15  | 0   |
| Wave of 15 (pool max 10)        | node-postgres | 87      | 15      | 15  | 15  | 15  | 15  | 0   | 15  | 0   |
| Transaction, 3 in turn          | postgres.js   | 348     | 8       | 4   | 4   | 4   | 4   | 3   | 4   | 1   |
| Transaction, 3 in turn          | node-postgres | 218     | 5       | 3   | 3   | 3   | 3   | 0   | 3   | 2   |
| Transaction, `Promise.all` of 5 | postgres.js   | 515     | 12      | 6   | 6   | 6   | 6   | 5   | 6   | 1   |
| Transaction, `Promise.all` of 5 | node-postgres | 301     | 7       | 5   | 5   | 5   | 5   | 0   | 5   | 2   |
| No-param query                  | both          | 44      | 1       | 0   | 0   | 0   | 0   | 0   | 0   | 1   |

`postgres.js` with `prepare: false` matched `postgres.js` row for row. A cold first query took
6 flights on postgres.js (it also fetches array types on connect) and 4 on node-postgres,
without TLS.

A wave wider than the pool takes a second trip on both drivers, so `max` matters equally to
each.

### Result parsing

Run through `db.execute` on both Drizzle adapters. Same on both: `int4`, `int2`, `float8`,
`real` → number; `int8`, `count(*)`, `sum(int)`, `numeric`, `sum(numeric)`,
`extract(epoch …)` → string; `date` → `"2026-10-12"`; `timestamptz` →
`"2026-10-12 08:00:00.123456+00"`; `timestamp`, `time`, `interval` → string; `jsonb`/`json`
object, array and scalar → parsed; `->` → parsed, `->>` → string; `int4[]`, `uuid[]`, `bool[]`,
`array_agg(text)` → array; `int8[]` → array of strings; `numeric[]`, `date[]`,
`timestamptz[]` → raw literal string; `uuid` → string; `bytea` → Buffer; an enum value →
string; `jsonb_agg` → array.

| Selection                       | postgres.js          | node-postgres      |
| ------------------------------- | -------------------- | ------------------ |
| `array['a','b,c',null]::text[]` | `["a","b,c","NULL"]` | `["a","b,c",null]` |
| `array['open']::some_enum[]`    | `["open"]`           | `"{open}"`         |
| `array_agg(enum_value)`         | `["open"]`           | `"{open}"`         |

The schema's nine `.array()` columns are `text[]` and `smallint[]`, and Drizzle parses array
columns itself, so only a raw selection of an enum array would see the second and third rows.
There is none today.

### Parameter serialisation

Same on both: number, string, boolean, null, bigint, ISO string → `timestamptz`,
`JSON.stringify(…)` → `jsonb`. A JS array in raw `sql` is expanded by Drizzle into a
parameter list on both, so `${array}::text[]` and `= any(${array})` fail identically.

| Parameter (process TZ New York) | postgres.js | node-postgres            |
| ------------------------------- | ----------- | ------------------------ |
| `Date` → `::timestamptz`        | throws      | `2026-10-12 03:30:00+00` |
| `Date` → `::date` (03:30Z)      | throws      | `2026-10-11`             |
| `Date` → `::timestamp`          | throws      | `2026-10-11 23:30:00`    |
| plain object → `::jsonb`        | throws      | `{"a":1}`                |

No current code passes a raw `Date`, since it throws. Builder queries are unaffected: Drizzle's
column encoders turn a `Date` into an ISO string before either driver sees it.

### Result shape

`db.execute` on postgres.js returns an array-like with `.count`; on node-postgres it returns
`{ command, rowCount, rows, fields, … }` and indexing it gives `undefined`.

### Error shapes

Both arrive wrapped in a `DrizzleQueryError` (`name: "Error"`, no `code`, message
`Failed query: <SQL>\nparams: <values>`) with the driver's error in `cause`.

| Failure                          | postgres.js cause                                         | node-postgres cause                                                        |
| -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Unique violation                 | `PostgresError`, `23505`, `constraint_name`, `table_name` | `DatabaseError` (`name: "error"`), `23505`, `constraint`, `table`          |
| CHECK violation                  | `PostgresError`, `23514`                                  | `DatabaseError`, `23514`                                                   |
| Statement error                  | `PostgresError`, `22012`                                  | `DatabaseError`, `22012`                                                   |
| Bad password                     | `PostgresError`, `28P01`                                  | `DatabaseError`, `28P01`                                                   |
| Refused port                     | `Error`, `ECONNREFUSED`                                   | `Error`, `ECONNREFUSED`                                                    |
| Connect timeout                  | `Error`, `CONNECT_TIMEOUT`                                | `Error`, **no code**, "Connection terminated due to connection timeout"    |
| Dropped mid-query                | `Error`, `CONNECTION_CLOSED`                              | `Error`, **no code**, "Connection terminated unexpectedly"                 |
| Connect timeout in `transaction` | not measured                                              | not wrapped by Drizzle: plain `Error`, **no code**, same sentence as above |

### Pool failure modes (node-postgres)

- An idle client killed while in the pool raises the pool's `error` event. With a listener the
  pool drops the client and the next query reconnects and succeeds. Without one the process
  takes an `uncaughtException`.
- `Promise.all` over a transaction's client prints `DeprecationWarning: Calling client.query()
when the client is already executing a query is deprecated and will be removed in pg@9.0`.

### Baseline: round trips per route on postgres.js (Task 2)

`npm run perf:routes` against `npm run dev:latency`, master `5f665924` (spec commits on top
change no code), 2026-10-12, 10 ms each way, dev login bypass as the seeded `test@example.com`,
dev database at 142 outline nodes. 44 static routes, run twice back to back with the server
warm. `Queries` is the statement count per load and is identical in both runs. `Run 1` and
`Run 2` are the longest chain of sequential round trips; on postgres.js every query counts
twice, so these are roughly double the number of waits.

| Route                                                                                       | Queries | Run 1 | Run 2 |
| ------------------------------------------------------------------------------------------- | ------- | ----- | ----- |
| `/chooser`                                                                                  | 4       | 4     | 4     |
| `/finances/accounts`                                                                        | 17      | 7     | 7     |
| `/finances/activity`                                                                        | 3       | 5     | 4     |
| `/finances/bills`                                                                           | 27      | 7     | 8     |
| `/finances/budget`                                                                          | 24      | 7     | 7     |
| `/finances/insights`                                                                        | 21      | 7     | 8     |
| `/finances/orders`                                                                          | 10      | 4     | 5     |
| `/finances/payees`                                                                          | 8       | 5     | 4     |
| `/finances/register`                                                                        | 15      | 4     | 5     |
| `/finances/scenarios`                                                                       | 17      | 9     | 10    |
| `/finances/statements`                                                                      | 5       | 7     | 6     |
| `/finances/supplies`                                                                        | 6       | 5     | 5     |
| `/find`                                                                                     | 2       | 5     | 5     |
| `/fitness/exercises`                                                                        | 9       | 5     | 5     |
| `/fitness/exercises/new`                                                                    | 9       | 5     | 5     |
| `/fitness/log`                                                                              | 9       | 5     | 5     |
| `/fitness/sessions`                                                                         | 9       | 5     | 5     |
| `/library/contacts`                                                                         | 6       | 5     | 5     |
| `/library/houses`                                                                           | 3       | 5     | 5     |
| `/library/jobs`                                                                             | 3       | 5     | 5     |
| `/library/residences`                                                                       | 3       | 5     | 5     |
| `/library/resources`                                                                        | 7       | 5     | 5     |
| `/library/timeline`                                                                         | 5       | 5     | 5     |
| `/login`                                                                                    | 2       | 5     | 5     |
| `/metrics`                                                                                  | 5       | 5     | 5     |
| `/notes/grid`                                                                               | 6       | 8     | 7     |
| `/notes/journal`                                                                            | 3       | 5     | 5     |
| `/oauth/authorize`                                                                          | 2       | 5     | 6     |
| `/organize`                                                                                 | 3       | 5     | 5     |
| `/plan/goals`                                                                               | 3       | 5     | 6     |
| `/plan/outline`                                                                             | 3       | 5     | 5     |
| `/plan/overview`                                                                            | 4       | 5     | 5     |
| `/plan/projects`                                                                            | 3       | 5     | 5     |
| `/plan/result-areas`                                                                        | 3       | 5     | 6     |
| `/plan/tasks`                                                                               | 5       | 5     | 5     |
| `/plan/wishes`                                                                              | 5       | 5     | 5     |
| `/schedule/agenda`                                                                          | 7       | 7     | 7     |
| `/schedule/calendar`                                                                        | 7       | 7     | 7     |
| `/schedule/day`                                                                             | 9       | 7     | 7     |
| `/schedule/plan`                                                                            | 15      | 7     | 7     |
| `/schedule/time-charts`                                                                     | 3       | 5     | 5     |
| `/schedule/week-plan`                                                                       | 4       | 5     | 5     |
| `/settings`                                                                                 | 13      | 8     | 7     |
| `/signup`                                                                                   | 2       | 5     | 5     |
| Totals: 329 statements, **329 of 329 made a describe trip before binding**. Longest chains: |
| `/finances/scenarios` 9–10, `/finances/bills` 7–8, `/finances/insights` 7–8, `/notes/grid`  |
| 7–8, `/settings` 7–8. The floor is 4 (`/chooser` in both runs; `/finances/activity`,        |
| `/finances/orders`, `/finances/payees`, `/finances/register` in one run or the other) and   |
| most routes sit at 5.                                                                       |

**The "in sequence" figure is noisy by one trip.** 11 of 44 routes moved by exactly 1
between two identical runs, none by more. It is a difference of two best-of-three timings
divided by 20 ms and rounded. Compare the statement count exactly and the chain length with a
tolerance of 1. The "350 of 353" reported at `56e43be3` came out at 329 of 329 here, on
identical page code (only `src/lib/agent/financeTools*` changed in between). Not
investigated; the dev database's contents are the likely difference, which is a reason to
re-measure Task 7 against this same database state rather than against the earlier figure.

### Not measured

- Anything against Neon: TLS with `sslmode=require`, SCRAM through the pooler, the pooled
  endpoint's transaction mode, and the reconnect cost. Task 8 covers these.

## Context

- **Expected gain:** about 15 ms per signed-in page at the ~4.5 ms production round trip
  measured in another session on 2026-10-12. The brief was written before that number existed;
  `plan.md` states it so the decision to implement is made with it in view.
- **Visuals:** None. Nothing on screen changes.
- **References:** see `references.md`.
- **Product alignment:** serves the mission's fast daily-use workflow. Adds two runtime
  dependencies and removes one; neither ties the app to a host (`attachDatabasePool` is a no-op
  off Vercel). `tech-stack.md` gains the driver and pool settings in Task 9.

## Standards Applied

See `standards.md`.
