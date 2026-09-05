# Standards for Bill due dates and lead time

Applied as of standards commit `81b5fe3384620ca1e6163feacb64b280c793f204`. References, not
copies — see AGENTS.md. `git show 81b5fe3:agent-os/standards/<path>` recovers exactly what
applied at shape time.

- `agent-os/standards/development/clean-code.md` — the governing standard here. "When the model
  is wrong, change the model" is what licenses a schema change plus a rewrite of `billAnchor`
  rather than a tolerance tweak, and its two-workarounds signal is present twice: a fact stored
  in a column nothing reads (`due_day`), and a second column overloaded to cover for it
  (`anchorDate`, three meanings). Also governs D7 — the review filter is business logic and
  belongs in lib, not inline in `BillsView.tsx`.
- `agent-os/standards/development/dates.md` — every line of the new occurrence arithmetic is
  calendar-day work on `YYYY-MM-DD` keys. No `Date` for month shifting, no `startOfDay` on a date
  column, `todayKey` supplied by the caller. The Aug 1 → Jul 31 regression is exactly the class
  of bug a due-day series would reintroduce.
- `agent-os/standards/development/testing.md` — the new module is pure logic in `src/lib/**` with
  a test beside it; the `lead_days` write path gets an integration test, and it is not done until
  a second user has failed to read, change and delete the first user's row. Also the rule that a
  test earns its place by failing on a plausible mistake — hence the real 24-posting fixture and
  the "undeclared bills are unchanged" regression test, not coverage for its own sake.
- `agent-os/standards/database/migrations.md` — `lead_days` and the widened bill-facet CHECK are
  generated with `npm run db:generate`, never hand-written.
- `agent-os/standards/development/security.md` — `leadDays` and `dueDay` travel the existing
  `upsertBillEnvelope` path; every mutation takes `userId` and scopes by it in the `where`.
- `agent-os/standards/components/data-grid.md` — the new hideable **Due** column on the Bills
  grid: filterable, sortable, width- and visibility-persisted like its neighbours, through the
  existing `useModuleViews` setup.
- `agent-os/standards/components/drawer-pattern.md` — the lead-days field joins the existing bill
  drawer/inspector fields; commit-on-blur like the due-day input beside it.
- `agent-os/standards/components/responsive.md` — the new numeric input needs the 16px rule (iOS
  zoom) and a 44px tap target, matching the `fieldClass` already used in `BillFields.tsx`.
- `agent-os/standards/api/agent-tools.md` — `leadDays` is added to the bill create/update
  contracts with an intent-shaped description, keeping the strict schema and the canonical
  registry in step.
- `agent-os/standards/development/commits.md` — one logical change per commit; the model
  correction, the cleanup, and the UI are separable commits. The body names the root cause.

## Deviations

- **The grace floor is set from observed data, not from a principle.** `graceDays` gains a floor
  of 7 rather than 5 because 6 days was the worst real lateness of a rent posting against its
  calendar occurrence. This is a magic number justified by a measurement rather than by a rule,
  and it is written down here so the next reader knows it can be re-derived rather than guessed
  at.
- **D5 makes an existing editable cell read-only** for bills that declare a due day. That
  narrows `2026-08-25-0901-bill-next-charge` D1/D2, which shipped that editor deliberately. The
  trade is recorded in `shape.md` under "Open question deferred to implementation".
- **Task 7 removes exported symbols with no callers.** Nothing in the standards forbids this, but
  it is worth stating that the deletions were verified by a repo-wide sweep separating production
  from test callers, not by a linter — the repo has no dead-export tooling, and
  `@typescript-eslint/no-unused-vars` is module-local and would never have seen them.
