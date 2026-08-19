# Commitments — say what it does

**Status: frozen / complete** (2026-08-18)
Spec folder: `agent-os/specs/2026-08-18-2058-commitments-clarity/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/`
- **Supersedes:** `agent-os/specs/2026-08-16-1938-commitments/` — the `setAside` opt-in on both
  tiers (its D1/D6 storage detail, not the arithmetic), and the review list's commit-on-click
  behaviour. Everything else in that spec carries forward unchanged.

## Context

The Commitments feature computes the right answers and shows the wrong ones. The user — who
designed it — could not tell from the screen what the Hold checkbox does, could not rename a
recurring-spend group created from the review list, and did not know that the annual-envelope
behaviour they wanted from YNAB was already shipped.

Traced against the code, the arithmetic is sound and the surface is not:

| Story                             | Reality                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spread rent across both paychecks | Works. `setAsideHeld` accrues `expected / paydaysPerCadence` per payday, anchored on the last posted charge, so it self-corrects on biweekly drift |
| Annual bill saved up in twelfths  | **Already works** — `cadenceMonths: 12` → 26 paydays → $2.77/paycheck toward $71.88. Never stated on screen                                        |
| Set aside for pizza Friday        | Works, invisibly — `set_aside` defaults `true` on the spend table and has no UI at all                                                             |
| Add from detected candidates      | Works for bills; broken for spend — unnameable on create, unrenameable after                                                                       |
| Reveal past dismissals            | Inverted — dismissed rows are always visible in the bills grid                                                                                     |

Root cause is one thing repeated: **the decision surface reports a different number than the
system uses.** `/finances/commitments` shows `annualCost / 12` under the heading "Set aside";
the Dashboard shows the real per-payday accrual. Two figures, one label. Everything below is
the same fix applied five times — put the true number where the decision is made, and delete
the controls that exist only because an earlier design needed them.

This is not a visual-identity pass. The existing design system stays; the work is information
design.

## Decisions

**D1 — Delete `set_aside` from both tables.** It is redundant with state that already exists:
the Dashboard filters to `status === "active"` before accruing, and a bill with no amount
already accrues nothing. Every reason to untick it is covered by Status: Dismissed, Status:
Cancelled, or a blank amount. On the spend table it is a flag that can only ever be true — it
defaults `true` and has no UI. An active bill with an amount is held. Full stop.

The frozen spec's schema comment justified the bills default as _"a bill declaration was
originally about keeping something off a review list and said nothing about budgeting"_. That
was true before Commitments introduced `status`. It is not true now, and the flag outlived its
reason.

**D2 — One "Set aside" column that shows the accrual.** Replaces both the Hold checkbox and the
`annualCost / 12` column. The meter _is_ the explanation of the envelope behaviour — no help
text, no modal, no tour. A user who sees `$2.77 per paycheck · full Mar 30` on a yearly bill has
been told everything the feature does.

**D3 — The review list proposes; you name it before it commits.** Both "Track as bill" and
"Track as spend" expand the row in place (the `ItemList` precedent in `ux-principles` — expand
in place, never a modal). The frozen spec's own opening complaint was `1PASSWORDTORONTOON`; the
bank's string is usually not the name you want, on either tier.

**D4 — Dismissed rows leave the bills grid and reappear under Review.** Storage stays as
`status: "ignored"` bills; no new table. The UI word becomes "Dismissed" so it matches the
button that creates it.

**D5 — Merging two existing spend groups is deferred.** Rename plus add-to-existing covers the
Pizza/Domino's case going forward. Merging two rows already created stays delete-and-re-add
until it actually bites.

### Constraints noted during shaping

- Dropping `set_aside` touches the agent write surface (`contracts.ts`, `financeTools.ts`),
  which is a strict-schema break by design — an agent passing `setAside` should fail loudly
  rather than have it silently ignored.
- `checkedMatchers` enforces cross-table merchant exclusivity, so "add to an existing group"
  is only offered for merchants that are unclaimed — which is exactly what the review list
  contains.
- Renaming a spend row cannot be insert-then-delete: the old row still holds the matchers and
  would trip exclusivity. `renameRecurringBill` already solved this with a direct column
  update; mirror it.

## Acceptance criteria

- [x] No Hold checkbox anywhere; `set_aside` is gone from both tables and the agent contracts
- [x] A yearly bill reads the same figures on both pages. The live 1Password row shows
      `$71.88 ready · overdue` on Commitments and `$2.76 per paycheck of $71.88 · due 3/30/2026
    · fully set aside · overdue` on the Dashboard — the same accrual, from the same builder
- [x] "Track as spend" opens a draft with the name pre-filled and editable; choosing an existing
      group swaps the commit button to "Add to Pizza" and hides the new-group fields
- [x] A recurring-spend row can be renamed inline, and switched inactive, from the grid
- [x] Dismissed detections do not appear in Subscriptions & bills, and are restorable from a
      disclosure under Review — walked end to end on the live database and restored
- [x] 2818 unit tests, 755 integration tests (Postgres up, no skip warning), `typecheck`,
      `lint`, `next build`, and `npm run smoke` across all 57 routes

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish is
omitted.

| #   | Change                                                                                  | Why                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Added Task 3b (rename + Active on the spend grid)                                       | The approved plan carried an acceptance criterion no task covered                                                                                                                                                                    |
| 2   | The Set aside cell is one line, not two                                                 | Grid rows are exactly `--row-height` (1.75rem). The two-line design in Task 3 rendered on top of the row below. The due date moved out of the cell rather than being shrunk — Next charge already carries it two columns to the left |
| 3   | The Rate cell was folded to one line too                                                | Same defect, pre-existing: it had a second line being clipped. Left alone it would have been the only cell on the page still overflowing. Its "history $33.07" beside an auto rate also said the same number twice                   |
| 4   | Row derivation moved to `src/lib/finances/commitmentRows.ts`, and the Dashboard uses it | Deleting `set_aside` left the `status === "active"` rule duplicated in two components. That rule decides what the headline means; it now has one implementation and a test                                                           |
| 5   | `PAYDAY_CODEC` extracted to `src/components/finances/paydaySetting.ts`                  | The Commitments grid needs the same next payday the Dashboard uses, since the spend hold reaches to it. It sits in the component layer because `SettingCodec` does — `src/lib` does not import from `src/components`                 |
| 6   | This plan's figures said `$2.77 per paycheck`                                           | Arithmetic: 7188/26 rounds to 276, not 277. Caught by the first run of the new test                                                                                                                                                  |

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Delete `set_aside`

Migration first (generated, never hand-written — `database/migrations`): drop `set_aside` from
`finance_recurring_bills` and `finance_recurring_spend`.

Then the guards, which is where the behaviour change actually lands:

- `src/lib/finances/available.ts` — `setAsideHeld` drops the `!bill.setAside` clause;
  `expectedCents > 0` becomes the only gate. `status === "active"` stays the caller's job, as
  the existing comment says.
- `src/lib/finances/available.ts` — `recurringSpendHeld` drops `!entry.setAside`;
  `!entry.active` remains.
- `src/db/schema.ts` — remove both columns and the doc comments arguing for the defaults.
- `src/lib/finances/mutations.ts` — drop `setAside` from `RecurringBillEdit` /
  `RecurringSpendEdit` and both upserts.
- Agent surface: `contracts.ts`, `tools.ts` (the field description), `financeTools.ts`.
- `available.test.ts`, `commitments.test.ts`, `mutations.integration.test.ts`,
  `dashboardQueries.integration.test.ts` all reference it.

Add tests that would fail on a plausible mistake: an active bill with an amount accrues with no
flag set anywhere, and a cancelled bill with an amount accrues nothing.

## Task 3: The Set aside column

`CommitmentsView` already holds every argument `setAsideHeld` needs (`bills`, `paydays`,
`billCharges`, `today`) and `recurringSpendHeld` needs (rate, charges, next payday). Call them
where `billRows` / `spendRows` are built, and delete `monthlySetAsideCents` — the
`annualCost / 12` figure — as a concept. Keep the header's "$X / month · $Y / year", relabelled
as cost rather than set-aside.

A small local `FundingMeter` in `src/components/finances/commitments/` — there is no existing
progress component and this needs no generality beyond these two grids.

Bills cell, by state:

```
active, funding    ▓▓░░░░  $8.31 of $71.88
                   $2.77 per paycheck · full Mar 30
fully funded       ▓▓▓▓▓▓  $71.88 ready · due Mar 30
overdue            ▓▓▓▓▓▓  $71.88 ready · overdue since Mar 30   (chart-spend)
no amount          Set an amount to hold this back
not active         —
```

Spend cell:

```
▓▓▓░░  $15.00 held
$45.00 of $60.00 spent this period
over by $12.00                                                   (chart-spend)
```

`sortValue` becomes `heldCents`. Keep "A year" on bills — it is what ranks cancellation
candidates.

## Task 3b: Rename and Active on the spend grid

The bills grid has both; the spend grid has neither, which is how a row named `PIZZA HUT #4471`
became permanent.

- `renameRecurringSpend(userId, from, to)` in `mutations.ts`, mirroring `renameRecurringBill`:
  a direct `name` update, not insert-then-delete, because the old row still holds the matchers.
- `renameRecurringSpendAction` in `src/app/finances/actions.ts`.
- `SpendColumnCtx` gains `onRename`; the name column becomes the same editable input the bills
  grid uses, committing on blur.
- An `Active` checkbox column, patching `active`. Inactive rows stop being held and stop
  appearing in the forward projection — which is the "stop budgeting this" escape hatch D1
  relies on for tier 2.
- Integration test including a second user failing to rename the first user's row.

## Task 4: Review proposes, you name it

`ReviewList.tsx`. One row expanded at a time; Escape or Cancel collapses; the second click
commits through the existing `setRecurringBillAction` / `setRecurringSpendAction`.

```
PIZZA HUT #4471    Weekly   $31.40   $1,632   [Track as bill] [Track as spend] [Dismiss]
  ┌──────────────────────────────────────────────────────────────┐
  │ Track as recurring spend                                     │
  │ Name  [Pizza Friday      ]   Period [Weekly ▾]               │
  │ ( ) New group   (•) Add to existing  [Pizza ▾]               │
  │ Matches: PIZZA HUT #4471                                     │
  │                                    [Cancel]  [Track as spend]│
  └──────────────────────────────────────────────────────────────┘
```

- Bill editor: Name, Cadence (prefilled from detection), Amount (prefilled typical), Next
  charge. The same fields `NewBillForm` collects — reuse its shape, not its component.
- Spend editor: Name, Period, and new-vs-existing. Add-to-existing patches the target's
  matchers, so `ReviewList` needs the `spend` rows passed down from `CommitmentsView`.
- The matcher is always the raw bank string, shown read-only. That is the frozen spec's D2
  name/matcher split finally reaching the surface that creates rows.
- New pure helper `suggestCommitmentName(merchant)` in `src/lib/finances/commitments.ts` with a
  sibling test: strip `#4471`-style store numbers and trailing digits, title-case. Best effort —
  it prefills an editable field, so a mediocre guess costs nothing.

Below `md` the expansion is a stacked block, not a cramped row (`components/responsive`).

## Task 5: Dismissed

- Filter `status === "ignored"` out of `billRows` in `CommitmentsView`; pass those rows to
  `ReviewList` as `dismissed`.
- Review gains a quiet disclosure — `3 dismissed · Show` — expanding to the rows with
  **Restore** (`deleteCommitmentAction({ kind: "bill", name })`, which returns the merchant to
  the review list on the next load).
- The bills Status select relabels `ignored` → **Dismissed**; the stored value does not change.
  Choosing it moves the row into that disclosure, which the section's help line states.

## Task 6: Wording

Every string that describes a subtraction is rewritten to describe an accrual. Active voice,
sentence case, the same verb through the whole flow.

- Bills section: _"Charges unless you cancel. A bit of each active bill is held out of every
  paycheck, so the money is there when it lands — a yearly bill saves up over 26 of them."_
- Spend section: _"Things you buy on a routine. The period's rate is held back before payday;
  spending it costs you nothing extra, going over is what bites."_
- The Dashboard's "N of M active bills are set aside" footnote is obsolete under D1. Replace
  with the count of active bills that have **no amount** — now the only way a commitment
  silently fails to be held.
- Empty states become invitations with the next action named, not statements of absence.

## Follow-ups (new work — not amendments to this frozen spec)

- **The Review panel on a phone.** It is a `min-w-[32rem]` table inside a horizontal scroller,
  so its buttons — and now the draft editor — need a sideways scroll below `md`. This predates
  the spec, and the browser would not resize during verification, so no blind fix was attempted.
  Wants its own pass alongside whatever else on this page is untested at 390px.
- **`1PASSWORD` vs `1PASSWORDTORONTOON`.** Verification surfaced a real data problem the new
  column made visible: the March 2026 charge posted under a shorter merchant string the bill
  does not match, so the app believes the charge never arrived, holds the full $71.88, and marks
  it overdue. The display is correct; the matcher needs the second string. Left for the user,
  since it is his data and the fix is one edit.
- **Shortfall attribution**, still outstanding from the parent spec.

## Task 7: Verify, freeze spec, update roadmap

`npm run test:unit` (confirm the DB tests did not skip), `typecheck`, `lint`, `next build`, and
`npm run smoke` against a running dev server — `src/app/finances/actions.ts` is touched and
nothing else in the gate evaluates a `"use server"` module.

Then drive it in a browser against real data: the 1Password row must read the same figures on
`/finances/commitments` and `/finances`. Freeze both docs, complete **Changes from original
plan**, and note on the roadmap that the envelope item is now legible as well as closed.

---

**Standing rule:** while this spec is active, material changes to requirements, design, or
scope — including feedback on what was actually built — go into `plan.md` / `shape.md` and a row
in **Changes from original plan**. Pure implementation detail does not.
