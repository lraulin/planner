# Scaffold + Outline Tab — Shaping Notes

## Scope

Bootstrap the application (Next.js + TypeScript + Tailwind + Drizzle + Postgres) and build
the **Outline tab** — a single tree view of the whole hierarchy:

```
Result Areas  (optionally grouped by category)
  └─ Dreams/Goals
       └─ Projects
            └─ Tasks
```

with arbitrary nesting depth at every level.

The Outline tab is the first slice because it is the app's spine — the Projects tab, Tasks
tab, and Weekly Schedule all read from this same tree.

### Out of scope for this spec

- **Per-type detail forms.** In Achieve, each type opens its own distinct multi-tab form.
  The schema anticipates them; building them is separate work.
- Drag-and-drop reordering (keyboard + toolbar commands cover it for now).
- Saved views / the View dropdown and the Views/Filters sidebar.
- Tasks tab, Projects tab, Weekly Schedule tab, Notes tab.
- Real authentication.

## Decisions

- **Schema: shared tree table + per-type detail tables.** One `nodes` table owns tree
  structure and every field visible in the outline grid; fields exclusive to one type live
  in a side table keyed by node id. Chosen over separate-table-per-type because the Outline
  tab renders all four types as one tree, and over a single flat table because each type
  has its own complex form with substantial unique fields.

- **Adjacency list + fractional sort keys.** `parent_id` self-reference for structure plus a
  lexicographic `sort_key` for sibling order, so a move rewrites one row instead of
  renumbering siblings. Reads use a recursive CTE.

- **L.A.P. is computed, not stored.** Derived in the same recursive CTE that loads the tree.

- **Auth: `user_id` on every row, no login.** A single `getCurrentUserId()` returns a seeded
  dev user, so adding real auth later touches one function rather than every table. Chosen
  to satisfy "multi-user ready" from `agent-os/product/mission.md` without paying for auth
  UI now.

- **Type constraints in application code.** Legal parent/child pairs live in one exported
  table (`hierarchy.ts`) rather than database CHECK constraints, so the rules are testable
  and can loosen without a migration.

- **Drizzle over Prisma.** SQL-first and better suited to the recursive CTEs this app leans
  on heavily.

## Context

- **Visuals:** `visuals/` — `OutlineTabSS.png` (primary reference), plus `ProjectsTabSS.png`,
  `TasksTabSS.png`, `WeeklyScheduleSS.png`, `OverviewTabSS.png`. Original captures and
  saved vendor pages are in the repo root `screenshots/`.
- **References:** None in-repo — the codebase was empty at the start of this spec. See
  `references.md` for the external reference material.
- **Product alignment:** Implements the "Project/task outline" item from Phase 1 of
  `agent-os/product/roadmap.md`, and the "multi-user ready" constraint from
  `agent-os/product/mission.md`. Confirms the `agent-os/product/tech-stack.md` choices and
  closes its open ORM question in favor of Drizzle.

## Standards Applied

None. `agent-os/standards/index.yml` is empty — see `standards.md`.

## Open Questions

- **"Fo" column** is Focus, a boolean used for filtering. Confirm whether it carries any
  other behavior (e.g. feeding a focus view or the weekly planning wizard).
- **"L.A.P."** is believed to be inherited ancestor priority, used as a sort key —
  consistent with `ProjectsTabSS.png`, where children of "ACME Account" (priority A) all
  show `A`. Confirm against the running app.
- **Result Area groups** — the `Group by Category` checkbox on the Outline tab implies
  categories above Result Areas. Modeled as a nullable text field on
  `result_area_details` for now; may warrant its own entity.
- **Status values** — `NS` / "Need to Start" / "On Schedule" / "Not Scheduled" are visible
  in the screenshots. The full set and which are computed vs. user-set is not yet confirmed.
