# Weekly envelope targets

**Status: frozen / complete — 2026-08-27**  
Spec folder: `agent-os/specs/2026-08-27-1949-weekly-envelope-targets/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-2242-budget-goal-templates/` — the `templates` JSONB
  store, the parse/validate boundary, the apply engine and the drawer. This spec adds a fourth
  template type to that machinery; D1 (stored shapes, integer cents) and D2 (apply/overwrite)
  carry forward unchanged.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — D3's `demandOf` stays
  the single definition of "what this envelope asks for this month", shared by the grid, the
  Underfunded preview and the drawer preview. A weekly line is one more summand inside it.
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` — D3–D6's rule that
  the indicator must not invent a second demand. A weekly envelope gets the `this-month`
  horizon.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` D4 — a bill funds itself from its
  own cadence and holds no template. Unchanged: a weekly line is for _ordinary spending on a
  fixed weekday_, not a bill. Groceries is not a commitment with a due date.
- **Supersedes:** nothing. The `simple` refill case keeps working exactly as it does today; it
  is only renamed in the drawer and withheld from weekly lines.

## Context

Regular spending that lands on a fixed weekday — Friday pizza, Sunday groceries — cannot be
stated correctly with any target the budget has today.

- A **monthly amount** (`simple` with `monthlyCents`) is wrong because months do not hold the
  same number of Fridays. August 2026 has 5 Sundays; September 2026 has 4. A 12-month average
  smears 4- and 5-occurrence months together, which makes it a decent way to pick _dollars per
  trip_ and a bad answer for _this month's total_.
- A **refill** (`simple` with a `limit` and no `monthlyCents`) is wrong for a different reason:
  it reads a light week as evidence that next week needs less. Spending $30 on pizza instead of
  $45 does not mean next Friday is cheaper. The leftover is spare cash to move somewhere else,
  not a reduced ask.

The fix is **calendar-aware, not history-aware**: the calendar says how many occurrences fall
in this month; history only helps pick the dollars per occurrence.

A second, smaller problem gets fixed alongside it. The drawer's vocabulary is what made refill
look like the obvious choice for pizza in the first place. "Refill up to" and "set aside
another" name two genuinely different jobs — _hold a balance_ versus _add a contribution_ —
and the current copy does not say which is which.

## Decisions

### D1 — New template type `weekly`

Stored in the existing `templates` JSONB, so there is **no migration**:

```ts
{
  id, directive: "template", type: "weekly", priority: 0,
  amountCents: 18000,
  weekday: 0            // 0 = Sunday … 6 = Saturday, matching weekdayOfDateKey
}
```

Demand for a budget month is `amountCents × (count of that weekday in the month)`. The count
is closed-form arithmetic over the month key — the weekday of the 1st plus the length of the
month — not a walk and not a `Date` loop.

`weekday` uses the same 0-is-Sunday convention as `weekdayOfDateKey` in
`src/lib/schedule/geometry.ts`, because a second convention in the same codebase is a bug
waiting for the first agent who mixes them up.

### D2 — Whole month, always

The count is **every** matching weekday in the month, not only those still ahead of today.
Underfunded already computes `gap = max(0, demand − assigned this month)` (`gapOf` in
`assign/plan.ts`), so a mid-month run tops the envelope up to the month total, and the figure
does not move under the user as the month passes. Assigned therefore reads as "this month's
plan" rather than "what is left of it".

This is also what Actual's `periodic` template does
(`runPeriodic` in `packages/loot-core/src/server/budget/category-template-context.ts`).

The rejected alternative — counting only remaining occurrences — buys a slightly tidier first
month and pays for it with a demand that changes every week for reasons the grid cannot show.

### D3 — Carry-in never reduces a weekly ask

`demandOf` is handed `carryInCents`; `runWeekly` ignores it. Skipping pizza one week does not
make next week's pizza cheaper — it means this month's pizza envelope has spare cash, and
moving that spare somewhere that ran short is the _feature_. Quietly lowering next month's ask
hides the spare and pretends demand fell.

This is the single load-bearing claim of the spec and the thing a later refactor is most
likely to undo by accident, so it gets a test named for it rather than an incidental
assertion.

### D4 — No cadence knobs, no refill on a weekly line

A weekly line has exactly two fields: **weekday** and **amount**. No "every N weeks", no start
date, no `up to` clamp of its own.

Nothing in this budget needs money every other Tuesday, and an unused cadence option becomes
the next refill-vs-set-aside puzzle — a control whose only effect is to make the user wonder
which setting they were supposed to pick. Every-N-weeks gets added when a real category needs
it, and the stored shape can grow a field then.

**Deliberate divergence from Actual**, recorded here rather than in
`docs/actual-budget/README.md`: Actual's `periodic` carries `period: {unit, amount}`, a
`starting` date, and an optional `limit`. We keep only the weekday.

A `limit` on a sibling `simple` line still clamps the envelope's total, because `applyLimit`
runs once over the summed demand. That is Actual-consistent and is not a way to sneak refill
back onto the weekly line.

### D5 — Suggest the amount from history; never impose it

Under the amount field, show

```
total spend in this envelope over the window ÷ count of that weekday across the same window
```

with copy stating that it includes **all** spending in the category, not only the anchor-day
trips. The mid-week milk run and the dessert bought on the way to someone's house are already
inside the number; setting the per-Sunday amount from Sunday-only transactions would
systematically underfund the envelope.

Computed client-side from `assignInputs.history`, which the Budget page already loads (12
months before `startMonth`, plus every folded month) — no new query.

Window rules: complete months only; start at the envelope's first month with nonzero activity;
cap at 12 months; fewer than 3 qualifying months means no suggestion is shown at all rather
than a confident number drawn from one month.

### D6 — Rename the two jobs in the drawer

The words "refill" and "set aside" do not appear in the UI again. What the drawer says instead:

| Job                   | Wording                   | Meaning                                                              |
| --------------------- | ------------------------- | -------------------------------------------------------------------- |
| Contribution          | **Add every month**       | This month costs $X. Leftovers stay put until you move them.         |
| Contribution (weekly) | **Amount each _weekday_** | This month is N × $X. Leftovers stay put until you move them.        |
| Balance               | **Keep available**        | Keep about $X sitting there; what is already there counts toward it. |

Refill is **not** removed from the app. It stays on the `simple` line, where holding a balance
is the right model — a working buffer, car repair, unexpected medical. It is simply not
offered where it is the wrong model. The rule the copy has to convey: a contribution's
leftovers are yours to move; a balance target's leftovers reduce the ask, which is only ever
what you want for a pile that is supposed to sit at a size.

## Acceptance criteria

All verified: unit and integration suites green, `npm run smoke` across all 61 routes, and the
weekly editor exercised on `/finances/budget` (Pizza: 4 Fridays × $45.00 = $180.00 alongside a
$139.45 monthly line, total $319.45; Discretionary: "History suggests $537.64 — all spending in
this envelope, not only the Sunday trips, divided by its Sundays. August 2026 has 5.").

- [x] A Groceries envelope with one weekly line (Sunday, $180) asks **$900** in a 5-Sunday
      month and **$720** in a 4-Sunday month — the same figure on the grid, in the Underfunded
      preview, and in the drawer preview, because all three run `demandOf`.
- [x] Assigning $360 and re-running Underfunded on the 20th asks for the remaining $540, not a
      reduced amount.
- [x] $500 of carry-in from last month does not reduce the ask (D3).
- [x] A weekly line has no `up to` field, and the drawer never uses the words "refill" or
      "set aside" (D4, D6).
- [x] The amount field suggests a per-occurrence figure from history with the
      "includes all spending in this category" note, and it can be overwritten.
- [x] The funding indicator gives a weekly envelope the `this-month` horizon.
- [x] A weekly line round-trips through save and load; `parseTemplates` rejects a weekday of
      7, −1 or 1.5, and a non-integer `amountCents`.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                        | Why                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The drawer's **add buttons** got their own labels (`ADD_LABELS`) rather than reusing `TYPE_LABELS`.                           | D6's job names are nouns; `Add ${label.toLowerCase()}` rendered "Add add every month" in the browser. The eyebrow keeps the noun, the button reads as a verb.                                  |
| 2   | The line **eyebrow names the concrete weekday** ("Amount each Sunday"), not the generic `TYPE_LABELS.weekly`.                 | Once a weekday is chosen, "amount each weekday" is a worse label than the day itself. `TYPE_LABELS.weekly` survives only for the type list.                                                    |
| 3   | The suggestion excludes the **month containing today** rather than "complete months" defined against the viewed budget month. | The viewed month can be in the past or the future; a partial current month reads as a light month either way and would drag the figure down. `currentMonth` is `monthKeyOf(todayKey)`.         |
| 4   | `parseWeekly` also rejects a **non-positive** `amountCents`, beyond the integer check the plan named.                         | A zero or negative per-occurrence amount has no meaning, and the drawer already refuses one — letting stored JSONB carry what the editor cannot produce is a gap the apply math would inherit. |

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-27-1949-weekly-envelope-targets/` with `plan.md`, `shape.md`,
`standards.md`, `references.md`. No `visuals/` — nothing visual was provided.

## Task 2: `weekly.ts` and its tests

New `src/lib/finances/budget/templates/weekly.ts`:

- `countWeekdayInMonth(month: MonthKey, weekday: number): number` — closed form from the
  weekday of the 1st (`weekdayOfDateKey`, which reads the UTC-noon encoding) and the month
  length (`monthEndKey` in `../envelope`). No loop, no process-local `Date`.
- `runWeekly(template: WeeklyTemplate, month: MonthKey): number`.

`weekly.test.ts` cases chosen to fail on a plausible mistake — an off-by-one in the first
occurrence, or `daysInMonth` read from the wrong month:

- August 2026 → 5 Sundays; September 2026 → 4.
- A month whose 1st **is** the anchor weekday.
- A month whose last day is the anchor weekday.
- February 2027 (28 days) and February 2028 (leap).
- Every weekday 0–6 in one month sums to the month's length.

## Task 3: Wire into the template model

- `templates/types.ts` — `WeeklyTemplate`, added to `TEMPLATE_TYPES` in the order
  `simple, weekly, by, remainder`, to the `Template` union, to `parseOne` via `parseWeekly`
  (integer cents > 0, integer weekday 0–6), and a `summarize` arm ("$180 each Sunday").
- `templates/demand.ts` — `weeklies()` beside `simples`/`bys`; include in `hasDemandAsk` and
  in `demandOf`'s sum. `applyLimit` keeps reading `limitOf(simples(...))`.
- `templates/draft.ts` — `WeeklyDraft { id, type: "weekly", weekday: number, amount: string }`,
  a `newDraft` default of Sunday, `draftsFromTemplates`, and `convert` with its own validation
  message.
- Extend `types.test.ts`, `demand.test.ts`, `draft.test.ts`. Include the **D3 carry-in test**
  by name, and a weekly + simple envelope that sums both.

`templates/apply.ts` should need no change — `selected()` is already type-agnostic. Confirm
rather than assume.

## Task 4: Assign and indicator

- `assign/plan.test.ts` — 5-Sunday vs 4-Sunday ask; mid-month top-up; carry-in does not
  reduce; a weekly envelope sorts into `compareUnderfunded` bucket 3 alongside simple (which
  should already follow from `hasDemandAsk`, so this is a guard, not an edit).
- `indicator.ts` — `horizonOf` returns `this-month` when a weekly line is present, beside the
  existing `simples(...)` check; `indicator.test.ts` covers it.

## Task 5: The history suggestion

New `src/lib/finances/budget/templates/suggest.ts` over `AssignHistoryMonth[]`, plus tests:

- Window selection: skips leading zero-activity months, caps at 12, returns nothing under 3.
- Total spend is `sum(max(0, −activity))` — activity is negative for spending.
- Divides by the summed weekday occurrences across the same months, rounds to whole cents.
- An envelope with no history yields no suggestion, not `$0`.

## Task 6: Drawer

- `TemplateDrawer.tsx` — the weekly editor row (weekday select + amount), the suggestion hint
  with its "includes all spending in this category" note, and a live computed line
  ("August: 5 Sundays × $180 = $900"). Plus the D6 copy rewrite of `TYPE_LABELS`, `TYPE_HELP`
  and the simple line's field labels.
- `BudgetView.tsx` (~line 1069) — pass `history={assignInputs.history}` into the drawer.
- `src/lib/dateFormat.ts` — export the existing private `WEEKDAY_LONG` (or a
  `weekdayLongLabel(n)` accessor) instead of writing the seven names a second time.

## Task 7: Integration

Add a weekly-line round-trip to `saveEnvelopeTemplates` in
`src/lib/finances/budget/mutations.integration.test.ts`, including a second user attempting to
read, change and delete the first user's envelope templates and failing at each.

## Task 8: Verify, freeze spec, update roadmap

- `npm run test:unit` (check for the Postgres-skipped warning), `npm run test:integration`,
  `npm run lint`, `npx tsc --noEmit`, then `npm run dev` + `npm run smoke`.
- Walk the acceptance criteria in the browser on `/finances/budget`.
- Update `plan.md` / `shape.md` for any material as-built drift and complete **Changes from
  original plan**.
- Mark both **Status: frozen / complete** with the date; list leftovers as new work.
- Update `agent-os/product/roadmap.md` if this closes a listed item.

---

**While this spec is active:** a material change to requirements, design, or scope — including
feedback on what was actually built — goes into this file and `shape.md`, plus a row in
**Changes from original plan**. Skip pure implementation details. Freeze when verified.
