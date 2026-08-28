# YNAB target engine

**Status: frozen / complete** (2026-08-28)  
Spec folder: `agent-os/specs/2026-08-28-1000-ynab-target-engine/`

This is the as-built record. Further change opens a new delta-spec.

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-22-2242-budget-goal-templates/` **D1** — the four
  Actual template types (`simple` / `schedule` / `by` / `remainder`), the JSONB **list**,
  `priority`, and "a bill envelope never holds a template". Replaced wholesale by one nullable
  `target` per envelope. D2 (apply vs overwrite) was already superseded by assign-options.
- **Supersedes:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` **D3** — only the
  basis. `gap = max(0, neededAssigned − currentAssigned)` stays; what changes is that
  balance-style targets now compute `neededAssigned` against **Available**
  (`carryIn + activity`), not carry-in alone. D1/D2/D4/D5/D9 (RTA clamp, reductions first,
  ordering, `goalCents` as the unclamped ask) carry forward unchanged.
- **Supersedes:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` **D5**'s "no
  weekly target type" and its this-month/sinking horizon pair, which gains an `eventually`
  horizon. **D3 survives and is the reason this spec is shaped the way it is:** one pure
  function, the same ask as Assign, no second demand.
- **Supersedes:** `agent-os/specs/2026-08-27-1949-weekly-envelope-targets/` **D2** (whole month
  always) for the `upTo` behaviour, **D3** (carry-in never reduces a weekly ask) outright, and
  **D4/D6**'s vocabulary. D1's weekday convention and **D5** (the history suggestion) carry
  forward.
- **Supersedes:** `agent-os/specs/2026-08-23-2313-one-budget/` (active) **D4** — a bill no
  longer funds itself from a private cadence engine. Cadence now seeds a _derived target_ that
  runs through the same evaluator as every other envelope.
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` D1 —
  `balance = assigned + activity + carryIn` is the identity this whole spec is built on.
- **Extends:** `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` D1 — a monthly bill
  does not sink across months. The derived bill target must reproduce this exactly.
- **Extends:** `agent-os/specs/2026-08-25-0831-assign-skip-full-single/`,
  `agent-os/specs/2026-08-25-1633-budget-inspector/` — display and confirmation behaviour
  unchanged; both read whatever the ask is.

## Context

The Budget page tells you the wrong thing mid-month. Groceries on 2026-08-28:

```
Envelope,Assigned,Activity,Available
Groceries,$843.59,-$785.53,$58.06        → "$211.21 more needed this month"
```

$211.21 is *extra assignment to reach a monthly assigned total* — 5 Sundays × $210.96 =
$1,054.80, less $843.59 already assigned. It ignores that $785.53 has already left the envelope
and that one Sunday remains. The number actually needed is **$152.90**: one remaining Sunday at
$210.96, less the $58.06 already sitting there.

YNAB gets this right because it asks a different question — _remaining occurrences × amount,
measured against **Available**_. Assigned is a history of funding. Available is what can still
buy groceries.

Chasing that one number exposed that the whole target model is Actual Budget's, and Actual's is
the wrong engine for this app:

- The refill-vs-set-aside distinction is **implied by which fields are set** (`monthlyCents`
  present = set aside; `limit` present = refill). That is precisely why it reads as a puzzle,
  and why `weekly-envelope-targets` D6 had to spend a whole decision renaming the two jobs
  instead of making them a real axis.
- Real categories need behaviours the model cannot express. Variable utility bills (electric,
  water/sewer) should top up rather than re-contribute — a cheap month should leave cash in the
  envelope and reduce next month's ask. Propane arrives on a fuzzy yearly schedule for a fuzzy
  amount. A $100,000 down-payment fund needs a **floor**: dip into it and the hole must be
  refilled, forever, with no repeating cadence at all.
- The existing "Keep available $X" line computes `limit − carryIn`, a start-of-month figure. It
  asks "how much do I add so the *opening* balance reaches $X". After you spend, carry-in has
  not moved, so the line goes quiet. That is not "keep $X available"; that is "start the month
  near $X and then ignore the envelope". The same bug sits in `runBy`.

So this is a model correction, not a formula patch — the two-workarounds signal from
`standards/development/clean-code.md` is present in triplicate. **Replace Actual's template
list with YNAB's target system:** one target per envelope, behaviour and cadence as real axes.

## Decisions

### D1 — One target per envelope

`financeBudgetCategories.templates` (a JSONB list) becomes `target` (a nullable JSONB object).

```ts
type Target = {
  behavior: "add" | "upTo" | "balance";
  cadence: Cadence;
  amountCents: number; // integer > 0
};

type Cadence =
  | { unit: "week"; weekday: number } // 0 = Sunday … 6 = Saturday
  | { unit: "month"; day: number } // 1–31, clamped to the month's end
  | { unit: "year"; month: number } // 1–12, the month it is needed by
  | { unit: "by"; month: string } // "YYYY-MM", a one-time deadline
  | { unit: "none" } // no deadline
  | { unit: "schedule" }; // derived only — the bill's own cadence
```

YNAB allows a category exactly one target, and every complication the list bought — `priority`,
summing, `runBy`'s shared-shortest-window rule, `applyLimit`'s "a sibling line's `up to` clamps
the whole envelope" — exists to resolve conflicts between lines that should never have been
allowed to coexist. An envelope that genuinely wants two asks is two envelopes.

`weekday` keeps the 0-is-Sunday convention of `weekdayOfDateKey`
(`standards/development/dates.md`); a second convention in one codebase is a bug waiting for
the first agent who mixes them up.

### D2 — Seven legal shapes, one sentence each

`parseTarget` rejects every pairing not in this table. `schedule` is never user-selectable.

| Sentence                          | behavior  | cadence    |
| --------------------------------- | --------- | ---------- |
| Add $X every month                | `add`     | `month`    |
| Add $X each Sunday                | `add`     | `week`     |
| Have $X available each month      | `upTo`    | `month`    |
| Have $X available each Sunday     | `upTo`    | `week`     |
| Have $X available each year       | `upTo`    | `year`     |
| Have $X available by October 2026 | `balance` | `by`       |
| Have $X available (no deadline)   | `balance` | `none`     |
| _(derived, bills only)_           | `upTo`    | `schedule` |

The pairings left out are deliberate, not oversights:

- **`add` + `year`** would need "assigned since the cycle started" to know how much of the year's
  contribution has landed, and nothing stores that. Flat `amount / 12` is honest but identical to
  writing `add` + `month` with that figure — so it is redundant rather than missing.
- **`add` + `by`** is the same argument.
- **`balance` + a repeating cadence** is `upTo`. The only difference between the two is what
  happens after the anchor passes: `upTo` repeats, `balance` floors.

### D3 — Two evaluation modes

Let `availableBefore = carryIn + activity` — Available excluding this month's Assigned. The
engine returns **needed assigned**. `gap = max(0, needed − assigned)` is unchanged, so
`gap = max(0, target − Available)` falls out of the identity rather than being special-cased.

**Occurrence-counted** (`week`, `month`, `schedule`) — the ask is due inside this month:

```
add:  needed = amountCents × wholeOccurrences(cadence, month)
upTo: needed = max(0, amountCents × remainingOccurrences(cadence, month, todayKey) − availableBefore)
```

`remainingOccurrences` counts anchor dates on or after `todayKey`. A future month therefore
counts all of them, and a **past month counts none** — a weekly target asks nothing for a month
that has already happened. `wholeOccurrences` ignores today: an `add` line is a contribution,
not coverage of trips, so `weekly-envelope-targets` D2's "whole month, always" survives exactly
where its argument still holds.

`schedule` counts from the bill's `expectedKey` — the charge being waited for, which may
be in the past — not from `nextDueKey`. That is what keeps a **late unpaid bill asking**
and a paid one quiet: `nextDueKey` rolls forward the day after the due date either way.

**Spread** (`year`, `by`, `none`) — the ask is due at a future month, so divide the hole:

```
monthsLeft = months from `month` to the anchor
             year: walks forward a year once the anchor has passed (it repeats)
             by:   null once passed → balance floors at the full hole
             none: infinite

needed = max(0, round((amountCents − availableBefore) / (monthsLeft + 1)))
none:   needed = 0; the indicator reports max(0, amount − available) as "needed eventually"
```

### D4 — Balance-style targets measure against Available, never carry-in

This is the load-bearing claim, and the one a later refactor is most likely to undo. Spending
reduces Available, so a `upTo` or `balance` target asks you to top back up. Keep $500, carry in
$400, spend $200, assign $0 → Available is $200, so the ask is **$300**, not $100.

`weekly-envelope-targets` D3 said the opposite — carry-in must never reduce a weekly ask,
because a cheap week is spare cash rather than lower demand. The premise is still true; the
conclusion was wrong. Leftover cash _is_ still in the envelope and _can_ cover the next Sunday.
The per-occurrence amount does not fall because one week was cheap — $210.96 stays $210.96 —
but what you must **add** falls, because the money is already there. If you would rather move
the leftover to an envelope that ran short, move it: Available drops and the ask comes back.
Refill does not trap the spare, it only leaves it in place until you decide.

`add` is the behaviour for the other case, and it is not the default for anything except a
deliberate contribution ("put this much in every month even if something is already there") —
a savings sink, not a bill and not groceries.

### D5 — A bill's cadence seeds a derived target

Any envelope may hold any target; `kind` no longer gates what a target may say. A bill envelope
with **no stored target** gets one derived live from its facet:

```
{ behavior: "upTo", cadence: { unit: "schedule" }, amountCents: expectedCents }
```

Derived rather than written at import, so editing `expectedCents`, the due day or the cadence
keeps the ask in sync without rewriting a stored row. An explicit target wins.

`upTo` rather than `add` because for a bill charged the same amount on the same day they are
identical, and they differ only when a charge does not land — where holding the money for next
month's charge is what you want, not asking for the full amount again on top. `billFundingDemand`
stops being a second demand engine and becomes the deriver plus its occurrence counter, so there
is exactly one path from envelope to ask.

The derived target must reproduce `month-ahead-zero-based` D1 exactly: the full amount in the due
month, $0 in any other, $0 when carry-in already covers it, and yearly/quarterly sinking
unchanged. If it does not, the deriver is wrong — that spec is not being superseded.

### D6 — `remainder` is dropped

Actual's, not YNAB's, and never a target: it does not say "you need $X", it says "give me a share
of whatever is left". Modelling it as a template type is part of why "what does this envelope ask
for" was hard to answer. Leftover Ready to Assign now stays in Ready to Assign, which is what
YNAB does and what the Budget page's own zero-based framing implies.

`limit` / `applyLimit` / `hold` go with it — `upTo` _is_ the limit, stated once instead of as a
clamp that reaches across lines.

### D7 — The drawer speaks in sentences, not in a mode toggle

One form, no list. Pick the cadence, then pick the job as a plain-language sentence from D2's
table. **Never a raw "refill vs set aside" toggle** — that is the exact failure
`weekly-envelope-targets` D6 was written to fix, and the reason this spec exists at all is that
YNAB's mechanics are right while its vocabulary is what made the choice feel like a puzzle. Copy
the math, write our own sentences.

Defaults preselected by envelope kind, so the job is rarely touched:

| Envelope                | Default                                        |
| ----------------------- | ---------------------------------------------- |
| Spending, weekday habit | Have $X available each _weekday_               |
| Spending, otherwise     | Have $X available each month                   |
| Bill                    | The derived target, read-only until overridden |
| Savings                 | Add $X every month                             |

The history suggestion under the amount survives unchanged from `weekly-envelope-targets` D5,
including its "includes all spending in this category, not only the Sunday trips" note and its
window rules.

### D8 — Renamed out of Actual's vocabulary

`src/lib/finances/budget/templates/` → `targets/`. "Template" is Actual's word for a thing we no
longer implement, and leaving the name in place would keep pointing the next reader at
`category-template-context.ts` for semantics that are now YNAB's.

## Acceptance criteria

- [x] Groceries (`upTo`, week/Sunday, $210.96) on 2026-08-28 with Available $58.06 reads
      **"$152.90 more needed this month"**, and Assign → Underfunded offers the same figure —
      necessarily, because both call one function.
- [x] The same target viewed in September asks 4 × $210.96 less whatever August leaves behind;
      viewed in July it asks nothing.
- [x] A bill already paid this month asks nothing. A bill past its due date and still unpaid
      keeps asking.
- [x] A monthly bill still asks its full amount in the due month and $0 in every other
      (`month-ahead-zero-based` D1), through the derived target.
- [x] "Keep $500 available" with carry-in $400 and $200 spent asks **$300**.
- [x] A $100,000 `balance` due next month asks $50,000 this month; past its deadline with
      $95,000 available it asks the whole $5,000 hole at once.
- [x] The same target with no deadline reads "needed eventually" and contributes nothing to
      Underfunded.
- [x] `parseTarget` rejects every pairing outside D2's table, a user-supplied `schedule`
      cadence, a non-integer or non-positive `amountCents`, weekday 7 / −1 / 1.5, and
      `month.day` of 0 or 32.
- [x] A target round-trips through save and load, and a second user cannot read, change or
      delete the first user's target.
- [x] The drawer contains no list, no priority, and neither the word "refill" nor "set aside".

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                              | Why                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bill occurrence counting anchors on `expectedKey`, not `nextDueKey` | `nextDueKey` rolls forward the day after the due date whether or not the charge posted. Counting from the charge being waited for is what keeps a late unpaid bill asking and a paid one quiet. |

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`, and `visuals/`
holding the three YNAB target screenshots.

## Task 2: `targets/types.ts`

`Target`, `Cadence`, `parseTarget`, `parseTargetOrThrow`, `summarize` (the one-line UI label).
The legal matrix from D2 lives here and nowhere else.

Tests: each of the seven legal shapes round-trips; every illegal pairing is rejected
(`balance` + `week`, `add` + `by`, `add` + `year`, a user-supplied `schedule`); non-integer and
non-positive `amountCents`; weekday 7, −1 and 1.5; `month.day` of 0 and 32; `by.month` that is
not `YYYY-MM`.

## Task 3: `targets/cadence.ts`

`wholeOccurrences(cadence, month)`, `remainingOccurrences(cadence, month, todayKey, bill?)`,
`monthsLeft(cadence, month)`. `countWeekdayInMonth` moves here unchanged — closed form from the
weekday of the 1st and the month's length, no `Date` loop, no process-local clock.

Tests chosen to fail on a plausible mistake: August 2026 → 5 Sundays and September → 4; a month
whose 1st is the anchor weekday; a month whose last day is; February 2027 (28) and 2028 (leap);
every weekday 0–6 in one month summing to the month's length; `month.day = 31` clamping in
February; `remaining` = 0 for a wholly past month and full for a wholly future one; `remaining`
counting today's own occurrence; `year` walking forward once its anchor month has passed.

## Task 4: `targets/demand.ts`

`targetDemand(envelope, month, todayKey, bills)` — D3's two evaluation modes over D1's three
behaviours, returning `{ amount, errors }` as `demandOf` does today.

Tests are D3's worked cases, each **named for the claim it defends** rather than asserted in
passing — in particular _"$152.90, not $211.21"_ and _"a paid bill stops asking"_, the two a
later refactor is most likely to undo. Plus: `add` ignores carry-in entirely; `upTo` never
returns a negative; overspend still reaches `assignedToZeroBalance`; a `balance` + `none` target
asks 0 while reporting its eventual figure.

## Task 5: `targets/derive.ts`

The bill facet → derived target of D5, used only when the envelope holds no stored target.
`occurrencesInMonth` comes across from `templates/schedule.ts`.

Tests must reproduce `month-ahead-zero-based` D1: full `expectedCents` in the due month, $0 in
any other month, $0 when carry-in already covers it, and yearly/quarterly sinking unchanged.
Plus a stored target overriding the derived one, and a bill with no `nextDueKey` still producing
the "Bill has no next-due date yet" error.

## Task 6: Schema and migration

Generate the migration — never hand-write one without its snapshot
(`standards/database/migrations.md`). It adds `target`, transforms every row, then drops
`templates`:

| From                      | To                                              |
| ------------------------- | ----------------------------------------------- |
| `simple` + `monthlyCents` | `add` / `month` (day = last)                    |
| `simple` + `limit`        | `upTo` / `month` (day = last)                   |
| `weekly`                  | **`upTo` / `week`**                             |
| `by`                      | `balance` / `by`                                |
| `by` + `annual`           | `upTo` / `year`                                 |
| `remainder`               | dropped                                         |
| more than one line        | keep the lowest `priority`, report the envelope |

`weekly` becomes `upTo` rather than `add` because that is the behaviour this spec exists to
deliver; `add` + `week` stays reachable from the drawer for anyone who wants the old semantics
back on one envelope.

**Before writing the migration, run an audit query** for envelopes holding more than one line or
a remainder line, and show Lee the list. This is his live budget and the transform is not
reversible.

`saveEnvelopeTarget` replaces `saveEnvelopeTemplates` in `mutations.ts` and gets integration
coverage, including a second user failing to read, change and delete the first user's target.

## Task 7: Thread `todayKey`, delete the remainder path

`todayKey` reaches `neededAssigned`, `underfundedGapCents`, `envelopeIndicator`,
`indicatorsFromAssign`, `applyTemplates` and `currentMonthUnderfundedGap`. `BudgetView` already
holds `data.todayKey`; `PlanAssignParams` already carries one.

Remove: `planUnderfunded`'s remainder spread, `remainderWeight`, `distributeRemainder`, the
remainder branch in `applyTemplates`, and `compareUnderfunded`'s bucket for it. `queries.ts`,
`rows.ts` and `assign/types.ts` change `templates: Template[]` to `target: Target | null`.
`cutover.ts` stops writing `simple` lines onto imported bills — D5's deriver covers them.

## Task 8: Indicator

Horizons: `this-month` for occurrence-counted cadences, `sinking` for `year` / `by` with months
left, and a new **`eventually`** for `balance` + `none` (copy "$X needed eventually", pill green,
contributing nothing to Underfunded).

Bar: Available toward the period target for occurrence-counted cadences — the honest denominator
now that the ask is measured against Available — and `carryIn + assigned` toward the goal for
spread cadences, as today.

## Task 9: `TargetDrawer`

`TemplateDrawer.tsx` → `TargetDrawer.tsx`. One form: cadence picker, then D2's sentence, then the
amount. D7's defaults by envelope kind. Keep the history suggestion and its note, and the live
computed line ("August: 5 Sundays × $210.96 = $1,054.80") now paired with a remaining-occurrence
line so the two numbers are visibly different things. `drawer-pattern.md` footer rules unchanged.

## Task 10: Docs

`docs/actual-budget/README.md` — record that the target engine is no longer Actual's. Name what
we still take from them (envelope arithmetic, the Apply/Overwrite gesture, schedule sinking) and
that `goal_def`, `runSimple`, `runBy` and `runPeriodic` no longer govern anything here.

## Task 11: Verify, freeze spec, update roadmap

- `npm run test:unit` — **check for the Postgres-skipped warning**; a green unit run does not
  mean the database tests ran. Then `npm run test:integration`, `npm run lint`, `npx tsc --noEmit`.
- `npm run dev`, then `npm run smoke` — nothing above evaluates a `"use server"` module, and this
  touches `src/app/finances/actions.ts`.
- Walk every acceptance criterion on `/finances/budget` against the live budget.
- Confirm the Task 6 audit list matches what the drawer shows afterwards.
- Update `plan.md` / `shape.md` for material as-built drift, complete **Changes from original
  plan**, mark both **Status: frozen / complete** with the date, and list leftovers as new work.
- Update `agent-os/product/roadmap.md` if this closes a listed item.

## Follow-ups (new work — not amendments to this frozen spec)

- Delete the leftover Actual template modules under `src/lib/finances/budget/templates/`
  once nothing imports them. `suggest.ts` (the history hint) still lives there; `apply.ts`
  kept its name while switching to `targetDemand`.
- Production/Neon schema: local Docker was migrated (`0082_envelope_target`). A deploy
  against Neon still has to run the same migration.

---

This document is frozen. Further change opens a new delta-spec.
