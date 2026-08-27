# References for Arithmetic expressions in currency inputs

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/` (frozen)

- **Relationship:** Extends.
- **Relevant decisions:** D7 — every affordance is a clamped arithmetic edit of one
  allocation number `(month, category, amount)`. Unchanged: this spec only changes how the
  typed string becomes that number. Its `references.md:96` names the money layer the budget
  UI is supposed to use — `parseAmountCents`, `centsToNumericString`, `numericStringToCents`,
  `formatUsd`, `sumCents` in `src/lib/finances/money.ts`, "all in-app arithmetic is integer
  cents". The budget UI never actually adopted it; this spec makes that true.

### `agent-os/specs/2026-08-24-1311-budget-assign-options/` (frozen)

- **Relationship:** Extends.
- **Relevant decisions:** D8 — "Inline Assigned-cell edit is unchanged and still uses
  `setAssignment` (**not clamped to RTA** — that is a hand edit, as today)." An expression is
  still a hand edit, so it stays unclamped and may drive RTA negative. D10 removed the
  month-bar fill chrome, leaving the inline cell and the Assign control as the two ways money
  moves — which is why the inline cell is worth this much care.

### `agent-os/specs/2026-08-25-1633-budget-inspector/` (frozen)

- **Relationship:** Extends.
- **Relevant decisions:** D2 — one column set on every money table, bill-only fields leave
  the grid; D8 — bill cadence/amount/status/URL are no longer inline grid editors. Net
  effect: **Assigned is the only editable cell left on the Budget grid**, and the bill amount
  is now an inspector field with the same editor shape. Those are two of the three sites that
  become `AmountCell`.

### `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` (frozen)

- **Relationship:** Extends.
- **Relevant decisions:** D7 — "Assigned cell becomes a plain number. Remove `goalTone` /
  `GOAL_CLASS` rings. Inline edit is unchanged." `AmountCell` must not reintroduce tone
  styling on the Assigned cell; the only new visual state is `aria-invalid` on a failed parse.
  D2 kept the column `id: "balance"` while relabelling it Available — do not touch column ids.

### `agent-os/specs/2026-08-10-1604-escape-cancel-empty-insert/` (frozen)

- **Relationship:** Extends.
- **Relevant decisions:** Escape semantics inside a cell editor. `AmountCell` keeps them:
  Escape restores the stored value, clears the invalid flag, and blurs.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/` (frozen)

- **Relationship:** Extends.
- **Relevant decisions:** The shared-DataGrid contract every grid change inherits.

### `agent-os/specs/2026-08-22-2242-budget-goal-templates/` (frozen)

- **Relationship:** Extends, lightly.
- **Relevant decisions:** Template money fields hold strings and convert through
  `templates/draft.ts`. That module's docstring is the closest thing the repo has to a stated
  position on this problem: _"a money field is empty for a moment while it is being typed …
  so the editor holds strings, and this module owns the two conversions plus the validation
  message the user sees."_ Its `money()` helper is the one place that already delegates to
  `parseAmountCents`, so it converts by swapping one call.

## Reference implementation — Actual Budget

`../actual` is cloned beside the repo. `docs/actual-budget/README.md` has **no row** for
amount input or expression evaluation; Task 6 adds one.

### `packages/loot-core/src/shared/arithmetic.ts`

- **Relevance:** The evaluator to port. ~170 lines, hand-written recursive descent, no
  dependency.
- **Key patterns:** Precedence chain `parseAdditive → parseMultiplicative → parseExponent →
parseParens → parsePrimary`; whitespace stripped up front; the public `evalArithmetic`
  never throws and never returns `NaN` — it catches and falls back. We keep the chain minus
  the exponent rung, and return `null` where it returns `defaultValue`.
- **Tests to port:** `packages/loot-core/src/shared/arithmetic.test.ts` — `10 + -4`,
  `(12 + 3) + (10)`, `2400 / 2 / 5`.

### `packages/desktop-client/src/hooks/useFormat.ts` — `fromEdit` / `forEdit`

- **Relevance:** The exact function `parseAmountEntryCents` mirrors. Strips bidi marks and
  letters, tries `evalArithmetic`, falls back to `currencyToAmount`, else `defaultValue`.
- **Where we diverge:** order (D6) and the unparseable fallback (D4).

### `packages/loot-core/src/shared/util.ts:500` — `currencyToAmount`

- **Relevance:** Their currency parser, for comparison with `parseAmountCents`. Treats the
  last `.` or `,` as the decimal separator unless it is the configured thousands separator
  followed by exactly three digits. We do not need the locale handling — `parseAmountCents`
  already covers what our imports and our typing produce.

### `packages/desktop-client/src/components/budget/envelope/EnvelopeBudgetComponents.tsx:394`

- **Relevance:** How the Budget cell wires it up — `formatExpr: format.forEdit`,
  `unformatExpr: format.fromEdit`, `onSave` receiving already-parsed integer cents.

## Similar implementations in this repo

### `EffortCell` — `src/components/grid/cells.tsx:288`

- **Relevance:** The working precedent for the whole `AmountCell` contract, in the same file.
- **Key patterns:** Controlled `value`/`setValue`, `commit()` shared by blur and Enter,
  tri-state parser (`parseEffort` returns `number | null | undefined`), `invalid` state →
  `aria-invalid` + revert to the stored value, Escape restores and clears invalid, and an
  `aria-label` that doubles as the format hint ("Effort — for example 45 min, 2 h…").

### `parseEffort` — `src/lib/tree/format.ts:85`

- **Relevance:** The house style for a lenient parser of typed shorthand: regex-driven, pure,
  in `src/lib`, tested beside itself, with a return type that distinguishes "cleared" from
  "not understood". `parseMetricInput` (`src/lib/metrics/parse.ts:18`) is the same idea with
  a `{ok:true,value} | {ok:false}` result.

### `SplitEditor` — `src/components/finances/SplitEditor.tsx:195`

- **Relevance:** The only finance UI that already routes typed amounts through
  `parseAmountCents` + `centsToNumericString`. Not in scope (split amounts are register data,
  not a budget number), but it is the shape the eight converted sites end up matching.

## The eight sites being converted

The ad-hoc parse `Math.round(Number(v.replace(/[$,\s]/g, "")) * 100)`, verbatim in each:

| File                                                   | Line | Field                                     |
| ------------------------------------------------------ | ---- | ----------------------------------------- |
| `src/components/finances/budget/budgetColumns.tsx`     | 68   | Assigned grid cell                        |
| `src/components/finances/budget/BudgetInspector.tsx`   | 206  | Bill expected amount                      |
| `src/components/finances/budget/AssignDialog.tsx`      | 115  | Manual assign amount                      |
| `src/components/finances/budget/MoveMoneyDialog.tsx`   | 31   | Move-money amount                         |
| `src/components/finances/budget/ReviewDrawer.tsx`      | 183  | Detected-bill amount                      |
| `src/components/finances/TrackAsBillDialog.tsx`        | 93   | Bill amount                               |
| `src/components/finances/supplies/suppliesColumns.tsx` | 110  | `NumberCell` (cost, qty, rate)            |
| `src/lib/finances/budget/templates/draft.ts`           | —    | `money()`, already via `parseAmountCents` |

## Write path (unchanged by this spec)

`budgetColumns.tsx` `onAssign` → `BudgetView.tsx:524` `budgetOperationAction({kind:"assign",
month, category, amountCents})` → `src/app/finances/actions.ts:423` → `performBudgetOperation`
(`src/lib/finances/budget/mutations.ts:370`) → `applyEdit` upserting `financeBudgetAllocations`
on `(userId, month, categoryId)`. Storage is `amountCents: integer`, so nothing about this
change reaches the database.
