# References for target refill basis

## Governing specs

### `agent-os/specs/2026-08-28-1000-ynab-target-engine/` (frozen 2026-08-28)

- **Relationship:** supersedes **D3** (occurrence-counted mode) and **D4** (balance-style targets
  measure against Available) for the period family; extends everything else.
- **Carries forward:** D1 (one target per envelope), D2 (the seven legal shapes), D5 (a bill's
  cadence seeds a derived target, anchored on `expectedKey` per its Change #1), D6 (`remainder`
  dropped), D7 (sentences, not a refill/set-aside toggle), D8 (the `targets/` rename).
- **Read for:** the Context section's Groceries walkthrough. This spec reverses its conclusion
  and needs to be read alongside it, not instead of it.

### `agent-os/specs/2026-08-28-1503-monthly-target-installment-copy/` (frozen 2026-08-28)

- **Relationship:** supersedes **D3** — deadline-free targets no longer keep "needed eventually".
- **Carries forward:** D1 (every positive installment shortfall is monthly copy), D2 (sinking is a
  progress horizon, not a copy horizon), D4 (the editor keeps the final target).

### `agent-os/specs/2026-08-27-1949-weekly-envelope-targets/` (superseded, read for argument only)

- **D2** ("whole month always") is _restored_ here for `upTo` as well as `add`, having been
  narrowed to `add` by `ynab-target-engine`. Its original argument was right.
- **D3** ("carry-in never reduces a weekly ask") stays superseded: carry-in does reduce a refill.
- **D5** (the history suggestion under the amount) untouched.

### `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` (frozen)

- **D1** — a monthly bill asks its full amount in the due month and $0 in every other. Unchanged,
  and the derived bill target must still reproduce it after the basis moves.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` (frozen)

- **D3** — one function, one ask; the indicator must not invent a second demand. Still the reason
  `demand.ts` is the only file where a formula changes.

## Code

| Location                                          | Relevance                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/finances/budget/targets/demand.ts`       | `occurrenceDemand` (:78) is the bug; `availableBefore` (:53) becomes pile-family-only; `paidFromActivity` (:104) is deleted                                                                |
| `src/lib/finances/budget/targets/cadence.ts`      | `wholeOccurrences` (:147) gains `since`; `remainingOccurrences` (:171) goes; `countWeekdayFromDay` (:122) is reused for `since`; `outstandingCharges` (:204) survives under its own export |
| `src/lib/finances/budget/targets/types.ts`        | `Target` (:51), `LEGAL` (:75), `parseCadence` (:95) — where `since` lands                                                                                                                  |
| `src/lib/finances/budget/indicator.ts`            | `horizonOf` (:79), the `eventually` arm (:198), `occurrencePeriodTarget` (:67), bar denominators (:182)                                                                                    |
| `src/lib/finances/budget/assign/plan.ts`          | `assignedToZeroBalance` (:64) — the overspend floor that makes dropping Activity safe; `hasUnderfundedAsk` (:73); `compareUnderfunded` (:116)                                              |
| `src/components/finances/budget/TargetDrawer.tsx` | the whole/remaining preview pair (:235–242)                                                                                                                                                |
| `src/lib/finances/budget/targets/demand.test.ts`  | :30–74 encode the two superseded rules by name; rewrite, do not extend                                                                                                                     |

## External

- **YNAB, reconstructed by Lee (primary source).** Pizza category rebuilt with the same target,
  the same four transaction amounts on the same dates, and the same money assigned:
  `Refill Up to $33.05 Each Week / By Friday / You've met your target! / Needed This Month
$132.20 / Funded $134.76`. Four Fridays in August 2026 × $33.05 = $132.20 — the whole month's
  cap, compared against what was assigned, with spending absent from the comparison.
- **YNAB, grocery target deleted and recreated on 2026-08-28.** Needed This Month fell from
  $1,054.80 (five Sundays) to $210.96 (one), because a target does not ask for weeks that
  predate it. This is what `since` reproduces.
- **YNAB support**, on refill: leftover funds do not count toward a "Refill up to" target until
  the new month begins. Our carry-in basis is exactly that rule.
- `docs/actual-budget/README.md` — Actual's `goal_def`, `runSimple`, `runBy` and `runPeriodic`
  stopped governing targets at `ynab-target-engine` Task 10 and still do not. Nothing to change.
