# References for "A pile spent on its own purpose does not ask again"

## Governing specs

### `agent-os/specs/2026-08-28-2039-target-refill-basis/`

- **Relationship:** Supersedes **D1**'s pile half, for `upTo` piles only.
- **Relevant decisions:** D1 split targets into a period family (basis: carry-in) and a pile
  family (basis: Available, "because raiding a pile has to ask for it back"). The period half
  and its argument — activity is consumption of funding, not a demand for it — is the
  argument this spec extends to `upTo` piles. **D2** (`since`, whole-month counting), **D3**
  (a deadline-free floor is a real ask, ranked last) and **D4** (accepted consequences) carry
  forward untouched. Its acceptance criteria checked propane in August and November and never
  in October, which is the gap this spec closes.

### `agent-os/specs/2026-08-28-1000-ynab-target-engine/`

- **Relationship:** Supersedes **D4** for `upTo`; extends **D2** and **D5**.
- **Relevant decisions:** D2's behaviour × cadence matrix (`add`: week/month; `upTo`:
  week/month/year/schedule; `balance`: by/none) is what makes the behaviour axis a clean
  split — and its own note that "`balance` + a repeating cadence _is_ `upTo`; the only
  difference is what happens after the anchor passes" is the distinction this spec leans on.
  D4's title survives; its body's claim that a `upTo` target measures against Available does
  not. D5 derives a bill's `upTo` + `schedule` target, the shape the bug arrived on.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

- **Relationship:** Extends **D3**.
- **Relevant decisions:** one pure ask shared by Assign, the pill, the bar and the drawer —
  the reason this is a single change in `demand.ts`, and the reason D3 of this spec moves the
  bar with it instead of leaving it reading Available.

### `agent-os/specs/2026-09-06-1215-still-needed-this-month/`

- **Relationship:** Extends.
- **Relevant decisions:** the Budget header states `underfundedGapCents` itemised rather than
  a second formula, so the header, the amber pills and Assign → Underfunded all shrink
  together when the ask does. Nothing to change; it is the proof that the seam held.

### Checked and unaffected

- `agent-os/specs/2026-08-28-2223-target-snooze/` — snooze zeroes the target term in
  `neededAssigned`, above both families, and keeps the overspend floor. Basis-independent.
- `agent-os/specs/2026-08-29-2129-overassigned-available/` — Overassigned sits in front of
  both families; it is what will report Dropbox's stranded $127.08 after the fix.
- `agent-os/specs/2026-08-28-2146-target-since-month-granularity/` — supersedes
  `target-refill-basis` **D2** only, explicitly leaving D1 and D3 standing.
- `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/` — owns `billAnchor` and
  `expectedKey`, which is where plan.md **D4**'s follow-up would land if the anchor is stale.

## Code

### The change

- `src/lib/finances/budget/targets/demand.ts` — `pileDemand`, `availableBefore`,
  `demandForTarget`, and the module header's "two families, two bases" claim.
- `src/lib/finances/budget/indicator.ts` — `horizonOf` / `askBar`; the `sinking` arm.

### The seam that must not need changing

- `src/lib/finances/budget/assign/plan.ts` — `neededAssigned` (the declared single seam),
  `stillNeeded`, `underfundedGapCents`, `planUnderfunded`, `reduce-overfunding`.
- `src/lib/finances/budget/templates/apply.ts:89` — Apply Targets writes `amountCents` and
  `goalCents` straight from the ask.
- `src/lib/finances/budget/incomePlan.ts:45` — `monthlyFundingPlan` folds
  `max(0, assigned, needed)` into the income margin.
- `src/components/finances/budget/TargetDrawer.tsx:184` — the drafted target's live preview.
- `src/components/finances/budget/BudgetView.tsx`, `BudgetSummary.tsx`,
  `budgetColumns.tsx`, `BudgetInspector.tsx`, `FixThisDialog.tsx` — all read the folded
  indicator/ask, never the basis.

### Pattern to borrow

`target-refill-basis`'s own implementation is the template for this one: the same author's
`periodDemand` already takes carry-in and ignores activity, and
`assign/plan.ts`'s `assignedToZeroBalance` is the floor that makes ignoring activity safe.
Do the same thing one branch over rather than inventing a mechanism.

### Dead code found while mapping (follow-up, not this spec)

- `src/lib/finances/budget/templates/demand.ts` — `demandOf` / `hasDemandAsk`, a complete
  parallel engine imported only by its own test.
- `src/lib/finances/budget/templates/schedule.ts:149` — `billFundingDemand`, the pre-`derive`
  bill sink, reachable only through the above. `targets/derive.ts:4` already names it "a
  second demand engine" that was retired.
