# Standards for Drop register upcoming strip; add bills days remaining

Applied as of standards commit `50d3a50dacc7cd282eab3240c81778b7c06506e1`. References, not
copies — see AGENTS.md. `git show 50d3a50:agent-os/standards/<path>` recovers exactly what
applied at shape time.

- `agent-os/standards/components/data-grid.md` — new column on the shared Bills DataGrid;
  default order, compact meta, sort/filter, `withNewColumns` for saved layouts.
- `agent-os/standards/components/responsive.md` — compact list below `md` must show days
  remaining as meta, not only the desktop column.
- `agent-os/standards/components/ux-principles.md` — Register stays a grid of transactions;
  glance chrome that duplicates another page is clutter.
- `agent-os/standards/development/dates.md` — calendar-day arithmetic via `daysBetweenKeys`;
  `todayKey` supplied by the caller (`data.todayKey`), never `startOfDay` / local `Date`
  getters on a stored key.
- `agent-os/standards/development/testing.md` — `billDaysRemaining` is pure logic in
  `src/lib/**` with a sibling unit test. No React component tests. No DB, so no
  integration file.
- `agent-os/standards/development/clean-code.md` — one helper next to `billDueSoon`, not a
  mode flag on Agenda's column. Dead Register upcoming plumbing is deleted, not left as
  an unused export.
- `agent-os/standards/development/commits.md` — one logical change; the message should
  name both sides (strip gone, column added) only if they land together, otherwise split.

## Deviations

None.
