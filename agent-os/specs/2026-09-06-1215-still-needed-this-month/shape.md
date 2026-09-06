# Still needed this month — Shaping Notes

**Status: frozen / complete — 2026-09-06**

## Scope

One figure on `/finances/budget`, beside Ready to Assign: **total needed − total assigned**
for the month on screen, with a collapsed derivation naming the envelopes behind it.

The user's words, when asked which shortfall he meant: _"Total needed - total assigned. Since
I'm still waiting on the second paycheck to fully fund everything."_ Placement: Budget header,
beside Ready to Assign. Horizon: this month only.

### Out of scope

- **Income forecasting.** No "income still expected this month" term. There is no
  per-paycheck expected-amount model — only `expectedMonthlyIncomeCents` on income envelopes
  and a single `nextPayday()` date — so a remaining-income series would have to be invented.
  Explicitly declined in favour of the literal ask.
- **A before-payday cash view** ("what must be covered before the 15th"). Considered and not
  chosen.
- Rolling into next month.
- Schema, mutations, server actions, queries. This figure is entirely derived.
- Any change to Plan margin, Fix This, Assign, the row pills, or the Bills forecasts.

## Decisions

Full statements are D1–D7 in `plan.md`. In brief:

- **D1** — the headline is `underfundedGapCents`, not a new formula. `neededAssigned` is
  documented in `plan.ts:95` as the single seam; the header, the pills and Assign must never
  be able to disagree. No Savings-excluded variant.
- **D2** — per-envelope clamp; an overassigned envelope contributes `0` rather than offsetting.
- **D3** — the viewed month, from the same `assignScanInputs` the grid uses.
- **D4** — Savings stays in the total (a deadline-free floor is a real ask), but the
  disclosure subtotals Bills / Regular spending / Savings so a large floor is separable at a
  glance rather than silently dominating the headline. This was the one live risk found
  during shaping.
- **D5** — the disclosure ends by subtracting Ready to Assign, so the same card answers both
  "how much is still unassigned" and "how much has to arrive".
- **D6** — amber `--goal-unmet`, never red. Short of an ask is not an overspend.
- **D7** — the out-of-scope list above.

### Design notes

The card is an existing, deliberately-designed ledger surface (tabular numerals, hairline
rules, a headline that reads as the result of a calculation). The right move is to extend that
system, not to introduce a look. Ready to Assign stays the hero at `2.25rem`; Still needed is
its counterweight at `1.5rem` on the same baseline. Both gain a small label, since a second
unlabelled figure would be ambiguous. No vertical rule between the pair — it would not survive
the wrap on phone, and the labels already separate them.

Zero is a real state and gets its own copy, not a blank: every envelope has what it asked for.

## Context

- **Visuals:** None.
- **References:** see `references.md`.
- **Product alignment:** Phase 3 of `agent-os/product/roadmap.md`, the Budget lineage. The
  roadmap's open **"Shortfall attribution"** item notes that the budget already "states a
  shortfall per bill envelope rather than as one collapsed number" and that what remains
  missing is the guided step from a red envelope to an action. This spec is not that item —
  it adds the one collapsed number back **beside** the per-envelope statement, for the
  "will the next paycheck cover it" question the per-row view cannot answer. The guided
  cancel/skip action stays open.

## Standards Applied

See `standards.md` for paths and the pinned commit.

- `components/ux-principles` — summary chrome and disclosure behaviour
- `components/responsive` — the header pair must wrap cleanly below `md`
- `development/clean-code` — arithmetic in `src/lib/**`; the component stays presentational;
  one shared implementation per concern (D1)
- `development/testing` — pure logic gets a unit test beside it; no React component tests; no
  integration test, because nothing touches the database
- `development/commits` — one logical change per commit
