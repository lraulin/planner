# History agent tools — Shaping Notes

**Status: frozen / complete** (2026-08-18)

## Scope

Give the MCP / agent API a read+write surface for Jobs, Residences, and typed
Timeline life events. Delete is out. The derived chronology/ribbon is out.

Twelve tools on a new `history` domain, plus optional external keys so a retry
does not insert a second copy.

### Out of scope

- Delete tools
- Derived chronology / ribbon reads (`job:<id>:start` rows)
- Contacts, resources, fitness
- Linking events to contacts
- Partial dates
- UI changes
- New MCP transport, OAuth, or contract version bump

## Decisions

- Read + write, no delete — confirmed during shaping.
- Timeline **events** are in, Timeline **visualization** is not. The agent
  writes the three source tables; Work/Home edges appear on the grid for free.
- Optional `externalSource`/`externalId` rather than advertising create as
  unsafe. Migration is the cost of a safe retry. The key is a `create*Once`
  argument, not a form field — drawers use `Required<JobInput>`.
- Registry can only publish one retry value; advertise
  `safe_with_external_ref` like metrics, and tell the caller to pass the key.
- New domain `history` rather than stuffing these into outline or library.
  Library is a UI module; `src/lib/history` is the domain.
- Money stays the numeric-string encoding the drawers already use.
- Compact lists; get for supervisor/landlord/notes/duties.

## Context

- **Visuals:** None
- **References:** Life history, agent-tool contracts, MCP transport, finance
  agent tools, `metricTools.ts` as the CRUD handler pattern
- **Product alignment:** Roadmap § Life history already shipped the pages.
  This is the missing AI-integration piece for that data. Achieve has no
  equivalent.

## Standards Applied

- api/agent-tools — one registry, descriptions as selection instructions,
  compact outputs, focused exposure
- api/response-format — `{ ok, data }` on `/api/agent/{tool}`
- api/error-handling — missing/foreign ids look like `not_found`
- api/agent-auth — existing Bearer key; no new identity
- development/testing — integration tests with a second-user case
- development/security — `userId` on every write; register queries in the
  cross-user sweep
- development/clean-code — handlers thin; logic stays in lib
- development/dates — calendar keys, no `Date` for elapsed
- database/migrations — generate, never hand-write the snapshot
