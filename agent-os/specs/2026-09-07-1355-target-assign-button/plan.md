# Assign under Target

**Status: frozen / complete** (2026-09-07)  
Spec folder: `agent-os/specs/2026-09-07-1355-target-assign-button/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — D7 Target section and
  the one-envelope Underfunded quick action; D4/D5/D6 inspector chrome (desktop pane,
  phone sheet). This delta moves that action _into_ Target and adds progress details. It
  does not reopen the frozen inspector folder.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — Assign never
  spends more than Ready to Assign; `gap = max(0, neededAssigned − assigned)`; inspector
  Assign is one-row Underfunded, not a second engine.
- **Extends:** `agent-os/specs/2026-08-25-0831-assign-skip-full-single/` — one envelope
  that can be fully funded writes immediately; a Ready to Assign shortfall still previews.
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` D3 — one ask.
  The callout amount is `moreNeededCents`. Needed / Funded / To Go read the same horizon
  and fill basis as the grid bar.
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` and its deltas
  (`target-refill-basis`, `pile-spent-is-not-a-raid`, `one-time-savings-goal`,
  `deadline-free-goal-never-asks`) — the Target model is not reopened.
- **Extends:** `agent-os/specs/2026-08-28-1503-monthly-target-installment-copy/` — a
  positive installment shortfall is "this month".
- **Extends:** `agent-os/specs/2026-08-28-2223-target-snooze/` — snooze already exists in
  Target; keep that control. Do not invent a second snooze.
- **Extends:** `agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/` — Ready to
  Assign is the funding pool. It is not a transaction category and is not a destination
  for this action.

## Context

YNAB's selected-category inspector, under Target, does three jobs at once: name the
target, show overall progress (Needed / Funded / To Go), and — when this month's
installment is short — offer one click that assigns exactly that shortfall from Ready to
Assign.

Our inspector already has the pieces, in the wrong place and without the progress
table:

- Target copy, Edit/Create target, and snooze live in the Target section.
- "Assign $X to stay on track" is a quiet button **below Files here**, after the Target
  section has ended. It already calls one-row Underfunded (`BudgetView` → `planAssign`
  `option: "underfunded"` with `categoryIds: [row.id]`).
- Overall progress (the bar's Needed / Funded) is on the **grid**, not in the pane.

Lee's reference is `.artifacts/ynab-assign-under-target.png` (do not commit). The
screenshot is chrome, not a new target engine.

## Decisions

### D1 — Same assign path, new chrome

The Target Assign button is the existing one-envelope Underfunded action. It does not
grow a mutation, a desired-assigned formula, or a destination other than this envelope.

Source of funds: **Ready to Assign**. The clamp, ranking, and shortfall preview are
unchanged. Ready to Assign is not a register category.

### D2 — Callout when this month still asks

Show the callout when `indicator.moreNeededCents > 0` and the row is not income — the
same predicate the inspector button already uses. Copy:

> Assign **$X.XX** this month to stay on track

with a separate prominent **Assign** button. `$X.XX` is `moreNeededCents`, the same
figure as the amber grid copy and as Assign → Underfunded for this row.

A snoozed envelope only reaches this when the overspend floor still asks (`target-snooze`
D2). A deadline-free `save` goal never does (`deadline-free-goal-never-asks`). Overspend
with no target still can, because Underfunded still covers money already gone.

Do not disable the button when Ready to Assign is $0; the existing shortfall preview is
the honest outcome.

### D3 — Needed / Funded / To Go is the bar's question, not a second demand

When the envelope has a resolved target (stored, or a derived bill target), the Target
section lists three cents figures:

| Line   | Meaning                                                                                                                                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Needed | The amount that horizon fills toward (`periodCapCents` for a period refill; `target.amountCents` for a pile / floor / goal).                                                                                                                                                      |
| Funded | Assigned this month for `add` (leftovers do not count toward a contribution). Otherwise the same fill basis the bar already uses: carry-in + assigned for a period `upTo` and an `upTo` pile; Available for `balance`; contribution (including this month's Assigned) for `save`. |
| To Go  | `max(0, Needed − Funded)`.                                                                                                                                                                                                                                                        |

A Needed label may name a deadline we already store (`Needed by {monthLabel}` for
`cadence.unit === "by"`; `Needed by {monthName}` for `year`). Do not invent a calendar
day. Period refills and deadline-free targets just say **Needed**.

These numbers are overall progress toward the target, which can be larger than this
month's installment. The callout is the installment. That split is the point of the
YNAB pane and of `monthly-target-installment-copy` D2.

No target (and no derived bill target): omit the three lines.

### D4 — Progress display reuses `indicator.bar`

If the indicator has a bar, Target may show its `fill01` as a compact percentage (and a
simple ring or bar). It must not compute a different fraction.

### D5 — Target copy stays our sentences

Keep `summarize(target)` (and existing bill estimate copy). Do not switch the pane to
YNAB's "Refill Up to…" vocabulary. Edit/Create target still opens `TargetDrawer`. Snooze
stays the existing toggle with `snoozeUnavailableReason`.

### D6 — Layout order inside Target

1. Target heading.
2. Summary sentence (and bill estimate copy when that is the honest line).
3. Progress (`fill01`) when a bar exists.
4. Assign callout (D2) when `moreNeededCents > 0`.
5. Needed / Funded / To Go (D3) when a resolved target exists.
6. Edit/Create target and snooze, as today.

The duplicate Assign button below Files here is removed. Cover / Move stay on Available.
Month-bar Assign, Auto-Assign, and the row menu are unchanged. No new command.

### D7 — Out of scope

- New target types, cadences, or bases.
- Snooze behaviour, eligibility, or a YNAB-style switch restyle (keep the existing
  button).
- Auto-Assign inside the pane.
- Cash vs credit split.
- Persisting inspector width.
- Schema / migrations.
- Committing the YNAB screenshot.

## Acceptance criteria

- [x] Selecting an underfunded category shows, **inside Target**, "Assign $X.XX this
      month to stay on track" and a prominent Assign button, where $X.XX equals the
      amber grid copy and Assign → Underfunded for that row.
- [x] Clicking Assign assigns that amount from Ready to Assign into this category via
      the existing one-row Underfunded path; Ready to Assign does not go more negative
      than today's clamp already allows; a shortfall still previews.
- [x] The same category shows Needed / Funded / To Go that match D3.
- [x] A fully funded / on-track / snoozed-without-overspend / deadline-free-goal
      category does not show the callout (`moreNeededCents === 0`).
- [x] Edit target and snooze still work; snooze is not redesigned.
- [x] Income has no Target Assign. No target and no derived bill omits Needed / Funded
      / To Go.
- [x] Phone inspector sheet: Assign is a 44px tap target; desktop is unchanged in
      structure.
- [x] `npm run lint`, `npm run typecheck`, `npm run test:unit`; integration only if a
      mutation is touched (it should not be); `npm run smoke` with the dev server up;
      browser-verified on desktop and 390-wide.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                                                                      | Why                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolved-target `summary` (`summarize`) is part of `targetProgress`, and Target prefers that sentence over the scan-layer "$X more needed this month" copy. | Derived bills have no stored `row.target`; without this they would repeat the installment in the heading and the callout. The callout is the installment; the heading is the target sentence. |
| 2   | `add` Funded is this month's Assigned, which can disagree with the grid bar (carry-in + assigned). The ring still uses `indicator.bar.fill01`.              | D3 named the contribution rule explicitly. Leftovers must not look like progress on an `add` line.                                                                                            |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-09-07-1355-target-assign-button/` with `plan.md`,
`shape.md`, `standards.md`, `references.md`, and `visuals/approved-wireframe.md`.
Do **not** commit `.artifacts/ynab-assign-under-target.png`.

## Task 2: Pure Target pane view-model

Add a tested helper (prefer `src/lib/finances/budget/inspector.ts`, sharing
horizon/fill with `indicator.ts`) that returns:

- `assignThisMonthCents` / `showAssignCallout` from `moreNeededCents`
- Needed / Funded / To Go and the Needed label per D3
- `fill01` from the indicator bar

Pin at least: period `add`, period `upTo`, `balance` + `by`, `save` + `none` (no
callout, To Go still the remaining goal), a derived monthly bill, snoozed-without-
overspend (no callout), overspend floor (callout, no invented target lines).

Do not fork `neededAssigned`.

## Task 3: Reshape `BudgetInspector` Target section

Implement D6. Wire the existing `onAssignUnderfunded`. Remove the post-Files-here
button. Use `--goal-unmet` for the underfunded callout (same token as the amber pill),
not a one-off gold. Prominent Assign: filled control, `min-h-tap` below `md`.

No change to `BudgetView`'s `onAssignUnderfunded` body unless the inspector needs an
extra prop (it should not).

## Task 4: Verify, freeze spec, update roadmap

- Confirm acceptance criteria in the browser (underfunded → Assign; RTA drops;
  on-track hides the callout; phone sheet).
- Gate: lint, typecheck, unit tests; smoke against the running server.
- Update plan/shape for material as-built drift; fill **Changes from original plan**.
- Mark **Status: frozen / complete** (date). Follow-ups as new work.
- A short roadmap note under the inspector entry that Target now holds the Underfunded
  callout and Needed / Funded / To Go.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant
sections and append to **Changes from original plan**. Skip pure implementation
details. Freeze when verified.

## As built

- `src/lib/finances/budget/indicator.ts` — `targetProgress` (Needed / Funded / To Go +
  `summarize`). Horizon/fill shared with the grid bar; `add` funds from Assigned.
- `src/lib/finances/budget/inspector.ts` — `targetPaneView` (callout predicate +
  `fill01` from the indicator bar).
- `src/components/finances/budget/BudgetInspector.tsx` — Target section order per D6;
  the post-Files-here Assign button is gone. `onAssignUnderfunded` is unchanged.

## Verification

- `npx vitest run --project unit src/lib/finances/budget/indicator.test.ts src/lib/finances/budget/inspector.test.ts` — 64 passed.
- `npm run lint`, `npm run typecheck`, `npm run test:unit` — 333 files, 4037 tests.
- Browser, `/finances/budget` September 2026: Pizza callout $139.45 (same as the amber
  grid copy); Assign wrote that amount from Ready to Assign ($94,987.66 → $94,848.21)
  and hid the callout at 100% / To Go $0.00. Restored Assigned to $0.00 afterward.
  Geico: installment $140.01 in the callout, Needed by December 2026 $700.05, Funded
  $140.01, To Go $560.04, 20% ring. Phone sheet (390×844): same Target chrome; Assign
  button 44px tall.
- `npm run smoke` — 62 routes against the running dev server.
- No mutation/schema change; integration suite not required.

## Follow-ups (new work — not amendments to this frozen spec)

None.
