# History agent tools (Jobs, Residences, Timeline events)

**Status: frozen / complete** (2026-08-18)
Spec folder: `agent-os/specs/2026-08-18-1444-history-agent-tools/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-2006-life-history/` — field sets, exact
  `YYYY-MM-DD` dates, open vocabularies, money as numeric strings, duration stays
  client-side, user-scoped rows.
- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` — one Zod
  registry, strict schemas, compact lists, `retryableObject` for keyed creates,
  effects/retry metadata. Contract version stays **2**.
- **Extends:** `agent-os/specs/2026-08-13-1730-remote-mcp-transport/` and
  `agent-os/specs/2026-08-13-1805-mcp-oauth/` — new tools ride the existing MCP
  adapter; no second write path.
- **Extends:** `agent-os/specs/2026-08-14-1208-finance-agent-tools/` — how a new
  domain is added (`domain` enum, `exposure: "domain"`, handlers in
  `src/lib/agent/*Tools.ts`).

## Context

The planner MCP can write outline, notes, calendar, weekly plans, metrics, and
finances. Jobs, Residences, and Timeline life events already have user-scoped
mutations in the app, but they are not in the agent registry. That is why an MCP
session cannot record employment, housing, or dated life facts.

This is a contract slice, not a UI change. Achieve has no life-history feature;
these records are personal reference data from the life-history spec.

## Decisions

- **Twelve tools**, new domain `history`, `exposure: "domain"` (core stays ten
  tools):
  - Jobs: `list_jobs`, `get_job`, `create_job`, `update_job`
  - Residences: `list_residences`, `get_residence`, `create_residence`,
    `update_residence`
  - Typed Timeline events: `list_life_events`, `get_life_event`,
    `create_life_event`, `update_life_event`
- **No delete.** Matching the confirmed surface. Existing `delete*` mutations
  stay UI-only.
- **No derived chronology tool.** Timeline grid rows (`job:<id>:start`) are
  computed at read time. The agent reads and writes the three source tables; it
  does not mutate derived Work/Home rows.
- **Optional external keys.** Add `externalSource` / `externalId` plus a
  per-user unique index on `jobs`, `residences`, and `life_events`. Creates use
  `retryableObject` and `create*Once` (same race-safe pattern as
  `createMetricOnce`). A replay returns the existing row with `created: false`.
- **Registry retry field is one value.** Advertise `safe_with_external_ref` on
  create tools, matching metrics/notes/nodes. A create without a key is still
  unsafe in behavior; the description tells the caller to pass a key to retry.
- **Money stays numeric strings** (`"62500.50"`), not finance integer cents.
  Inputs accept a number or a string and store the numeric string.
- **Dates stay `YYYY-MM-DD` keys.** Duration is not computed. `create_life_event`
  requires `eventDate`; jobs/residences may leave dates null.
- **Open vocabularies stay free text.** Schema descriptions may mention the
  suggestion lists; they are not enums.
- **Lists are compact; get is the full form.**
  - Job list: id, employer, jobTitle, employmentType, startDate, endDate,
    location
  - Residence list: id, label, city, region, country, movedIn, movedOut,
    housingType, address
  - Event list: id, eventDate, title, category
- **List filters:** optional `query`, `from`/`to` date keys, `currentOnly` (null
  end / movedOut) on jobs and residences, plus offset pagination like
  `list_metrics`.
- **Inputs stay flat** and match `JobInput` / `ResidenceInput` / `LifeEventInput`.
- **No contract version bump.** Additive, like the finance tools.

## Acceptance criteria

- [x] The twelve tools appear in `list_tools` with `domain: "history"` and in
      MCP `tools/list`.
- [x] Default `list_tools` (core) is still exactly ten tools.
- [x] `create_*` with the same `externalSource`/`externalId` replays the original
      row unchanged and returns `created: false`.
- [x] `update_*` is a strict partial: omitted fields stay; `null`/empty clears
      dates and money the same way the UI mutations do.
- [x] `create_life_event` without `eventDate` is a `validation` error;
      end-before-start on a job or residence is `validation` with the shared
      history message, not a Postgres leak.
- [x] A second user cannot read or update the first user's jobs, residences, or
      events; missing and foreign ids both return `not_found`.
- [x] Unknown fields are rejected by name. `docs/agent-api.md` is regenerated
      from the registry.
- [x] Unit, integration (Postgres, no skip warning), lint, typecheck, and
      `next build` pass.

## Changes from original plan

| #   | Change                                                                                                                     | Why                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | External retry keys are a third argument to `create*Once`, not fields on `JobInput` / `ResidenceInput` / `LifeEventInput`. | The drawers type the form as `Required<JobInput>`. Putting `external` on the input type made TypeScript require it in the UI. |

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`. No
`visuals/` — none were provided.

## Task 2: External-key migration

Add nullable `externalSource` / `externalId` and a partial unique index on
`(user_id, external_source, external_id)` to `jobs`, `residences`, and
`life_events`. Generate via `npm run db:generate`; commit SQL + snapshot +
journal together. Apply locally.

Extend the three input types with optional `external`. Add `createJobOnce`,
`createResidenceOnce`, `createLifeEventOnce` next to the existing creates (keep
the current functions as thin wrappers). Integration tests: replay returns the
same id; two users may reuse the same key; unique conflict is race-safe.

## Task 3: Schemas and registry

Add the twelve tools to `src/lib/agent/contracts.ts` and
`src/lib/agent/tools.ts`. New domain `history` on `AgentToolDomain` and
`list_tools`'s domain enum. Handlers in `src/lib/agent/historyTools.ts`. Update
`list_tools` useWhen and MCP initialize instructions to mention history. Do not
bump `AGENT_CONTRACT_VERSION`.

## Task 4: Tests, docs, freeze

- `historyTools.integration.test.ts`: create/list/get/update round-trips; keyed
  replay; date-order validation; second-user isolation on read and write.
- Update `tools.test.ts` domain inventory for `history`.
- Register jobs/residences/events in
  `src/lib/db/crossUserReads.integration.test.ts`.
- `npm run agent:docs` so `docs/agent-api.md` matches the registry.
- Update `agent-os/product/roadmap.md` under Life history / AI integration.
- Verify, then freeze the spec.

## Implementation notes

- One write path: tools call `src/lib/{jobs,residences,timeline}/**` only.
- Map domain throws (“Job not found.” / “Residence not found.” / “Event not
  found.” / date-order / money format) to `not_found` or `validation`.

## Code map (as built)

| Concern                          | Location                                              |
| -------------------------------- | ----------------------------------------------------- |
| External-key columns             | `src/db/schema.ts`, `drizzle/0051_chief_mole_man.sql` |
| Keyed creates                    | `src/lib/{jobs,residences,timeline}/mutations.ts`     |
| Tool handlers                    | `src/lib/agent/historyTools.ts`                       |
| Schemas                          | `src/lib/agent/contracts.ts`                          |
| Registry + discovery             | `src/lib/agent/tools.ts`                              |
| MCP orientation sentence         | `src/lib/agent/mcp.ts`                                |
| Generated contract documentation | `docs/agent-api.md`                                   |

## Follow-ups (new work — not amendments to this frozen spec)

- Delete tools, if an agent ever needs to remove a biography row.
- A derived chronology / ribbon read, if the agent needs the picture rather
  than the three source tables.
