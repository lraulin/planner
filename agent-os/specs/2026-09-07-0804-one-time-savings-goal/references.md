# References for "A goal you finish"

## Governing specs

### `agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/`

- **Relationship:** Extends **D1** and **D3**. This spec is that one's own named follow-up
  (`plan.md:178`), and its Changes row #4 records how the gap surfaced.
- **Relevant decisions:** D1 made `behavior` the axis that picks the basis — the seam a fourth
  basis plugs into without reshaping anything. D3 requires the bar to mirror the ask rather than
  hold a second opinion, and its Changes row #2 established that a pile with no months left lands
  in the `floor` arm, which is why D3 here has to cover both arms. Its D2 (a raid surfaces through
  next month's carry-in) is the cost this behaviour does _not_ pay: contribution notices a
  withdrawal the same month.

### `agent-os/specs/2026-08-28-1000-ynab-target-engine/`

- **Relationship:** Extends **D1** and **D2**.
- **Relevant decisions:** one nullable target per envelope, with behaviour × cadence as explicit
  axes and exactly seven user-selectable legal pairings in one table. D2's note that "`balance` +
  a repeating cadence _is_ `upTo` — the only difference is what happens after the anchor passes"
  is the distinction this spec extends: what happens after the anchor passes is precisely what
  separates a floor from a finished goal. **D4** ("balance-style targets measure against
  Available, never carry-in") survives for `balance` and is untouched here.

### `agent-os/specs/2026-08-28-2039-target-refill-basis/`

- **Relationship:** Extends **D2** and **D3**.
- **Relevant decisions:** D2 added `since` — "the day this target started asking" — stamped on an
  envelope's first target and preserved through every later edit. That preservation rule is what
  makes D5's hand migration safe. D3 ranks deadline-free asks last in `compareUnderfunded` so a
  $100,000 fund cannot drain Ready to Assign ahead of groceries; a `save` + `none` inherits that
  bucket by cadence, with no change to the comparator.

### `agent-os/specs/2026-08-28-2146-target-since-month-granularity/`

- **Relationship:** Extends. Supersedes `target-refill-basis` D2 in one respect only.
- **Relevant decisions:** `since` is a **month** guard, not a day filter. The contribution window
  is therefore months, and `contributionsFrom` is a `MonthKey`.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends **D3**.
- **Relevant decisions:** one pure ask shared by Assign, the pill, the bar and the drawer. The
  reason the change is `demand.ts` plus the plumbing that feeds it, and the reason Task 6 proves
  the seam held rather than patching each reader.

### Checked and unaffected

- `agent-os/specs/2026-08-28-2223-target-snooze/` — snooze zeroes the target term in
  `neededAssigned`, above every family, and keeps the overspend floor. Basis-independent.
  `snoozeUnavailableReason` needs no arm for a new behaviour.
- `agent-os/specs/2026-08-29-2129-overassigned-available/` — Overassigned reads
  `assigned − needed` in front of the ask, so it is basis-independent. Its D4 fixed the state
  ladder, which D4 here deliberately does not disturb.
- `agent-os/specs/2026-09-06-1215-still-needed-this-month/` — the header is this same ask
  itemised, and `stillNeededGroups` subtotals by envelope `kind`, so a savings goal lands under
  Savings by construction.
- `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/` and
  `agent-os/specs/2026-09-06-1427-bill-anchor-retires/` — no bill can hold this behaviour;
  `schedule` is not a legal cadence for it, and `derive.ts` only ever builds `upTo` + `schedule`.

## Code

### The change

- `src/lib/finances/budget/targets/types.ts:24` (`TARGET_BEHAVIORS`), `:84` (`LEGAL`), `:184`
  (`summarize`) — the one legality table, and its comment on why the omissions are deliberate.
- `src/lib/finances/budget/targets/demand.ts:50` (`DemandEnvelope`), `:130` (`pileDemand`), and
  the module header's "two families, two spreads" claim.
- `src/lib/finances/budget/envelope.ts:230` (`CategoryMonth`), `:326` (`buildBudget`) — the fold
  that walks months in order and already computes the balance recurrence at `:308-309`.
- `src/lib/finances/budget/queries.ts:231-261` (`parsedCategories`, which already parses the
  target) and `:443-447` (the category shape handed to `buildBudget`).
- `src/lib/finances/budget/rows.ts:18` (`BudgetRow`),
  `src/lib/finances/budget/assign/types.ts:38` (`AssignEnvelope`),
  `src/lib/finances/budget/assign/fromBudget.ts:33` (`assignEnvelopeFromRow`) — the plumbing.
- `src/lib/finances/budget/indicator.ts:62` (`BarFill`), `:88` (`horizonOf`), `:214` (`on-track`),
  `:225` (`funded`).
- `src/components/finances/budget/TargetDrawer.tsx:107` (`behaviorsFor`), `:113` (`sentence`),
  `:176-182` (the preview mirroring the server's `since` rule), `:184` (the preview's demand call).

### The seam that must not need changing

- `src/lib/finances/budget/assign/plan.ts:109` (`neededAssigned`, the declared single seam), `:88`
  (`assignedToZeroBalance`, the overspend floor), `:145` (`stillNeeded`), `:230`
  (`compareUnderfunded` — `sinkingCadence` and `isDeadlineFreeFloor` key on cadence, so the new
  behaviour buckets correctly with no edit).
- `src/lib/finances/budget/templates/apply.ts:89` — Apply Targets writes `amountCents` and
  `goalCents` straight from the ask.
- `src/lib/finances/budget/incomePlan.ts:45`, `src/lib/finances/budget/snooze.ts:23`,
  `src/components/finances/budget/BudgetSummary.tsx`, `budgetColumns.tsx`, `FundingChrome.tsx`,
  `BudgetInspector.tsx`, `FixThisDialog.tsx` — all read the folded indicator or ask, never a basis.

### Persistence, unchanged

- `src/db/schema.ts:2670` — `finance_budget_categories.target`, one nullable JSONB per envelope,
  typed `unknown` and parsed on read.
- `src/db/schema.ts:2955-3019` — `finance_budget_allocations`, the per-envelope-per-month ledger.
  Sparse: a missing row means zero. `amount_cents` is **signed**, which is what makes "assigning
  money back out" reduce contribution with no extra concept.
- `src/lib/finances/budget/queries.ts:412-423` — the whole ledger comes back in one unfiltered
  query per render. This is the fact that makes the third basis free.
- `src/lib/finances/budget/mutations.ts:1546` (`saveEnvelopeTarget`, which stamps and preserves
  `since` server-side).

### Pattern to borrow

`pile-spent-is-not-a-raid`'s own implementation is the template: one branch added inside
`pileDemand`, its module header rewritten to state the new load-bearing claim, and tests named for
the sentence they defend rather than for the function they call. Do the same thing one branch
over. For the fold, `assignHistoryFromMonths`
(`src/lib/finances/budget/assign/fromBudget.ts:69`) is the existing precedent for deriving a
per-category history from the months array rather than adding a query.

## Reference implementations elsewhere

- `docs/actual-budget/README.md:33, 90-95` — the target engine is YNAB's, not Actual's. Actual's
  `by` template repeats or floors; it has no "complete once funded" type, and neither does YNAB.
  New design, not a port — noted because the standing rule is to prefer a reference's semantics
  over a plausible reinvention, and here there are none to prefer.
- `docs/achieve-planner/` — nothing. Achieve's "Goals" are the outline hierarchy, unrelated.
