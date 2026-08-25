# Budget funding indicators (YNAB scan layer)

**Status: frozen / complete** (2026-08-25)  
Spec folder: `agent-os/specs/2026-08-25-1310-budget-funding-indicators/`

This is the as-built record. Further change opens a new delta-spec.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — Underfunded's ask is live demand (`neededAssigned` / `demandOf`). The scan layer uses that same gap so a yellow row is exactly an envelope Assign → Underfunded would still fund.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — Bills and regular envelopes stay separate tables; both get the indicators. Income is not budgeted and stays numbers-only.
- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — Regular spending, Bills, and Savings all show the indicators. Savings is an ordinary envelope for this purpose.
- **Extends:** `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` — A monthly (`n = 1`) bill is a this-month ask (Funded vs `$X more needed this month`). Yearly/quarterly sinking is the On Track horizon. A monthly bill due next month asks $0, so it is not underfunded in this month.
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — Envelope math is unchanged. Available is still `assigned + activity + carry-in` (today's Balance).
- **Supersedes:** `agent-os/specs/2026-08-22-2242-budget-goal-templates/` — the Assigned-cell met/unmet rings driven by stored `goalCents`. Color, icon, copy, and bar live on Available and the name cell, from **live** demand (templates + bill cadence), not the last Apply snapshot. `goalCents` stays in the schema; the Budget UI stops reading it.

## Context

The original envelope-budget diagnosis was expressive, not arithmetic: one collapsed number cannot tell "this envelope is underfunded" from "you are short this week." Assign → Underfunded now names the holes, but the grid itself still colors only the **sign** of leftover (`balanceTone`: green / faint / red). That misses the YNAB fact in the attached screenshot: Apple Fitness can show **$20.01 Available and still be yellow**, because $6.67 more is needed for the target.

This spec is the scan layer for `/finances/budget`. Numbers do not change. Vocabulary on that last column becomes **Available** (YNAB), recorded as a named UI divergence from Actual's "Balance."

Roadmap "next" (guided cancel/skip from a red envelope) is **not** this spec.

## Decisions

**D1 — Full trio, always on, Budget page only.** Progress bar under the name, status copy in the name column, colored Available pill with an icon. Regular spending, Bills, and Savings. Income unchanged. No setting. Dashboard and Register unchanged.

**D2 — Rename Balance → Available in the Budget UI.** Column header, compact chip, captions that still say "balance." The figure is still Actual leftover. Keep the column `id` as `balance` so persisted grid widths/order do not reset; only the label changes.

**D3 — One pure function, same ask as Assign.** `src/lib/finances/budget/indicator.ts` takes the same `AssignEnvelope` + `bills` map + month that `neededAssigned` already uses. `moreNeededCents === max(0, neededAssigned − assignedCents)`. If those disagree, the indicator is wrong.

**D4 — State machine (priority order).** First match wins:

| State         | When                                                                                                   | Pill                    | Icon  | Copy                                                                            | Bar                                        |
| ------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- | ----- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Overspent     | `available < 0`                                                                                        | red                     | none  | none (the number is the message)                                                | full red                                   |
| Underfunded   | `moreNeeded > 0`                                                                                       | yellow (`--goal-unmet`) | clock | `$X more needed this month` **or** `$X more needed by {horizon}`                | yellow fill = funded / target              |
| Fully spent   | ask met or no ask, `available === 0`, spent > 0                                                        | gray                    | check | `Fully Spent`                                                                   | full, striped/dashed spent                 |
| On Track      | ask met, **sinking horizon** still in the future, envelope does not yet hold the full remaining target | green                   | pie   | `On Track`                                                                      | green fill = envelope / total target       |
| Funded        | ask met, this-month horizon (or sinking already holds the full target)                                 | green                   | check | `Funded` if spent is 0; `Funded. Spent $X of $Y` if spent > 0 and available > 0 | full green; spent portion lighter          |
| Safe leftover | no ask, `available > 0`                                                                                | green                   | check | none                                                                            | full green; spent portion lighter if any   |
| Zero idle     | no ask, `available === 0`, spent === 0                                                                 | gray                    | none  | none                                                                            | **no bar** (Pluralsight in the screenshot) |

Paused / cancelled bills are treated as **no ask** (same as Assign skipping them). Remainder templates are not an ask (`hasDemandAsk` already excludes them). Hidden envelopes stay off the grid.

**D5 — Horizon (what "On Track" means).** No weekly target type.

- **This-month:** `simple` templates; monthly (`n = 1`) bills due in the viewed month; day-cadence bills that sum occurrences in the viewed month. Binary: Funded vs `$X more needed this month`.
- **Sinking:** a `by` template with `monthsUntilBy > 0`, or a yearly/quarterly (`n > 1` month) bill with `monthsUntilDate > 0`. If this month's installment is assigned (`moreNeeded === 0`) but the envelope still has future months to fund, **On Track**. If carry-in already covers the full `by` amount / next charge, **Funded**. If behind this month's installment, `$X more needed by {monthLabel(target)}` or `{formatted nextDueKey}`.

**D6 — Bar math.** `spent = max(0, −activity)`. `funded = carryIn + assigned` (= spent + available when available ≥ 0).

- This-month target = `carryIn + neededAssigned`. Fill = `funded / target` capped at 1.
- Sinking target = `by.amountCents` or bill `expectedCents`. Fill = `funded / target` capped at 1.
- Spent overlay = `spent / max(funded, 1)` of the filled width (lighter or striped). Overspent bars skip the overlay and stay solid red.
- No weekly segments.

**D7 — Assigned cell becomes a plain number.** Remove `goalTone` / `GOAL_CLASS` rings. Inline edit is unchanged.

**D8 — Out of scope.** Snooze, weekly targets, credit-card payment icons, YNAB inspector pane, optional progress-bar setting, Dashboard, Register, schema changes, deleting `goalCents`.

## Visual reference

Screenshot of YNAB web category rows (progress bars, status copy, Available pills) supplied with the request. Copy into `visuals/ynab-category-rows.jpg` when saving the spec. Do not re-scrape YNAB.

Tokens already in `globals.css`: `--chart-income` (green), `--goal-unmet` (amber underfunded — already documented as _not_ overspend), `--chart-spend` (red). Gray uses existing faint/raised surface.

Named divergence from Actual: their envelope rows color leftover by sign and put goal status in a tooltip. Progress bars + Available pills are YNAB. Record in `docs/actual-budget/README.md`.

## Acceptance criteria

- [x] Regular spending, Bills, and Savings rows on `/finances/budget` show the trio (bar + copy + Available pill) per D4–D6.
- [x] An envelope with positive Available and an unmet ask is **yellow**, not green. `moreNeeded` equals Assign → Underfunded's remaining gap for that row.
- [x] A `by` / sinking bill on pace is green pie + "On Track"; a monthly simple / due-this-month bill is never On Track.
- [x] Fully spent (ask met, Available $0, spent > 0) is gray check + "Fully Spent" + striped bar.
- [x] No-ask zero idle has no bar and a gray $0.00.
- [x] Overspent is red Available, and that wins over underfunded/fully-spent copy.
- [x] Income section unchanged. Assigned cells have no goal rings.
- [x] Column header reads **Available**. Persisted column layout still keys off `id: "balance"`.
- [x] Compact/phone: name cell still carries bar + copy; Available amount remains a meta chip; long-press still opens the cover/move menu.
- [x] Paused/cancelled bills do not show "more needed."
- [x] Pure tests cover the state machine (including leftover-counts-toward-target, month-ahead monthly bill due next month asks 0, remainder is not an ask, overspent wins). No component tests.
- [x] `npm run test:unit` (targeted + typecheck/lint), `npm run smoke` against a running dev server after the Budget UI change.

## Changes from original plan

| #   | Change                                                                                            | Why                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The progress bar overlays the bottom of the existing 28px DataGrid row instead of growing the row | `--row-height` is fixed (`1.75rem`); a two-line name cell would clip. On compact/phone the bar stays in-flow under the name.                               |
| 2   | A monthly bill due next month is idle/safe, not Funded                                            | `neededAssigned` is $0 for both "not due this month" and "already covered"; horizonOf distinguishes them so August does not say Funded for September rent. |

## Follow-ups (new work — not amendments to this frozen spec)

- Guided cancel/skip from a red / underfunded envelope (roadmap Next).
- Weekly target type (out of scope; On Track is `by` + sinking bills only).

## Standards (references, not copies)

- `@agent-os/standards/components/ux-principles.md` — scan at a glance; inline edit stays on Assigned; no extra modal.
- `@agent-os/standards/components/data-grid.md` — taller name cell is column `render`, not a new grid. Group headers do not get bars. Hierarchy/sort/filter untouched.
- `@agent-os/standards/components/responsive.md` — compact primary cell + meta chip; 44px tap on the Available pill; long-press menu still the phone path to cover/move.
- `@agent-os/standards/development/testing.md` — logic in `src/lib/**` with `indicator.test.ts`; no React tests.
- `@agent-os/standards/development/clean-code.md` — lib never imports app; one function owns the state so columns cannot drift.
- `@agent-os/standards/development/dates.md` — month keys and `nextDueKey`; `today` / viewed month are parameters, never the server clock.

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` with `plan.md`, `shape.md`, `standards.md` (file references + why), `references.md`, and `visuals/ynab-category-rows.jpg` (the attached screenshot). Status: **active**.

## Task 2: Pure indicator module

Add `src/lib/finances/budget/indicator.ts` + `indicator.test.ts`.

- Reuse `neededAssigned`, `hasDemandAsk`, `bys`, `billFundingDemand` / `monthsUntilBy` — do not fork demand math.
- Return `{ state, moreNeededCents, copy, pill, icon, bar: { fill01, spent01, striped } | null }` (names can be tighter in code; the facts cannot).
- BudgetView (or a tiny `fromBudget` helper) builds a `Map<id, Indicator>` from the same `assignEnvelopeFromRow` + bills map Assign already builds, and passes it in `BudgetColumnCtx`. Carry-in comes from `templateCarryIn(prior)` as today.

## Task 3: Budget grid chrome

- `budgetColumns.tsx`: name cell gets right-aligned copy + a thin bar under the name (no bar when `bar === null`). Available cell is a pill (`rounded-full`) using the indicator's tone/icon; it still opens the cover/move menu. Drop Assigned `GOAL_CLASS`. Label the column **Available**.
- `BudgetView.tsx`: captions that say "balance"; section headers can keep "left" (that is the English of leftover, not the column name).
- Small presentational bits stay in `src/components/finances/budget/` (pill, bar, clock/check/pie SVGs). No DataGrid API change.
- Compact: rely on name `render` for bar + copy; Available `compactText` stays the formatted amount.

## Task 4: Divergence note + cleanup

- `docs/actual-budget/README.md`: named divergence — YNAB scan layer on Available; math still Actual.
- Remove now-dead `goalTone` if nothing else calls it.

## Task 5: Verify, freeze spec, update roadmap

- Drive `/finances/budget` in the browser (desktop + a narrow viewport): leftover-underfunded stays yellow; sinking On Track; fully spent; overspent; idle $0; Assign → Underfunded still matches yellow rows; phone long-press menu still works.
- Gate: unit tests, lint, typecheck, `npm run smoke`.
- Freeze the spec. Roadmap: this is the scan layer under the envelope-budget item, not the cancel/skip follow-up.

> While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
