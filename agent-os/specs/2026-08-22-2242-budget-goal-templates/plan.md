# Budget goal templates

**Status: frozen / complete**  
Spec folder: `agent-os/specs/2026-08-22-2242-budget-goal-templates/`

The next Actual Budget slice: make `/finances/budget` fill itself from templates, including `#template schedule` against the schedules that just shipped. Structured UI, four types, explicit Apply/Overwrite, and one action that stacks existing schedules onto Bills.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — envelope math, `/finances/budget`, D7 (every affordance is an allocation edit). This is the follow-up that spec named as strongest.
- **Extends:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — `finance_schedules` is what a schedule template reads. That spec was taken first specifically to unblock this.
- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — still fully parallel. The bills table is not a template source and is not merged.
- **Supersedes:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — the schema comment on `finance_budget_categories.notes` that templates would later be written there. Actual split free-text notes from `goal_def` JSON; we do the same. Notes stay free text.

## Context

The envelope budget is entirely manual. That is the thing the user wants to leave behind: _"maybe after improving my situation and keeping it that way for some time, we could start to put things more on autopilot."_ Actual's template system is the mechanism.

Schedules exist now (1Password, Rent, Taylor Gas, Geico imported from bills). Actual's most useful template, `#template schedule <name>`, can exist. Stacking those onto the Minimal preset's **Bills** envelope is also the join that would later decide whether bills and envelopes merge — without merging them in this spec.

Dashboard, Available to Spend, and Commitments do not move.

## Decisions

### D1 — Four types, Actual's semantics, our cents, structured UI

In: **simple**, **schedule**, **by**, **remainder**. Stored as JSONB `templates` on `finance_budget_categories` (array, default `[]`). Validated on write so bad JSONB never reaches the math.

Amounts are **integer cents**, asserted — house rule, named divergence from Actual's dollar floats in `goal_def`. Shape otherwise follows `../actual/packages/loot-core/src/types/models/templates.ts` for these four types.

No PEG parser, no `#template` notes language, no `template_settings.source: 'notes'`. Notes stay free text.

Each line has a stable `id` (uuid) so the editor can delete/reorder without relying on array index.

`priority` is stored, default `0`, **not shown this slice**. Remainder always has `priority: null` and always runs last (Actual).

**Simple.** Optional `monthlyCents`. Optional monthly `up to` limit `{ amountCents, hold }`. Monthly omitted + limit set is the refill case (`limit − fromLastMonth`). Daily/weekly limits are out.

**Schedule.** `scheduleId` required (not name — renames must not break). Optional `full`. Adjustment (`increase 20%`) is out. Amount comes from `getScheduledAmount` + the recurrence engine already in `src/lib/finances/schedules/`.

**By.** `amountCents` by `YYYY-MM`. Optional `repeat` in months, or `annual` (repeat is then years). Spend-from is out (that is Actual's separate `spend` type).

**Remainder.** `weight` (default 1). Remainder limits are out.

Income envelopes cannot hold templates and are skipped on apply.

### D2 — Apply and Overwrite are clicks; nothing writes unattended

Same posture as schedules' **Post now**.

- **Apply templates** — run on envelopes that have templates and currently have `assignedCents === 0`.
- **Overwrite with templates** — run on every templated envelope, replacing Assigned.
- **Overwrite this envelope** — row menu, that envelope only.

Demand templates (simple / schedule / by) write through `setAssignment`, which is allowed to drive Ready to Assign negative. That shortfall is the diagnostic, not a clamp to hide. Remainder only consumes leftover RTA `> 0`, last, split by weight, last line absorbing rounding.

Each apply appends one month-note line (`Applied templates: Bills $X, …`) and writes `goalCents` on the touched allocations — the amount the templates requested this month — so the indicator survives a later manual edit of Assigned. Manual assign, copy-last-month, and zero do not write or copy `goalCents`.

### D3 — Add from schedules… is the join

A picker of **active** schedules not already attached to any envelope writes one schedule-template each onto a chosen envelope. Default target: a spending envelope named `Bills` (case-insensitive), else the first spending envelope. Re-runnable: already-attached `scheduleId`s are skipped. Does **not** Apply — it only writes templates.

One schedule must not fund two envelopes.

### D4 — The apply engine is pure, with named traps

`src/lib/finances/budget/templates/` — no DB, no React, integer cents, MIT attribution header naming Actual's `goal-template.ts`, `category-template-context.ts`, `schedule-template.ts`.

`fromLastMonth` is the envelope's carry-in balance. A negative carry-in without that category's prior-month `carryover` is treated as **0** (Actual). `today` / `month` are parameters, never the server clock (`dates.md` rule 8).

Schedule contribution is rewritten in `YYYY-MM-DD` math on top of `recur.ts` / `nextDate.ts`. Do not port Actual's `monthUtils`. Sign: `getScheduledAmount` is negative for a bill; Assigned is a positive fill — take the absolute value.

### D5 — Attribution

MIT header on every module that reproduces Actual's template math. `docs/actual-budget/README.md` gains a row for goal templates.

## Acceptance criteria

- [x] An envelope can hold several templates; Bills can stack every imported schedule.
- [x] **Add from schedules…** attaches each not-yet-attached active schedule to Bills in one gesture; re-running creates nothing new.
- [x] **Apply templates** fills only empty Assigned cells; **Overwrite** replaces templated cells; neither runs unattended.
- [x] A monthly schedule due this month assigns that month's amount; a yearly schedule due in N months assigns roughly remaining / (N + 1), reduced by what the envelope already holds.
- [x] `#template 50`-equivalent assigns $50; `up to $150` refills to $150 given carry-in; remainder on Savings takes leftover Ready to Assign and nothing more.
- [x] `10000 by 2026-12` divides the remaining need by remaining months; extra already in the envelope reduces the ask.
- [x] Apply may drive Ready to Assign negative. Remainder never does.
- [x] After apply, the Assigned cell shows goal-met / goal-not-met; a later manual edit of Assigned does not erase the goal figure.
- [x] Dashboard, Available to Spend, and Commitments are numerically unchanged.
- [x] A second user cannot read, change, or delete the first user's templates or applied goals — proven in `*.integration.test.ts`.
- [x] `npm run smoke` still loads every route.

**Verified on the real file** (August 2026, dev database): Add from schedules… attached all
five active schedules to Bills; Apply asked for **$2,734.96** — Rent $2,100 and Netflix
$15.99 paid in full because they are due this month, 1Password $71.88 and Taylor Gas $493
in full because their yearly occurrence is *also* this month, and Geico **$54.09** sunk over
the eleven months to June 2027 rather than dumped. Ready to Assign went $888.12 → **−$1,846.84**:
the shortfall stated, not clamped. Editing Bills down to $1,000 turned the cell amber with
`Goal $2,734.96 · assigned $1,000.00`; Overwrite put it back. Paged to September, where
$2,729.97 of carry-in reduced the ask to **$54.59**. Dashboard's Available to spend
(−$1,953.85) and Cash position ($1,219.28) were byte-identical before and after.

## Out of scope

- PEG parser / `#template` in notes.
- percentage, periodic, average, copy, spend, refill-as-own-type, `#goal` directive, cleanup templates, daily/weekly limits, schedule adjustments.
- Priority UI (the field is stored).
- Auto-apply on month open or any background job.
- Creating / reordering envelopes, editing `sourceCategories`, showing the movement log (budget-spec follow-ups, not this).
- Calendar badge on a due envelope.
- Merging with Commitments or Available to Spend.
- Rules / payees / reports.

## Changes from original plan

| #   | Change                                                                                                                                  | Why                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Added `templates/draft.ts` (+ tests): the editable string form of a template line and the round trip to `Template`.                     | Task 6 assumed the drawer would hold its own form state, but a money field is empty mid-typing and `Template` has no shape for "not a number yet". The conversion and its validation messages are reasoning, not chrome, so `testing.md` puts them in `src/lib`. |
| 2   | Added `templates/snapshot.ts`: one `ScheduleRecord → ScheduleSnapshot` reduction, shared by `applyBudgetTemplates` and the budget page. | Task 5 built it inside `mutations.ts`; Task 6's preview needed the same three parsed fields in the browser. A second copy is a second thing to get wrong about a schedule's amount sign.                                                                         |
| 3   | Wired `DataGrid`'s `rowMenu` on the Budget grid, alongside the existing Balance-cell button.                                            | The row menu was reachable only from the Balance cell, which the phone's compact row does not draw. **Edit templates…** would have been desktop-only. Right-click now opens it too.                                                                              |
| 4   | New `--goal-unmet` colour token rather than reusing `--chart-spend` or a priority hue.                                                  | Red in this app means overspent. An envelope short of its goal has not spent anything, and painting it red would give one colour two jobs — the exact thing the palette comments forbid.                                                                         |
| 5   | The drawer's preview _is_ `applyTemplates` over that one envelope with `force`, not a separate dry-run path.                            | It is the same call **Overwrite this envelope** makes, so the preview cannot drift from the button beside it. A separate estimate would disagree eventually, and silently.                                                                                       |
| 6   | The editor rejects a second remainder line on one envelope.                                                                             | Two remainder lines on one envelope are just one with a higher weight, and the sum reads as a bug when the split is computed. Actual has no need for the second line either.                                                                                     |
| 7   | Apply / Overwrite report `n envelopes filled` plus any per-envelope errors in a dismissible status line on the budget page.             | D2 requires schedule errors to surface. The money a broken line would have assigned is missing from the total and nothing else on screen says why.                                                                                                               |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-22-2242-budget-goal-templates/` with:

- **plan.md** — this plan (**Status: active**), including the empty Changes table
- **shape.md** — scope, decisions D1–D5, product alignment, visuals: none
- **standards.md** — full text of the eleven confirmed standards (house pattern of the last two Actual specs)
- **references.md** — governing specs, Actual files, in-repo budget + schedules modules
- **visuals/** — empty (Actual's Budget + `packages/docs/docs/experimental/goal-templates.md` are the reference)

Standards to copy in full:

- `development/clean-code`, `testing`, `security`, `dates`, `commits`
- `database/migrations`
- `components/data-grid`, `drawer-pattern`, `ux-principles`, `navigation`, `responsive`

## Task 2: Template types and the apply engine

New `src/lib/finances/budget/templates/`:

- `types.ts` — the four types, a **validating** parse (`parseTemplates(unknown): Template[]`; bad input is `[]` or a thrown error on write, never silent garbage), `summarize(template)` for the editor list.
- `simple.ts` + `simple.test.ts`
- `by.ts` + `by.test.ts`
- `remainder.ts` + `remainder.test.ts`
- `apply.ts` + `apply.test.ts` — given categories, this month's Assigned, carry-in balances, ready-to-assign, schedule snapshots, and `{ force, categoryIds? }`, return `{ allocations, goals, errors, note }` ready for the mutation layer to upsert. Remainder after demand. Income skipped.

**Named tests for the traps.** Each must be able to fail on a plausible mistake:

1. Simple with `monthlyCents` assigns that amount even when carry-in is already higher (it is not a refill).
2. Simple with only a limit is a refill: `limit − fromLastMonth`; negative carry-in without carryover counts as 0.
3. Simple `up to` with `hold: false` will not assign past the limit; `hold: true` will not **remove** funds already over it.
4. By: remaining need / remaining months, reduced by carry-in. A $10,000 target in 12 months with $1,500 already in is not $10,000/12.
5. By repeat: a target month in the past walks forward by the period until it is in range; a one-shot by in the past requests 0, not a negative assign.
6. Two `by` templates on one envelope use the **shortest** window (Actual).
7. Remainder always last; leftover RTA ≤ 0 → remainder gets 0; two remainder envelopes split by weight; last absorbs the rounding cent.
8. Apply (`force: false`) leaves a non-zero Assigned cell untouched; Overwrite replaces it.
9. Integer-cents assertion: a non-integer throws.

`apply.ts` calls `setAssignment`-shaped absolute amounts (not `assignFromReadyToAssign`, whose clamp to RTA would hide the shortfall D2 wants visible).

## Task 3: Schedule contribution math

`schedule.ts` + `schedule.test.ts`. Pure. Inputs: the schedule's amount (cents, signed), `RecurConfig`, `nextDate`, `full`, the month key, carry-in.

Port the **semantics** of `../actual/packages/loot-core/src/server/budget/schedule-template.ts`, rewritten over our date keys:

- **Pay-this-month:** `full`, or monthly interval 1 due this month, or weekly interval ≤ 4, or daily interval ≤ 31 → assign this month's occurrence(s) in full. Weekly/daily **sum** every occurrence whose date key falls in the month.
- **Sinking:** otherwise remaining / (`monthsUntilDue` + 1), reduced by carry-in (Actual's `getSinkingContributionBreakdown`).
- **Already funded:** if carry-in already covers upcoming sinking + pay-this-month totals, contribute only the base monthly rate, not another full sink.
- **Sign:** bill amounts are negative in `getScheduledAmount`; Assigned is a positive fill.
- **Completed / missing schedule:** that line contributes 0 and produces a per-envelope error; other envelopes still apply.
- **Day-31 in a 30-day month** is already skip-not-clamp in `recur.ts`; a test here must not re-clamp.

Use `occurrences` / `nextDate` from `src/lib/finances/schedules/`. Do not introduce `Date` for calendar arithmetic.

## Task 4: Schema and persistence

In `src/db/schema.ts`:

- `finance_budget_categories.templates` — `jsonb().$type<unknown>().notNull().default([])`. Doc comment: Actual's `goal_def`, cents not dollars, `notes` is still free text, this supersedes the previous comment that templates would live there. Update that notes comment.
- `finance_budget_allocations.goalCents` — nullable integer. Null means no goal this month. Doc comment: written only by Apply/Overwrite; the indicator compares Assigned to this, not to a live recompute, so a later manual edit still shows whether the template was met.

Generate the migration with drizzle-kit; never hand-write (`database/migrations`). Commit `.sql` + snapshot + journal together.

`queries.ts`: load `templates` on categories and `goalCents` on the month cell. `BudgetRow` gains `templates` / `goalCents` so the grid can show the indicator without a second read.

## Task 5: Mutations — save, apply, add from schedules

In `src/lib/finances/budget/` (keep the existing `userId`-first, ownership-proved style):

- `saveEnvelopeTemplates(userId, categoryId, templates)` — validate, prove the category is theirs and not income, prove every `scheduleId` is theirs.
- `applyTemplates(userId, month, { force, categoryIds? })` — load budget + schedules, run the pure engine, apply writes via the existing allocation upsert + month-note append, set `goalCents`. Thin.
- `addTemplatesFromSchedules(userId, { categoryId, scheduleIds? })` — D3. Pure helper `schedulesToAdd(existing, candidates, targetId)` lives next to the engine and is unit-tested: skip completed, skip already attached anywhere, default target Bills.

Thin `"use server"` wrappers in `src/app/finances/actions.ts` returning `ActionResult` / `DataActionResult<T>`.

Extend `mutations.integration.test.ts`: second user fails to read/change/delete templates and cannot apply onto the first user's month. Apply on the real fixture writes the expected allocations and a note.

## Task 6: Editor, commands, indicator, Add from schedules

**Drawer** (`components/drawer-pattern`): envelope template editor — list of lines with type, one-line summary, this-month preview (dry run with `skipAvailableClamp` equivalent so a future month still shows demand). Add simple / schedule (picker of this user's active schedules) / by / remainder. Per-type fields. Delete. Save.

**Month bar + menus** (`components/navigation`): **Apply templates**, **Overwrite with templates**, **Add from schedules…**. A command without a menu entry is not shipped. Row menu: **Edit templates…**, **Overwrite this envelope** (disabled with a reason when the row is income or has no templates).

**Add from schedules…** is a `ModalShell` picker (confirm/capture — `ux-principles`): checkboxes, default all not-yet-attached, target envelope select defaulting to Bills.

**Goal indicator** on the Assigned cell: default / met (green) / not met (orange). Existing negative-balance red on Balance is unchanged. `title` tooltip: `Goal $X · assigned $Y`. No goal → no color change.

Below `md`: the drawer is already the full-screen sheet; Apply/Overwrite stay on the month bar and in the phone `⋯` via the registry (`components/responsive`).

## Task 7: Verify, freeze spec, update roadmap

- `npm run lint`, `npm run typecheck`, `npm run test:unit` — **check for the Postgres-skip warning**; this slice adds integration tests that are worthless if they silently skip.
- `next build`, then **start the dev server and run `npm run smoke`**.
- Drive it in a browser on the real file: Add from schedules onto Bills, set a remainder on Savings, Apply, confirm Ready to Assign moves by the sum, page to next month and Overwrite, confirm a yearly schedule sinks rather than dumping, confirm Dashboard / Available to Spend / Commitments are unchanged.
- Walk the same on the phone viewport.
- Update `plan.md` / `shape.md` for as-built drift, complete **Changes from original plan**, mark both **Status: frozen / complete**, update `agent-os/product/roadmap.md` § Financial planning (Goal templates shipped; bills/envelopes still parallel; the join is now exercisable).

---

> While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
