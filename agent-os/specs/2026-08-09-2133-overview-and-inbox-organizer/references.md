# References for Overview and Inbox Organizer

**Status: frozen / complete** (2026-08-27)

## Product and workflow

- `docs/achieve-planner/README.md` — local reference-pack routing and source precedence.
- `docs/achieve-planner/workflow-and-training.md` — Overview, New Task Organizer, and
  Master Context workflow intent.
- `docs/achieve-planner/user-manual.md` and `online-help.md` — Tasks project scoping and
  All Projects behavior.
- `agent-os/specs/2026-07-30-1018-inbox-quick-capture/` — Inbox-as-project, captured tasks,
  nested branches, and prior project-picker follow-up.

## Existing implementation patterns

- `src/components/outline/OutlineCommandDialogs.tsx` — searchable hierarchical picker
  presentation and ancestor context.
- `src/components/tabs/TasksGrid.tsx` plus `src/components/tabs/useGridTab.ts` — existing
  `?scope=` contract, All Projects, and No Project behavior.
- `src/components/detail/ModalShell.tsx` — short return-a-value dialog container.
- `src/lib/tree/` — hierarchy, shelving, user-scoped mutations, and outline queries.
- `src/lib/schedule/` — appointment validation and Google write-through creation.
- `src/components/detail/fields.tsx` — shared context entry surface.

## Visual files

- `overview-reference.png` — Achieve Overview process and link groups.
- `organizer-task.png`, `organizer-defer.png`, `organizer-defer-dialog.png`,
  `organizer-not-actionable.png` — supplied organizer states.
- `gtd-flowchart.png` — supplied GTD classification semantics.
- `project-picker-reference.png` — Choose Project hierarchy/filter dialog.
- `master-contexts-reference.png` — Master Contexts add/delete dialog.
