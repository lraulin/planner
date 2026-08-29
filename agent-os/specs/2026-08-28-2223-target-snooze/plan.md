# Target Snooze

**Status: frozen / complete — 2026-08-28**
Spec folder: `agent-os/specs/2026-08-28-2223-target-snooze/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-28-2146-target-since-month-granularity/` — month-level `since`; newest in the target stack
- **Extends:** `agent-os/specs/2026-08-28-2039-target-refill-basis/` — D1 two families/two bases, D3 deadline-free floors, D4 the ask is clock-free
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` — D1/D2 the `target` JSONB shape and the seven legal pairings
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` — **D3 is the binding constraint**: one demand function, and the indicator must not invent a second ask
- **Extends:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — the pane this control lands in
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — D1, the identity `balance = assigned + activity + carryIn`
- **Supersedes:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` **D8** — in one respect only: Snooze leaves that spec's out-of-scope list
- **Supersedes:** `agent-os/specs/2026-08-25-1633-budget-inspector/` **D9** — in one respect only: Snooze leaves that spec's out-of-scope list

Neither supersession disturbs anything else in those specs. Both listed Snooze as scope-fencing
("schema changes out of scope"), never as an objection to the design.

## Context

**The problem, in Lee's words:** "I already bought my last pizza, and had extra. If I move the
extra somewhere else, pizza will show as underfunded. Which it should, if I still needed more
pizza, but I don't; I'm done with it for this month, so I can just turn it off."

Concretely, with a $25/week `add` target on Pizza: the month's cap is $100, $75 gets spent, the
leftover $25 is moved elsewhere. `neededAssigned` returns the full $100 cap, Assigned is $75, so
the gap is $25 and the envelope goes yellow — *"$25.00 more needed this month"* — for money that
is deliberately gone. The indicator is arithmetically right and practically wrong: there is no
way to say **done for the month** short of leaving the money parked.

The same switch answers a second case Lee named: a self-imposed savings goal you still intend to
hit, set aside for a month because something else is a higher priority. That is a _pile_-family
target (`balance`/`by`/`none`) rather than a period refill, and it reaches the ask through the
same seam — so one rule covers both families, and both get a test.

Snooze is a known, wanted, twice-deferred feature. Nothing is implemented: `grep -ri snooze src/`
returns nothing. It was not on the roadmap when this spec was shaped.

**Outcome:** a per-envelope, per-month switch that zeroes the target ask, recolors the Available
pill, marks the row with a Zz, and expires on its own when the month turns.

## Decisions

**D1 — Snooze is a per-(category, month) fact, stored on the allocation row.**
Add `snoozed boolean not null default false` to `finance_budget_allocations`, beside `carryover`
and `goalCents`. That table is already the one per-(category, month) row and is already **sparse —
a missing row means not snoozed** (`schema.ts:2848`). This is what buys automatic expiry: next
month is a different row, so the snooze lapses with no cron, no cleanup, and no stale state.

_Rejected:_ `snoozedMonth date` on `finance_budget_categories` — one mutable "which month" that
goes stale, needs an `=== month` check at every reader, and cannot record that July and September
were both snoozed.

**D2 — The switch zeroes the target demand and nothing else.**
`neededAssigned` (`assign/plan.ts:86`) is already `max(targetDemand, assignedToZeroBalance)`.
Snoozed makes the first term 0; **the overspend floor survives**. A snoozed envelope that is
overspent stays red and is still covered by Underfunded — snooze silences an _ask_, it never hides
money that is already gone.

The check goes in `neededAssigned`, **not** in `targets/demand.ts`. `targets/` is about the target,
and `refill-basis` D4 deliberately removed the clock from it. Snooze is an envelope-_month_ fact
and arrives as data on `AssignEnvelope`.

One seam satisfies the whole bulk-action requirement by construction: `underfunded`,
`underfundedGapCents`, and the one-envelope inspector Assign all read that function. It also
honours `budget-funding-indicators` D3 — the indicator still reads the single ask rather than
growing a second opinion.

**D3 — Reduce Overfunding harvests a snoozed envelope. That is the point, not a bug.**
With demand 0, `reduce-overfunding` (`plan.ts:321`) offers to pull a snoozed envelope's surplus
back to Ready to Assign — exactly the gesture Lee described: done with pizza, want the money
elsewhere. The five history-and-reset options (`assigned-last-month`, `spent-last-month`, both
averages, both resets) never read `neededAssigned` and are unaffected.

**D4 — A dedicated `snoozed` indicator state.**
`IndicatorState` gains `"snoozed"`; `IndicatorIcon` gains `"snooze"` (the Zz). The branch sits
immediately after `overspent` in `envelopeIndicator`, so **overspent still wins**. Copy:
`Snoozed for August`. Pill: **green** when Available > 0, **gray** at $0. The funding bar is kept,
coloured by the snoozed pill.

_Rejected:_ reusing `funded` with only a Zz badge — a $0 snoozed envelope reporting "Funded" is a
lie the grid tells.

**D5 — Current month only.** The control is disabled with a stated reason in every other month,
and `setTargetSnooze` re-checks server-side against `localDateKey(new Date())` rather than trusting
the client (`security.md`). A past month keeps whatever flag it was given: that is an accurate
record of what was done, not stale state to clean up.

**D6 — Bills cannot be snoozed.** A **named divergence** from the requested product spec, on
evidence traced through the code rather than inferred:

1. _A variable bill whose charge has posted already stops asking._ This is the electricity /
   water / sewer case, where the amount differs every month so the target can only ever be an
   estimate. Traced for a $150 estimate charged $120 on Aug 10: `billAnchor` sets
   `expectedKey = nextDueDate(lastCharge, cadence)` = Sept 10 (`commitments.ts:214`);
   `scheduleAnchor` reads `expectedKey ?? nextDueKey` (`cadence.ts:57`); so
   `outstandingCharges(bill, August)` is 0 and `periodCapCents` is **$0**. Moving the unspent $30
   out leaves `neededAssigned = max(0, assignedToZeroBalance) = $120` against $120 assigned —
   **gap $0, no yellow**. The same mechanism covers a ChatGPT Plus charge posting at $0.00 against
   a $20.60 median. `demand.ts:83-88` states the rule outright: outstanding charges, not the
   calendar, which "stops a paid one".
2. _A sinking bill's yellow is wanted._ Lee: "Silence the demand on a sinking bill seems
   appropriate in theory... But I don't think I'd do that. I'd rather just let it stay orange to
   remind me I need to put money."
3. _Bills already have three ways to go quiet_ — `status: 'paused'` (which `isInactive`,
   `indicator.ts:71`, already short-circuits to a zero ask), `cancelled`, and an editable
   next-charge date. Snooze would be a fourth.

**The residual gap, stated honestly:** between receiving a bill notice and the charge posting,
`expectedKey` is still this month's date, so the cap is the full estimate. Moving money out in
that window does go yellow until the charge clears. Accepted as the cost of D6 — the envelope is
genuinely under-funded against the only figure the app has until the ledger settles, and the one
power snooze would add there is quieting a charge that is about to hit.

Disabled with the reason, per `navigation.md`.

**D7 — Credit-card payment categories: requirement not applicable, and deliberately so.** No such
concept exists here, twice in writing already (`budget-assign-options/plan.md:54`,
`ynab-target-engine/shape.md:25`). `EnvelopeKind` is exactly `income | spending | bill | savings`.

Worth stating the reason, because this is one of the few places the app keeps **Actual's** model
over YNAB's on purpose. The target engine, the Assign gesture, the funding indicators and now
Snooze are all YNAB-shaped; credit cards are not. Actual's handling — a card balance is just
negative money in the one pool, which `accountPoolCents` subtracts naturally with no `abs` and no
kind-specific sign inversion (`single-pool-budget` D2) — is simpler and more direct than YNAB's
payment categories and cash-vs-credit split. It needs no envelope kind, no reconciliation between
an envelope and a card balance, and no extra state for Snooze to have an opinion about.

So the requested spec's "Credit Card Payment categories cannot be snoozed" exclusion has nothing
to exclude, and that is the intended end state rather than a gap to be closed later.

**D8 — The "scheduled transaction override" requirement does not apply.** There are no scheduled
transactions in this codebase; `finance_schedules` was collapsed into the bill facet by
`one-budget`, and a next charge is derived from imported charge history rather than stored as a
future row. With D6 the override rule is moot in any case.

**D9 — Snooze requires a stored target.** An envelope with no target has no ask
(`hasUnderfundedAsk`, `plan.ts:76`) and can never be underfunded, so there is nothing to silence.
Disabled with that reason, and rejected server-side.

**D10 — One inspector serves both shells.** The requested separate mobile modal already exists:
`BudgetInspector` renders in the desktop `<aside>` and inside a `Drawer` below `md`
(`BudgetView.tsx:1704-1720`). One control, one label.

**D11 — Out of scope.** Snoozing a whole group or the whole budget. A snooze spanning months.
Snooze history or audit lines in the month notes. Dashboard and Register surfacing. Any change to
the two target families or to envelope arithmetic.

## Acceptance criteria

- [x] Pizza with a `$25/week add` target, $75 assigned, $75 spent, $0 available, snoozed → gray
      pill, Zz icon, _"Snoozed for August"_; not yellow
- [x] Same envelope with $25 still in it → green pill, Zz icon, same copy
- [x] A **pile-family** target (a `balance`/`none` savings goal) snoozes through the same seam —
      set aside this month, asking normally again next month
- [x] Snoozed **and overspent** → still red `overspent`, and still funded by Underfunded
- [x] A snoozed envelope contributes $0 to `underfundedGapCents` and is skipped by
      Auto-Assign → Underfunded
- [x] Reduce Overfunding offers a snoozed envelope's surplus back to Ready to Assign
- [x] Assigned Last Month / Spent Last Month / both averages / both resets behave identically
      whether or not the envelope is snoozed
- [x] The control is disabled with a stated reason on: a bill, an envelope with no target, and any
      month that is not the current one
- [x] Paging to next month shows the envelope evaluating normally, with no write of any kind
- [x] A second user cannot snooze, clear, or read the first user's snooze
- [x] `npm test` green (unit **and** integration — check for the Postgres skip warning);
      `npm run smoke` passes after the action is added

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Eligibility (D5/D6/D9) was extracted into `src/lib/finances/budget/snooze.ts` as `snoozeUnavailableReason`, with its own unit test, instead of being written once in the mutation and again in each control.                                                                                                                  | The plan had the rules enforced server-side _and_ stated as a `title` on two controls — three copies of the same list, and the way a disabled button and a permissive endpoint drift apart. One function, read by the mutation and both controls, so the reason a control shows is literally the reason the server rejects with. It also carries an income case the plan did not name. |
| 2   | The snoozed ask falls to the **overspend floor**, not to `$0` — the plan's wording ("zeroes the target ask") is exact about the _target term_ but reads as if `neededAssigned` returns 0. Where money has been spent against no assignment, the floor is non-zero and Underfunded still funds it.                             | This is D2 working as written, not a change of behaviour; it is recorded because the first test asserted `0` and had to be corrected. It is the difference between silencing an ask and hiding money already gone.                                                                                                                                                                     |
| 3   | The plan's Task 8 asks for a note that the roadmap's refill-basis paragraph still states the superseded day-level `since` rule. **Still true and still uncorrected** — the roadmap has no `target-since-month-granularity` entry at all, so that spec is unrecorded as well as contradicted. Separate work, as the plan says. | Flagged rather than fixed, per the plan.                                                                                                                                                                                                                                                                                                                                               |

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`. No visuals were
supplied. **Done** — implementation starts in a fresh session at Task 2.

## Task 2: Schema and migration

`src/db/schema.ts` — add `snoozed` to `financeBudgetAllocations` (~line 2848) with a doc comment
stating the sparse-absence invariant and why expiry is free.

Generate the migration with `npm run db:generate` (→ `drizzle/0085_*.sql`) and commit its snapshot.
Per `agent-os/standards/database/migrations.md`: generated, never hand-written; direct connection,
not the pooler.

## Task 3: Thread the flag to the ask

One field at each hop, mirroring `carryover` exactly:

- `src/lib/finances/budget/queries.ts` — select it (~491) and map it (~532)
- `src/lib/finances/budget/envelope.ts` — `AllocationInput` (165), `CategoryMonth` (226),
  `ZERO_CATEGORY_MONTH` (281). Pure transport; it does **not** enter the balance recurrence
- `src/lib/finances/budget/rows.ts` — `BudgetRow.snoozed`
- `src/lib/finances/budget/assign/fromBudget.ts` — `assignEnvelopeFromRow` (33)
- `src/lib/finances/budget/assign/types.ts` — `AssignEnvelope.snoozed`

Then the behaviour change, at exactly one place: `neededAssigned` (`assign/plan.ts:86`) returns
`{ needed: assignedToZeroBalance(envelope), errors: [] }` when `envelope.snoozed`.

## Task 4: The indicator

`src/lib/finances/budget/indicator.ts` — add `"snoozed"` to `IndicatorState` and `"snooze"` to
`IndicatorIcon`; add the branch after `overspent` per D4.

`src/components/finances/budget/FundingChrome.tsx` — a `ZzIcon` and its `FundingIcon` case. The
`PILL` / `FILL` maps need no change; snooze reuses an existing pill colour.

## Task 5: Mutation and action

`src/lib/finances/budget/mutations.ts` — `setTargetSnooze(userId, { month, categoryId, snoozed })`
beside `setCarryover` (496). Reuse its `onConflictDoUpdate` upsert; **drop the propagate-forward
half** — snooze is one month. Enforce D5, D6 and D9 server-side after `requireCategory`.

`src/app/finances/actions.ts` — `setTargetSnoozeAction(month, categoryId, snoozed)`, the same
three-line `run(...)` shape as `setCarryoverAction` (472).

## Task 6: Controls

- `src/components/finances/budget/BudgetInspector.tsx` — a toggle in the existing **Target**
  section beside "Edit target…", labeled _"Snooze target for this month"_, with `title` carrying
  the reason whenever disabled.
- `src/components/finances/budget/BudgetView.tsx` — a row-menu item beside "Roll overspending
  forward" (~1229), already the per-month-boolean precedent: _"Snooze target for August"_ /
  _"Stop snoozing"_. Per `navigation.md`, a command without a menu is not shipped, and unavailable
  is disabled with a reason.
- Wire `onSnooze` through the same `run(...)` path the other inspector actions use.

## Task 7: Tests

- `indicator.test.ts` — every D4 case, plus snoozed-and-overspent staying red, and a pile-family
  target (`balance`/`none`) alongside the period-family one, since the seam sits above both
  families and nothing else proves it
- `assign/plan.test.ts` — Underfunded skips it; `underfundedGapCents` excludes it; Reduce
  Overfunding harvests it; a snoozed **overspent** envelope is still covered; the five unaffected
  options are unaffected
- `mutations.integration.test.ts` — set, clear, re-set; the three rejections (bill, no target,
  wrong month); **cross-user: a second user cannot read, change, or clear the first user's snooze**

Per `agent-os/standards/development/testing.md`, `npm run test:unit` passing does not mean the
database tests ran. Check for the skip warning.

## Task 8: Verify, freeze spec, update roadmap

`npm test`, then start the dev server and run **`npm run smoke`** — `src/app/finances/actions.ts`
is touched and nothing else in the gate renders a `"use server"` module.

Walk the real app: snooze Pizza, confirm the pill and the Zz, run Auto-Assign → Underfunded and
confirm it is skipped, page to September and confirm the envelope evaluates normally.

Then set `plan.md` / `shape.md` to **Status: frozen / complete** (dated), complete **Changes from
original plan**, and add a Financial-planning entry to `agent-os/product/roadmap.md` (Phase 3,
~line 1051, beside the other target entries).

While in the roadmap, note that its refill-basis paragraph (~1069) still states the superseded
day-level `since` rule, which `target-since-month-granularity` replaced. Flag it; correcting it is
separate work, not this spec's.

---

**Standing rule while this spec is active:** material changes to requirements, design or scope —
including Lee's feedback on what was actually built — go into `plan.md` / `shape.md` plus a row in
**Changes from original plan**. Skip pure implementation detail. Freeze when verified.
