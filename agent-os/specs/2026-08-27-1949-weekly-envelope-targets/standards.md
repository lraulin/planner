# Standards for Weekly envelope targets

Applied as of standards commit `91b94c63894ceb565c206327847af2185a9b194d`. References, not
copies — `git show 91b94c6:agent-os/standards/<path>` recovers exactly what applied here.

- `agent-os/standards/development/clean-code.md` — the no-speculative-generality rule is what
  D4 is: a weekly line gets a weekday and an amount, and every-N-weeks waits for a category
  that needs it. Also the dependency direction: the occurrence math and the history suggestion
  are pure `src/lib/**` modules, the drawer only renders them.
- `agent-os/standards/development/testing.md` — the occurrence count and the suggestion are
  exactly the "pure logic where a wrong answer looks plausible" case. The carry-in test (D3)
  exists because it would fail on a plausible mistake, not for coverage. No React component
  tests. The `saveEnvelopeTemplates` integration test carries the second-user case.
- `agent-os/standards/development/dates.md` — the weekday of a calendar day must come from the
  UTC-noon encoding (`weekdayOfDateKey`), never `new Date(key).getDay()`, which reports
  Saturday evening for a Sunday in the Americas. Month length comes from `monthEndKey`.
- `agent-os/standards/components/drawer-pattern.md` — the weekly line is edited in the existing
  `TemplateDrawer`, which keeps its explicit Save that stays open. The new fields join that
  form; they do not get a dialog.
- `agent-os/standards/components/responsive.md` — the weekday control and amount field must
  keep the 44px tap target and the 16px input rule below `md`, like every other field in the
  drawer.
- `agent-os/standards/development/commits.md` — one logical change per commit; the commit that
  lands the demand math says in its body that carry-in deliberately does not reduce it.

## Deviations

- **Actual's `periodic` template is implemented only in part** (D4). Theirs carries
  `period: {unit: day|week|month|year, amount}`, a `starting` date and an optional `limit`;
  ours carries a weekday and an amount. The demand _semantics_ are Actual's — occurrences in
  the month × amount, carry-in ignored — and the header comment on `weekly.ts` will name
  `runPeriodic` in `packages/loot-core/src/server/budget/category-template-context.ts` as the
  source. This is a narrowing, not a disagreement, and it is the deviation to revisit first if
  a biweekly category ever appears.
- **No new standard is proposed for the drawer copy** (D6). The contribution-vs-balance
  vocabulary is a decision about this feature's UI, recorded in `plan.md`; it becomes a
  standard only if a second surface needs the same distinction.
