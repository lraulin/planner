# Standards for "A goal you finish"

Applied as of standards commit `a1645dc`. References, not copies — see `AGENTS.md`.
`git show a1645dc:agent-os/standards/<path>` recovers exactly what applied at shape time.

- `agent-os/standards/development/testing.md` — the real logic is in `src/lib/finances/budget/**`
  and every piece of it gets a `*.test.ts` beside it. Nothing here touches the database, so there
  is **no** `*.integration.test.ts` and no cross-user case to write; the commit says so explicitly
  rather than leaving a reader to wonder whether it was skipped. Components change, so
  `npm run smoke` is a step in Task 7 — a green unit gate is not proof the app renders. No React
  component tests.
- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the model" is
  the whole justification for a fourth behaviour rather than a flag: two workarounds for the same
  missing concept (a floor that nags when it should not, and a pile basis that nags forever) is
  the stated signal. Equally load-bearing here is the prohibition it sits beside: no speculative
  generality, which is why `add` + `year` / `add` + `by` stay illegal even though this spec makes
  them newly computable. Also the dependency direction — `lib` never imports `app`, and the fold
  in `envelope.ts` stays target-agnostic so `buildBudget` does not learn about goals.
- `agent-os/standards/development/commits.md` — one logical change per commit across Tasks 2–5,
  each with a body saying what the change is _for_; the canonical `Spec:` trailer pointing at this
  folder. Nobody reviews these before they land.
- `agent-os/standards/development/dates.md` — `since` is `YYYY-MM-DD` and `MonthKey` is `YYYY-MM`;
  the contribution window is a **month** comparison (`target-since-month-granularity`), never a
  day filter and never `startOfDay` on a calendar field.
- `agent-os/standards/components/ux-principles.md` — the drawer's "The job" radio is form chrome
  in an existing drawer; nothing new is invented for it.
- `agent-os/standards/components/data-grid.md` — the Budget grid's Available pill, name-column
  copy and funding bar are existing shared chrome (`FundingChrome.tsx`). This spec adds a copy
  string and a bar basis, not a new cell renderer.

## Deviations

**None.** One worth naming as _not_ a deviation: D4 stores nothing, which looks like the
"fact recomputed at read time because nothing stores it" that `clean-code.md` lists as a signal
that the model is wrong. It is not that here. The ledger already stores every contribution; "done"
is a _consequence_ of those rows, not a fact missing from them. Storing it would create a second
copy that can disagree with the ledger — and it is the copy that would go stale the moment money
moved.
