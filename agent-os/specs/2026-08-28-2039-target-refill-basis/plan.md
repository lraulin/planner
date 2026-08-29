# Target demand is an assignment question, not a cash-coverage question

**Status: frozen / complete** — 2026-08-28
Spec folder: `agent-os/specs/2026-08-28-2039-target-refill-basis/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` **D3** (the
  occurrence-counted mode: remaining occurrences, measured against Available) and **D4**
  (balance-style targets measure against Available, never carry-in) — **for the period family
  only**. D4 survives verbatim for the pile family, which is the case its own worked example was
  really about. Its acceptance criteria 1 ($152.90), 5 ($300) and 7 ("needed eventually") are
  replaced. D1, D2, D5–D8 carry forward unchanged.
- **Supersedes:** `agent-os/specs/2026-08-28-1503-monthly-target-installment-copy/` **D3** —
  "deadline-free targets keep their distinct promise". They no longer do; they ask like anything
  else. D1, D2 and D4 carry forward.
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` **D3** — one pure
  function, the same ask as Assign, no second demand. Still the reason this is shaped as one
  change to `demand.ts` rather than a display patch.
- **Extends:** `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` **D1** — a monthly bill
  asks its full amount in the due month and $0 in every other. The derived bill target must keep
  reproducing this exactly.
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` **D1** —
  `balance = assigned + activity + carryIn`, the identity every formula here is stated against.

## Context

The Budget page said Lee was underfunded on the last Friday of the month, after the last pizza
of the month had already been bought and its pending charge posted.

`src/lib/finances/budget/targets/demand.ts:112`, for `upTo` on an occurrence cadence:

```
needed = max(0, amountCents × remainingOccurrences − (carryIn + activity))
gap    = max(0, needed − assigned)
```

Pizza — `upTo` / Friday $33.05, August 2026 (Fridays 7 / 14 / 21 / 28), today 2026-08-28,
carry-in $0, assigned $134.76, activity −$132.20:

|                       | ours                                | YNAB, same inputs                  |
| --------------------- | ----------------------------------- | ---------------------------------- |
| remaining occurrences | 1                                   | —                                  |
| needed assigned       | $33.05 + $132.20 = **$165.25**      | $132.20 (= 4 × $33.05)             |
| the ask               | **"$30.49 more needed this month"** | Funded — "You've met your target!" |

`activity` is in the basis. **Activity is consumption of funding; the ask is about funding.**
Spending money that was already assigned for that spending cannot create a fresh demand for the
same money. That is the whole bug, and it is a direct consequence of `ynab-target-engine` **D4**,
which generalised a _floor_ rule ("keep $500 available, so a dip asks for it back") onto _period
refills_, where it does not hold.

The same mistake had already forced a workaround one function over. `demand.ts:104`'s
`paidFromActivity` exists solely to stop a paid monthly bill from asking twice — the identical
symptom on the `schedule` cadence, patched locally instead of at the cause. Two workarounds for
one missing distinction is the `standards/development/clean-code.md` signal that the model, not
the formula, is what is wrong.

Lee arbitrated it rather than reasoning about it: he rebuilt the same category in YNAB with the
same target, the same four transaction amounts on the same dates, and the same money assigned.
YNAB read **Needed This Month $132.20 / Funded $134.76 / You've met your target!** — the full
month's cap measured against what was _assigned_, with spending nowhere in it.

## Decisions

### D1 — Two families, two bases

Split targets by what the money is _for_, and give each family the measure that fits it. The
line is **"is this money spent inside the month it is asked for, or held for a later one"** —
not the `behavior` axis, and not the cadence unit as such.

**Period family** — `week`, `month`, and a non-spreading `schedule` (day-cadence bills and plain
monthly bills). Let `C = amountCents × occurrences(cadence, month, since)`, counting the
**whole** month:

```
add:  needed = C
upTo: needed = max(0, C − carryIn)
```

Activity never enters. `assignedToZeroBalance` (`assign/plan.ts:64`) still floors the ask, so a
negative Available always asks — that is what keeps overspend visible without putting Activity
back into the target formula, and it is why removing Activity here is safe.

**Pile family** — `year`, `by`, `none`, and a spreading `schedule` (quarterly and yearly bills).
The basis stays `availableBefore = carryIn + activity`, because these are savings piles: what is
actually in the pile is the right measure, and raiding one has to ask for it back.

```
monthsLeft = n  →  needed = max(0, round((amountCents − available) / (n + 1)))
n = 0, or none  →  needed = max(0, amountCents − available)
```

`upTo` + `year` (propane) therefore stays on the Available basis even though its behaviour is
`upTo`. See **Deviation from the shaping answer** below — this is the one place the shaped
decision and this spec differ, deliberately.

### D2 — Whole month, counted from the target's start date

`remainingOccurrences` for `week` / `month` goes away: the month's cap does not shrink as
Fridays pass. What YNAB actually omits is not _past_ weeks but weeks _before the target existed_
— which is why deleting and recreating Lee's grocery target changed Needed This Month from
$1,054.80 to $210.96, the behaviour he identified as the correct one of the two.

`Target` gains:

```ts
/** `YYYY-MM-DD` — the day this target started. Anchors before it are not counted. */
since?: string;
```

- Stamped on save when the envelope had **no stored target before**; preserved unchanged on every
  later edit. Changing the amount or the cadence does not restart it.
- Occurrence counting skips anchors before `since`. A month entirely before `since` counts 0.
- Backfilled from `finance_budget_categories.created_at` — the closest thing the data has to when
  the envelope started asking. It over-counts for a target added long after its envelope; nothing
  stored can do better, and it is right for every envelope that got its target at import.
- Derived bill targets get none: `outstandingCharges` already anchors them on the charge being
  waited for.

This replaces the "a past month asks nothing" rule that `remainingOccurrences` provided with a
sharper one: **a month before the target existed asks nothing; a month during which it existed
asks its whole cap, past or not.**

### D3 — A deadline-free `balance` is a real ask

`balance` + `none` asks $0 today and reports "$X needed eventually" (`indicator.ts:198`). It
becomes `needed = max(0, amountCents − available)`, asked **this month**, with the ordinary
"$X more needed this month" copy. Raiding the $100,000 down-payment fund has to nag; a $0 ask
plus a soothing sentence is the one thing a floor must not say. This is the only place
`limit − available` belongs, and now it is stated once, there.

`compareUnderfunded` gains a bucket for deadline-free floors **after** ordinary targets, so
Underfunded cannot drain Ready to Assign into a $100,000 floor ahead of groceries.

### D4 — Consequences accepted, not worked around

Each of these is a number that changes on Lee's live budget. None is a regression to patch.

- **Groceries, 2026-08-28** ($843.59 assigned, −$785.53 activity, carry-in $0, five Sundays at
  $210.96): reads **"$211.21 more needed this month"**, not $152.90. Four weeks' worth was
  assigned against a five-Sunday month. Funding it leaves $269.27 available for the last Sunday;
  the $58.06 over rolls into September and reduces September's refill. **This is the exact number
  `ynab-target-engine` was written to eliminate**, and Lee chose YNAB's answer over it after
  running the experiment.
- **"Have $500 available each month"**, carry-in $400, spent $200, assigned $0: asks **$100**,
  not $300. `demand.test.ts:54` asserts $300 under the name "upTo measures against Available, not
  carry-in" — that assertion is the floor formula applied to a period refill, which is the pizza
  bug wearing a different envelope. The test changes.
- `paidFromActivity` is **deleted**. With Activity out of the basis, a paid monthly bill whose
  payee anchor lags computes a zero gap on its own: needed `= amount − carryIn`, assigned
  `= amount`. The workaround was only ever compensating for the basis.

## Acceptance criteria

- [x] Pizza — `upTo` week/Friday $33.05, August 2026, carry-in $0, assigned $134.76, activity
      −$132.20, today 2026-08-28 — reads **Funded**. This is the reported bug.
- [x] Groceries — `upTo` week/Sunday $210.96, assigned $843.59, activity −$785.53, carry-in $0 —
      reads **"$211.21 more needed this month"**, and Assign → Underfunded offers the same figure.
- [x] "Have $500 available each month", carry-in $400, spent $200, assigned $0 → asks **$100**.
- [x] `add` is unchanged: the full contribution regardless of carry-in, activity, or the day of
      the month.
- [x] A target with `since` = 2026-08-28 asks one Sunday in August 2026, five in a month it spans
      wholly, and nothing in a month entirely before it.
- [x] A `balance` + no-deadline $100,000 target with $99,500 available asks **$500 this month**,
      with "more needed this month" copy, and sorts after ordinary targets in Underfunded.
- [x] Propane — `upTo` + year, $1,200, October — still asks $400 in August, and $100/month in the
      November after the whole pile was spent.
- [x] A paid monthly bill still asks nothing with `paidFromActivity` deleted; a late unpaid one
      still asks; a monthly bill still asks its full amount in the due month and $0 in every
      other (`month-ahead-zero-based` D1).
- [x] Overspend still asks: Available −$500 asks at least $500 whatever the target says.
- [x] `parseTarget` round-trips `since`, rejects anything that is not `YYYY-MM-DD`, and a second
      user cannot read, change or delete the first user's target.

Each criterion is defended by a test named for it (`targets/demand.test.ts`,
`targets/cadence.test.ts`, `targets/derive.test.ts`, `indicator.test.ts`, `assign/plan.test.ts`,
`mutations.integration.test.ts`). The Pizza and Groceries figures were checked as unit cases
against the numbers in Context, not against Lee's live budget — the development database is a
seed. The live walk on `/finances/budget` happens on the deployed app.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `todayKey` was **removed** from `targetDemand`, `demandForTarget`, `neededAssigned`, `underfundedGapCents`, `envelopeIndicator` and `indicatorsFromAssign` rather than left as a dead parameter.                                              | With D2 the ask no longer reads the clock at all: a period cap is the whole month from `since`, a bill counts from the charge it is waiting for, and a pile counts months. Keeping the parameter would have been a standing invitation to put today back in. `planAssign` and `applyTemplates` keep theirs — they date the movement-log note. |
| 2   | The indicator's `Horizon` was re-cut into `period` / `sinking` / `floor` so it mirrors `isPeriodFamily` exactly, instead of switching on the cadence unit again.                                                                              | The old `this-month` arm re-derived the family from `cadence.unit` and could disagree with the ask (a quarterly bill in its charge month took the period arm while the ask took the pile arm). `budget-funding-indicators` D3 says one demand; now there is one family test too, exported from `demand.ts`.                                   |
| 3   | `summarize` does **not** mention `since`. The Files table asked it to "mention it when it trims the count"; it has no month to trim against, and after the backfill every target carries a `since`, so the suffix would be on every sentence. | The drawer's computed line says it instead, where the month is known and the note only appears when the count is actually trimmed: "August 2026: 1 Friday × $33.05 = $33.05. Counted from 8/24/2026, when this target started."                                                                                                               |
| 4   | `TargetDrawer` applies the `since` rule to the target it previews, not just to the count line.                                                                                                                                                | Caught in the browser: the preview line read "1 Friday" while the sentence under it read "This month asks $132.20" — the count used the stored `since` and the demand used the unstamped draft. The preview must run the target `saveEnvelopeTarget` will actually write.                                                                     |
| 5   | `applyTemplates` lost its "a deadline-free floor is reported, never funded" skip.                                                                                                                                                             | D3 makes a floor an ordinary this-month ask; `hasUnderfundedAsk` stopped excluding `none` for Assign, and Apply had the same exclusion one file over. Leaving it would have made Apply and Assign disagree about the same envelope.                                                                                                           |

## Files

| Path                                              | Change                                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/finances/budget/targets/types.ts`        | `since?: string` on `Target`; parse, validate, preserve; `summarize` mentions it when it trims the count                                                                         |
| `src/lib/finances/budget/targets/cadence.ts`      | `since` in `wholeOccurrences`; delete `remainingOccurrences`; export the bill path as `outstandingCharges`                                                                       |
| `src/lib/finances/budget/targets/demand.ts`       | D1's two families; delete `paidFromActivity`; `none` gets a real ask; `availableBefore` serves the pile family only                                                              |
| `src/lib/finances/budget/indicator.ts`            | Delete the `eventually` horizon; `this-month` period target becomes `C`; bar is `carryIn + assigned` toward `C` for the period family, `available` toward the amount for a floor |
| `src/lib/finances/budget/assign/plan.ts`          | `hasUnderfundedAsk` stops excluding `none`; `compareUnderfunded` gains the floor bucket                                                                                          |
| `src/lib/finances/budget/mutations.ts`            | `saveEnvelopeTarget` stamps `since` on first save, preserves it on edit                                                                                                          |
| `src/components/finances/budget/TargetDrawer.tsx` | One computed line ("August: 5 Sundays × $210.96 = $1,054.80"); drop the remaining-occurrence line; note `since` when it trims the count                                          |
| `drizzle/`                                        | `drizzle-kit generate --custom` — backfill `target.since` from `created_at`                                                                                                      |

Tests to **rewrite rather than extend**, because they encode the superseded rules:
`targets/demand.test.ts:30–74`, `targets/cadence.test.ts:83–111`, `indicator.test.ts:218–227`.

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md` and `visuals/`.
Commit and push. **Shaping ends here** — implementation starts in a fresh session at Task 2.

## Task 2: `since` on the target

`targets/types.ts`: the field, the parser arm, validation, round-trip, and the summary line.
Tests: a value that is not `YYYY-MM-DD`; a missing value (legal — means "always"); preservation
through parse; a `since` on a `schedule` cadence rejected along with the cadence itself.

## Task 3: Occurrence counting

`targets/cadence.ts`: `since` in `wholeOccurrences`; delete `remainingOccurrences` and its
week/month branches; keep the bill's outstanding-charge counter under its own exported name.
`countWeekdayFromDay` survives — it now serves `since` instead of today.

Tests chosen to fail on a plausible mistake: five Sundays in August 2026 with no `since`, one
with `since = 2026-08-28`; `since` landing exactly on an anchor (counts it); a month wholly
before `since` (0) and wholly after (all); `month.day = 31` clamping in February with a `since`
mid-month.

## Task 4: Demand

`targets/demand.ts`: D1's two families, D3's floor. Delete `paidFromActivity`.

Tests named for the claim they defend, not asserted in passing:

- _"the last pizza of the month does not create a new ask"_ — the reported bug.
- _"Groceries asks $211.21, not $152.90"_ — the number this spec deliberately reverses.
- _"a period refill is not a floor: $100, not $300"_.
- _"a raided pile asks for it back"_ — propane in November.
- _"a deadline-free floor asks this month"_.
- Overspend still reaching `assignedToZeroBalance`; a paid monthly bill asking nothing without
  the deleted workaround.

## Task 5: Indicator, Assign order, drawer

Delete the `eventually` horizon and its copy string. Period-family bar: `carryIn + assigned`
toward `C`. Floor bar: `available` toward the amount. Sinking bar unchanged. Add the floor
bucket to `compareUnderfunded`. `TargetDrawer` keeps one computed line for the month's cap and
loses the remaining-occurrence line that only existed to show the two were different.

## Task 6: Persist and backfill `since`

`saveEnvelopeTarget` stamps `since` only when the envelope had no stored target. Custom
migration (`drizzle-kit generate --custom`, never hand-written without its snapshot) backfilling
`target.since` from `created_at`. Integration coverage including a second user failing to read,
change and delete the first user's target.

## Task 7: Verify, freeze spec, update roadmap

- `npm run test:unit` — **check for the Postgres-skipped warning**; a green unit run does not
  mean the database tests ran. Then `npm run test:integration`, `npm run lint`, `npx tsc --noEmit`.
- `npm run dev`, then `npm run smoke`.
- Walk every acceptance criterion on `/finances/budget` against the live budget — Pizza and
  Groceries by name.
- Push to `master` so it is live on the phone before calling it verified.
- Update `plan.md` / `shape.md` for material as-built drift, complete **Changes from original
  plan**, mark both **Status: frozen / complete** with the date, and list leftovers as new work.
- Update `agent-os/product/roadmap.md` if this closes a listed item.

## Deviation from the shaping answer

Lee's answer during shaping grouped `upTo` + **year** with the period family:
`needed = max(0, C − carryIn − assigned)`, `C = amountCents`. D1 keeps it on the pile family
instead, and the reason is `demand.test.ts:169`: a $1,200 propane pile carried into November and
spent in November. On the Available basis the next cycle restarts from zero that month
($100/month). On the carry-in basis November sees carry-in $1,200 and asks nothing, correcting
only in December when carry-in has caught up. A one-month lag rather than a permanent error — but
a yearly `upTo` is a pile being saved toward a date, and the pile is what should be measured.

Flipping it is a one-line change if Lee disagrees.

---

**Standing rule while this spec is active:** keep `plan.md` / `shape.md` current with material
changes to requirements, design or scope — including feedback on what was actually built — and
append a row to **Changes from original plan**. Skip pure implementation details. Freeze when
verified.
