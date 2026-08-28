# References for YNAB target engine

## Governing specs

### `agent-os/specs/2026-08-27-1949-weekly-envelope-targets/` (frozen 2026-08-27)

- **Relationship:** Supersedes D2 (for `upTo`), D3 (outright), D4/D6 (vocabulary). D1's weekday
  convention and D5's history suggestion carry forward.
- **Relevant decisions:** D2 "the count is **every** matching weekday in the month, not only
  those still ahead of today" — kept for `add`, replaced for `upTo`. D3 "carry-in never reduces
  a weekly ask", called there "the single load-bearing claim of the spec and the thing a later
  refactor is most likely to undo by accident" — this spec undoes it deliberately, and `plan.md`
  D4 says why the premise survives the conclusion. D6's contribution/balance naming is what D7
  replaces with per-shape sentences.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/` (frozen 2026-08-24)

- **Relationship:** Supersedes D3's _basis_ only.
- **Relevant decisions:** `neededAssigned = max(demand, assignedToZeroBalance)` and
  `gap = max(0, neededAssigned − currentAssigned)` both survive verbatim; what changes is how
  `demand` is computed for `upTo` and `balance`. D1 (never consume more than Ready to Assign),
  D2 (reductions first), D4 (Underfunded ordering) and D9 (`goalCents` is the unclamped ask)
  are untouched.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` (frozen 2026-08-25)

- **Relationship:** Supersedes D5's "no weekly target type" and its two-horizon set; **D3
  survives.**
- **Relevant decisions:** D3 "one pure function, same ask as Assign… if those disagree, the
  indicator is wrong" is the constraint that forced the one-number answer in `plan.md` D3
  rather than a separate underfunded figure. D6's bar math is the only place carry-in enters,
  and Task 8 revises its denominator for occurrence-counted cadences.

### `agent-os/specs/2026-08-22-2242-budget-goal-templates/` (frozen)

- **Relationship:** Supersedes D1 wholesale.
- **Relevant decisions:** the four Actual types, the JSONB list, integer cents (**kept** — the
  named divergence from Actual's dollar floats survives), and "a bill envelope never holds a
  template" (**removed** by D5).

### `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` (frozen 2026-08-25)

- **Relationship:** Extends. Not superseded — Task 5's deriver must reproduce it.
- **Relevant decisions:** D1 — a monthly bill asks the full `expectedCents` in the due month and
  $0 in any other, and $0 when carry-in already covers it. Yearly/quarterly sinking unchanged.

### `agent-os/specs/2026-08-23-2313-one-budget/` (**active**)

- **Relationship:** Supersedes D4 — a bill's demand is no longer intrinsic to cadence; cadence
  derives a target that runs through the same evaluator.
- **Note:** this is the only non-frozen spec in the chain. Keeping it consistent is part of
  Task 5.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/` (frozen 2026-08-22)

- **Relationship:** Extends.
- **Relevant decisions:** D1 `balance = assigned + activity + carryIn`, and the carry-over rule
  `carryIn(c, m) = carryover(c, m−1) ? balance(c, m−1) : max(0, balance(c, m−1))`. Every
  formula in this spec is a rearrangement of that identity.

## Code being replaced

| Location                                                                                           | Fate                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/finances/budget/templates/types.ts`                                                       | → `targets/types.ts`, rewritten around `Target` / `Cadence`                                             |
| `src/lib/finances/budget/templates/demand.ts` (`demandOf`, 68–101)                                 | → `targets/demand.ts` as `targetDemand`, gains `todayKey`                                               |
| `src/lib/finances/budget/templates/weekly.ts`                                                      | `countWeekdayInMonth` → `targets/cadence.ts`; `runWeekly` folded into the behaviour switch              |
| `src/lib/finances/budget/templates/simple.ts`                                                      | deleted — `applyLimit` / `limitOf` / `hold` go with `limit`                                             |
| `src/lib/finances/budget/templates/by.ts` (`runBy`, 41–89)                                         | spread math survives in `targets/demand.ts`, measured against Available, without the shared-window rule |
| `src/lib/finances/budget/templates/remainder.ts`                                                   | deleted (D6)                                                                                            |
| `src/lib/finances/budget/templates/schedule.ts` (`billFundingDemand` 144, `occurrencesInMonth` 73) | → `targets/derive.ts` + `targets/cadence.ts`; stops being a second demand engine                        |
| `src/lib/finances/budget/templates/suggest.ts`                                                     | carried over unchanged                                                                                  |
| `src/lib/finances/budget/templates/apply.ts`, `draft.ts`                                           | carried over; remainder branch and multi-line drafts removed                                            |
| `src/lib/finances/budget/assign/plan.ts` (72–100, 367–448)                                         | `todayKey` threaded; remainder spread removed                                                           |
| `src/lib/finances/budget/indicator.ts` (70–235)                                                    | `todayKey`; `eventually` horizon; bar denominator                                                       |
| `src/components/finances/budget/TemplateDrawer.tsx`                                                | → `TargetDrawer.tsx`, one form                                                                          |

## Patterns to borrow

- **`weekly.ts`'s closed-form occurrence count** — weekday of the 1st plus the month's length,
  no `Date` loop and no process-local clock. `targets/cadence.ts` keeps that shape for every
  cadence.
- **`indicator.ts`'s `horizonOf`** — a small discriminated `Horizon` derived from the target,
  separate from the ask itself. The `eventually` state slots in as a fourth arm.
- **`schedule.ts`'s `occurrencesInMonth`** — counts forward from `nextDueKey` rather than from a
  day-of-month, which is exactly why a late bill keeps asking.
- **`suggest.ts`'s window rules** — complete months only, start at first nonzero activity, cap
  at 12, show nothing under 3. Worth imitating anywhere else a figure is inferred from history.

## External

- **YNAB target editor** — `visuals/`. The weekly editor ("I need $X / Every Sunday / Next month
  I want to…"), and YNAB's own text for the two modes: "Refill up to $X/week — sets a target to
  have $X/week on hand each month. Whatever you don't spend will get applied towards next month."
- **Actual Budget** — `docs/actual-budget/README.md` and a local clone at `../actual`. After this
  spec it maps envelope arithmetic and the Apply/Overwrite gesture, not target semantics.
