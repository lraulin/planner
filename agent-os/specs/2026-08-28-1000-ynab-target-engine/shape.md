# YNAB target engine — Shaping Notes

**Status: frozen / complete** (2026-08-28)

## Scope

Replace Actual Budget's goal-template engine with YNAB's target system.

- One nullable `target` per envelope instead of a JSONB list of typed lines.
- `behavior` (`add` / `upTo` / `balance`) and `cadence` (`week` / `month` / `year` / `by` /
  `none` / derived `schedule`) as explicit axes, rather than refill-vs-set-aside being implied
  by which optional fields are present.
- Every balance-style target measured against **Available**, not carry-in.
- A bill's cadence seeds a derived target, so there is one demand engine rather than two.
- A drawer that offers plain-language sentences with defaults by envelope kind.

### Out of scope

- **`add` + `year` and `add` + `by`.** Correct yearly set-aside needs "assigned since the cycle
  started", which nothing stores; a flat twelfth is identical to writing `add` + `month`.
- **Cadence knobs.** No "every N weeks", no per-target start date, no exact due _day_ on a
  yearly target (the month is the anchor — propane's date is fuzzy by nature).
- **Multiple targets on one envelope.** An envelope that wants two asks is two envelopes.
- **`remainder`.** Removed, not reshaped.
- **YNAB's credit-card payment categories and cash-vs-credit split.** Unrelated, still out.

## Decisions

Full statements in `plan.md` D1–D8. The ones worth carrying in your head:

- **Available, not Assigned, and not carry-in.** Assigned is a history of funding. Available is
  what can still buy groceries. `weekly-envelope-targets` D3 argued that a cheap week is spare
  cash rather than lower demand — true, and the conclusion drawn from it was still wrong. The
  per-occurrence amount does not fall; what you must _add_ falls, because the money is there.
- **Remaining occurrences for `upTo`, whole month for `add`.** `weekly-envelope-targets` D2's
  argument (a demand that moves week to week for reasons the grid cannot show) still holds for a
  contribution and does not hold for coverage.
- **A bill is an envelope with a target.** Cadence derives one rather than feeding a private
  engine. Propane stays a utility bill and gets a yearly top-up; it does not have to move to
  Regular to be modelled honestly. Counting uses `expectedKey` (the charge being waited for),
  not `nextDueKey`, so a late unpaid bill keeps asking.
- **Sentences, not a mode toggle.** YNAB's mechanics are right and its vocabulary is what made
  the choice feel like a puzzle. Copy the math, write our own sentences.

## Context

- **Trigger:** Groceries reading "$211.21 more needed this month" on 2026-08-28 when the true
  figure was $152.90 — one remaining Sunday at $210.96 less $58.06 already available. Lee
  reproduced the correct behaviour in YNAB with "Refill up to $210.96 each week, by Sunday" and
  confirmed it against September (4 Sundays → $843.84).
- **Visuals:** `visuals/ynab-weekly-target-refill.png`, `visuals/ynab-weekly-target-set-aside.png`,
  `visuals/ynab-refill-vs-set-aside-help.png` — YNAB's weekly target editor and its own
  explanation of the two "next month I want to" modes.
- **References:** `references.md`.
- **Product alignment:** the Finances module's envelope budget. The Actual Budget reference pack
  (`docs/actual-budget/README.md`) stops governing target semantics with this spec and keeps
  governing envelope arithmetic and the Apply/Overwrite gesture.

## Why this is a model correction and not speculative generality

`standards/development/clean-code.md` forbids building for a caller who does not exist, and asks
for two workarounds for the same missing concept before the model moves. There are three, all
present today:

1. Refill vs set aside is enforced by _field presence_ because the schema cannot say which job a
   line does — and `weekly-envelope-targets` D6 had to spend a decision renaming the UI copy
   because of it.
2. "Keep available $X" and `runBy` both recompute against carry-in because nothing measures the
   thing they claim to measure, so both go quiet after you spend.
3. Bill demand is a second engine (`billFundingDemand`) answering the same question as
   `demandOf`, because a bill "never holds a template".

Every category Lee actually has — variable utilities, propane, groceries, a $100k floor — is
already being worked around by one of those three.

## Standards Applied

- `development/clean-code.md` — the model-correction rule that licenses this refactor, and the
  app→components→lib→db direction the new `targets/` module keeps.
- `development/testing.md` — pure math in `src/lib/**` with tests beside it; the migration and
  `saveEnvelopeTarget` get integration tests with a cross-user case.
- `development/dates.md` — the UTC-noon encoding behind `weekdayOfDateKey`; `todayKey` is a
  parameter, never a process-local clock read inside the engine.
- `database/migrations.md` — generated, never hand-written without its snapshot; this one
  transforms live data and is not reversible.
- `components/drawer-pattern.md`, `components/ux-principles.md` — the rewritten target drawer.
- `development/security.md` — every mutation takes `userId` and proves ownership.
- `development/commits.md` — one logical change per commit across an eleven-task spec.
