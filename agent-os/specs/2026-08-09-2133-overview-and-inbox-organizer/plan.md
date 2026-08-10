# Overview and Inbox Organizer

**Status: active**  
Spec folder: `agent-os/specs/2026-08-09-2133-overview-and-inbox-organizer/`

## Context

Planner has the modules behind Achieve Planner's productivity process, but not the
Overview that explains and connects them or the one-item-at-a-time Inbox processor that
turns capture into an intentional GTD workflow. This feature adds both surfaces and the
shared project/context tools their links require.

## Decisions

- `/overview` is the default home and the first Plan module.
- Overview keeps Achieve's five-step workflow and link intent in modern Planner-native
  chrome. `New Tasks: N` is a live count, not a link; unsupported `Other Inbox` is omitted.
- The organizer is a dedicated page and a global shell action, not a modal or module.
- Inbox roots are processed one at a time into Task, Project, Calendar, Defer, Delete, or
  Not actionable → reference note.
- Calendar and reference-note outcomes are blocked for branches with descendants. Delete
  intentionally deletes the branch after the user selects Delete and presses Process.
- Defer requires a future return date, keeps the branch in Inbox, follows Planner's unified
  postponed shelf model, and may create a named child follow-up task. Reminders and a
  separate state selector are out of scope.
- One hierarchy-aware Project Picker serves Tasks, Overview pre-navigation, and the
  organizer. Quick Capture's flat destination selector is not changed in this spec.
- Master Contexts is a per-user suggestion catalog backfilled from observed record tags.
  Removing a master context never rewrites tags already stored on records.
- Broader Someday/Maybe modelling remains future work.

## Acceptance criteria

- [x] `/` redirects to `/overview`; Overview is first in module navigation and command search.
- [x] The responsive five-step process links to the intended Planner workflows.
- [x] `New Tasks: N` reports currently processable direct Inbox items as plain text.
- [x] Tasks uses the shared hierarchical picker while preserving All Projects, No Project,
      `?scope=`, reload, and Back behavior.
- [x] Overview project-specific actions select a project before opening scoped Tasks.
- [x] The organizer is reachable from desktop/mobile shell chrome and the command palette.
- [x] Each organizer outcome applies the agreed focused fields and advances only on success.
- [x] Active shelves leave the queue and automatically re-enter on expiry.
- [x] Calendar/reference-note outcomes cannot discard descendants; all other branch behavior
      is explicit and safe.
- [x] Calendar processing deletes the source only after creation succeeds and retries cannot
      create duplicate appointments.
- [x] Master Contexts is user-scoped, initially contains observed values only, and supplies
      suggestions without constraining free-text record contexts.
- [ ] Desktop/mobile, light/dark, tests, migration, smoke, and production build pass.

## Changes from original plan

Material refinements during implementation. Pure implementation details are omitted.

| #   | Change                                                                                                                           | Why                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Destination tree selects result areas and goals as well as projects; empty result areas appear even with no projects under them. | Achieve files tasks/projects under result areas; the first picker only marked `type === "project"` selectable and only listed RAs that already had projects, so the organizer could not put work under an RA. |
| 2   | Shared picker is a collapsible name-only tree (expand/collapse), not a flat always-expanded list.                                | This is the one Achieve surface that shows hierarchy as a plain node tree; expand/collapse was missing.                                                                                                       |
| 3   | Tasks scope and Overview also accept result-area (and goal) selection from the same tree.                                        | Subtree scope already works for any node via `?scope=`; blocking RA selection only made the tree less navigable.                                                                                              |
| 4   | Flat (ungrouped) picker lists goals and dreams as peers of projects; dream rows keep the dream kind.                             | In Achieve's Tasks picker, goals/dreams are interchangeable with projects as the scope for "show this branch's tasks."                                                                                        |

## Verification

- Migration applied locally; a second generation reports no schema drift.
- Unit suite: 1,700 passing tests. Full suite: 2,206 passing tests across 166 files,
  including live Postgres integration coverage with no skips.
- Formatting, typecheck, lint, and the production build pass.
- Runtime smoke initially exposed `MobileNav` crossing the server/client event-handler
  boundary. Marking that interactive shell component as client code fixed the cause; all
  25 routes then rendered successfully, including `/overview`, `/organize`, and `/tasks`.
- Pending: the required 1280×800 and 390×844 light/dark browser pass. The browser runtime
  reported no connected browser in this session, so the visual acceptance item and freeze
  remain open.

## Task 1: Save spec documentation

- Save this active plan, shaping notes, standards, references, and supplied visuals.

## Task 2: Data and domain foundations

- Add the master-context catalog, appointment organizer-source idempotency, generated
  migration/backfill, organizer queue and outcome mutations, queries, and focused tests.

## Task 3: Shared Project Picker

- Build the reusable hierarchy/filter core plus dialog and embedded presentations.
- Replace the Tasks flat project selector without changing its URL contract.

## Task 4: Overview and organizer UI

- Build the five-step Overview, exact link actions, context editor, organizer page, and
  desktop/mobile shell entry points.

## Task 5: Product alignment and verification

- Promote Inbox processing in product docs, run the full automated gate, and verify the
  workflows in real browsers at 1280×800 and 390×844 in both color schemes.

## Task 6: Freeze and deliver

- Align this record to the as-built result, record material drift, mark the spec frozen,
  commit logical changes, and push `origin/master`.

While this spec is active, material requirement, design, or scope changes must update this
document and the changes table. Freeze only after verification.
