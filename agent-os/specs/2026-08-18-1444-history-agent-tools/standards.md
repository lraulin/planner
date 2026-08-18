# Standards for History agent tools

**Status: frozen / complete** (2026-08-18)

Full files stay in `agent-os/standards/`. This spec references them rather than
copying their bodies.

## `api/agent-tools.md`

One registry, one write path through `src/lib/**`. HTTP discovery, generated
docs, and MCP are projections. Descriptions are selection instructions.
Focused exposure: these twelve tools are `domain`, not core. Compact list rows;
full form only on get. Reject unknown fields. Keyed creates advertise
`safe_with_external_ref`.

## `api/response-format.md`

`/api/agent/{tool}` keeps `{ ok, data }` / `{ ok, error }`. Tool output schemas
describe the value under `data`. MCP stays JSON-RPC.

## `api/error-handling.md`

Missing and foreign ids are `not_found` with the same shape. Date-order and
money-format throws from `lib/history/fields.ts` map to `validation`. Postgres
messages never leak.

## `api/agent-auth.md`

Existing Bearer key and `PLANNER_AGENT_USER_EMAIL`. No new identity.

## `development/testing.md`

Tool functions that touch the database get `historyTools.integration.test.ts`
with a second-user case. Pure parse/filter helpers, if extracted, get a sibling
unit test. No React tests.

## `development/security.md`

Every mutation already takes `userId`. Register `listJobs`, `listResidences`,
and `listLifeEvents` in `src/lib/db/crossUserReads.integration.test.ts`.

## `development/clean-code.md`

Handlers in `src/lib/agent/historyTools.ts` parse and dispatch. SQL stays in
`src/lib/{jobs,residences,timeline}`. No speculative generality.

## `development/dates.md`

Jobs/residences/events store calendar days as `date({ mode: "string" })` — the
stored value _is_ the `YYYY-MM-DD` key (life-history spec). Do not wrap them
in UTC-noon `Date` objects. Duration stays client-side.

## `database/migrations.md`

`npm run db:generate`. Commit the `.sql`, snapshot, and `_journal.json`
together. Apply locally with `npm run db:migrate`.
