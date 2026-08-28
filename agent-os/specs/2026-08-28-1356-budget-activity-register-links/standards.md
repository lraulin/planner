# Standards for Budget Activity → filtered Register

Applied as of standards commit `154ded766693b30f8376199159a6eb5b350415d7`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/data-grid.md` — Activity is column `render`, not a new grid. Register chips explain the view; `viewRows` owns the contributing set. Do not persist this as a surprise Register layout.
- `agent-os/standards/components/navigation.md` — this is a page-to-page link (`/finances/budget` → `/finances/register`), not a new command or destination. Extra query params follow the existing tag/uncategorized deep-link family.
- `agent-os/standards/components/ux-principles.md` — navigation, not a modal. Scanning Budget, click through to the rows, Back to return.
- `agent-os/standards/components/responsive.md` — `md` split unchanged; Activity is a 44px tap target below it and must not steal name-tap (inspector sheet).
- `agent-os/standards/development/testing.md` — contributing-set filter and href/query parsing live in `src/lib/**` with tripwire tests. No React component tests. No new mutations, so no new integration file unless a query is added.
- `agent-os/standards/development/clean-code.md` — one shared predicate with `activitySince` rather than a second copy of transfer/split/on-budget rules. Components do not touch the db.
- `agent-os/standards/development/dates.md` — Budget month is a MonthKey (`YYYY-MM-01`); URL param is `YYYY-MM` via `monthKeyFromParam` / `monthParamOf`. No `Date` arithmetic on the month string.
- `agent-os/standards/development/commits.md` — one logical change per commit; Spec trailer to this folder.

## Deviations

None.
