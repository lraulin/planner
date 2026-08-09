# Result Areas without lifecycle state

**Status: frozen / complete** (2026-08-09)
Spec folder: `agent-os/specs/2026-08-09-0915-result-areas-without-state/`

This is the authoritative as-built record. Future changes to Result Area lifecycle or
scheduling semantics should open a new delta-spec rather than re-opening this one.

## Context

Achieve Planner describes Result Areas as enduring life dimensions or roles and explicitly
disables Complete for them because they cannot be completed. Its Result Area detail fields
do not include State. Planner inherited the shared-record implementation detail instead:
`nodes.state` is required and defaults every new item to Not started, so Result Areas can be
started, postponed, completed, rolled up, and changed through every shared action surface.

This delta-spec corrects that mismatch. Result Areas have no lifecycle state; the shared
schema represents that semantic absence as `NULL`, and every consumer preserves it.

## Decisions

- `nodes.state` is nullable, with a database constraint enforcing `NULL` for Result Areas
  and a real state for Goals, Projects, and Tasks.
- Result Areas also require `completed_at` and `deferred_date` to be `NULL`; the migration
  clears legacy lifecycle data without changing descendants.
- Converting to Result Area clears lifecycle data. Converting from Result Area initializes
  `not_started`.
- Result Areas return `state: null` in stable shared and agent response shapes. Agent
  create/update requests that provide a Result Area state are rejected.
- Shared Outline lifecycle columns remain available but render blank and read-only for
  Result Areas. The default open State filter includes blanks; explicit filters may include
  or exclude `(Blanks)`. State grouping labels their final bucket `(No State)`.
- Result Areas receive no derived schedule status and never inherit a child's status.
- Complete and State commands remain visible but disabled with a specific reason. A mixed
  selection containing a Result Area disables the whole lifecycle action rather than
  silently changing only part of the selection.
- The Result Areas module has no State column, Postponed switch, cascade dialog, or
  right-swipe lifecycle action. Left-swipe Delete remains.

## Acceptance criteria

- [x] New and migrated Result Areas store null state, completion time, and defer date.
- [x] The database rejects Result Areas with lifecycle data and non-Result-Areas without a state.
- [x] Direct mutations, detail saves, commands, imports, and agent tools cannot assign a Result Area state.
- [x] Conversion applies the defined clear/initialize rules.
- [x] State cascades continue among stateful items but do not settle or reopen Result Areas.
- [x] Weekly review includes every Result Area.
- [x] Result Area State, Abbreviated State, Completed, Completed on, and Status cells are blank in Outline.
- [x] The default Outline includes Result Areas; the State funnel exposes `(Blanks)` and can exclude them.
- [x] State grouping places Result Areas under `(No State)` after named states.
- [x] Lifecycle commands are disabled with an explanatory reason for Result Areas and mixed selections.
- [x] Result Areas has no lifecycle control or right-swipe lifecycle action; Delete remains available.
- [x] Goals, Projects, and Tasks retain their existing lifecycle behavior.

## Code map (as built)

| Concern                                    | Location                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Stored invariant                           | `src/db/schema.ts`, `drizzle/0030_rich_crusher_hogan.sql`                             |
| Type-aware lifecycle rule                  | `src/lib/tree/lifecycle.ts`                                                           |
| Creation, conversion, state mutation       | `src/lib/tree/mutations.ts`                                                           |
| Detail-save validation                     | `src/lib/detail/mutations.ts`                                                         |
| Cascades, shelving, status, filters/groups | `src/lib/tree/`, `src/lib/grid/`                                                      |
| Shared Outline cells and commands          | `src/components/grid/`, `src/components/outline/`                                     |
| Dedicated Result Areas UI                  | `src/components/detail/ResultAreaForm.tsx`, `src/components/tabs/ResultAreasGrid.tsx` |
| Import/export and agent contracts          | `src/lib/achieve/`, `src/lib/agent/`                                                  |

## Verification

- Migration applied to local Postgres; all 13 existing Result Areas have null state,
  completion time, and defer date, while every Goal, Project, and Task has a state.
- 1,662 unit tests and 491 integration tests passed; integration tests used real Postgres.
- Lint, typecheck, formatting, migration drift check, production build, and the 23-route
  smoke test passed.
- Desktop and phone browser passes verified blank shared cells, the `(Blanks)` filter,
  disabled command reason, lifecycle-free module/drawer, no right-swipe action, and retained
  left-swipe Delete.

## Changes from original plan

No material requirement, design, or scope changes were needed during implementation.

---

## Task 1: Save spec documentation — done

Create this active delta-spec with shaping decisions, references, and the full applicable
standards.

## Task 2: Database and domain invariant — done

- Make state nullable in the Drizzle schema and generate the migration artifacts.
- Backfill Result Area lifecycle columns to `NULL`, then add the type-aware check constraint.
- Centralize lifecycle support in `src/lib/tree/`; use it in creation, conversion, detail
  saving, and state mutations.
- Add database integration coverage, including second-user read/change/delete attempts.

## Task 3: Shared lifecycle and external contracts — done

- Make tree/detail/agent shapes state-nullable and update shelving, cascade, filtering,
  grouping, weekly-review, and schedule-status logic.
- Ignore lifecycle data on imported Result Areas and keep exports lifecycle-free.
- Return `state: null` from agent reads and reject Result Area state in create/update tools.

## Task 4: UI and commands — done

- Remove lifecycle controls from the Result Area form and module.
- Render Result Area lifecycle projections blank in shared Outline columns.
- Include blanks in the default open State filter and add the `(No State)` grouping bucket.
- Disable lifecycle commands for Result Areas and mixed selections with a specific reason.
- Remove only the right-swipe lifecycle action from Result Areas.

## Task 5: Verify and freeze — done

- Run the migration and inspect SQL/snapshot/journal.
- Run unit and real-Postgres integration tests, lint, typecheck, build, and smoke.
- Verify desktop and phone behavior with the Planner browser driver.
- Record material as-built changes, update the roadmap wording, mark acceptance complete,
  freeze this spec, commit, and push to `origin/master`.

## Follow-ups (new work — not amendments to this frozen spec)

- Deadline and target-date semantics for Result Areas are unchanged and can be revisited in
  a separate delta-spec if Achieve documentation establishes a broader scheduling rule.
