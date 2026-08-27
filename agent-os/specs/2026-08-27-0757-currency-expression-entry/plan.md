# Arithmetic expressions in currency inputs

**Status: frozen / complete (2026-08-27)**
Spec folder: `agent-os/specs/2026-08-27-0757-currency-expression-entry/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — D7, every affordance is
  an arithmetic edit of one allocation number. This spec changes only how the typed string
  becomes that number; the edit itself is untouched.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` — D8, the inline
  Assigned-cell edit uses `setAssignment` and is deliberately **not** clamped to RTA. Still
  true; an expression is still a hand edit.
- **Extends:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — D2/D8, Assigned is the
  only editable cell left on the Budget grid and the bill amount now lives in the inspector.
  Those are two of the three call sites this spec converts.
- **Extends:** `agent-os/specs/2026-08-10-1604-escape-cancel-empty-insert/` — Escape
  semantics inside a cell editor. Escape still restores the stored value and blurs.
- **Supersedes:** nothing. The blank-input behavior it changes was never specified — it is
  a bug (see Context), not a decision on the record.

## Context

In YNAB and Actual Budget you can type `50+25` or `(40+60)/2` into a budgeted-amount field
and it commits the computed number. That is the natural gesture when funding an envelope
from a handful of receipts, and the Budget page cannot do it: typing `50+25` yields `NaN`,
which the Assigned cell silently swallows and reverts.

Shaping the fix surfaced a second, larger problem. **There is no shared money-entry parser
in the UI at all.** `parseAmountCents` (`src/lib/finances/money.ts:22`) is the canonical
one, but it is used almost entirely on the CSV-import side. Every finance input a person
types into instead carries its own copy of:

```ts
Math.round(Number(value.replace(/[$,\s]/g, "")) * 100);
```

Eight copies, each with the same latent bug: `Number("")` is `0`, so `Number.isFinite`
passes and **an emptied field silently commits $0.00**. On the Budget grid that means
clearing a cell and tabbing out zeroes the envelope with no confirmation and no undo.

Adding expression support site by site would turn that into eight copies of a parser call.
Per AGENTS.md — "check whether the same pattern repeats before fixing one site; a tight
single-cause refactor beats N copies of the same patch" — the shape of the work is: build
the parser once in `src/lib`, then delete the eight copies. The blank-commits-zero bug dies
with them.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Reach: the eight cents-based finance inputs.** Budget Assigned cell, BudgetInspector bill amount, AssignDialog, MoveMoneyDialog, ReviewDrawer, TrackAsBillDialog, TemplateDrawer (via `templates/draft.ts`), supplies `NumberCell`. The non-finance `MoneyField` (`src/components/detail/fields.tsx:604`) is **out of scope** — a different subsystem that stores decimal strings rather than cents and rejects negatives.            |
| D2  | **The expression is not persisted.** Evaluate on commit, store the number, show the result on re-edit. What YNAB and Actual both do; no schema change.                                                                                                                                                                                                                                                                                  |
| D3  | **Full four-function arithmetic with parentheses**, correct precedence, unary minus. Actual's `^` exponent is dropped — no budgeting gesture needs it.                                                                                                                                                                                                                                                                                  |
| D4  | **Blank or unparseable input reverts and writes nothing.** To zero an envelope you type `0`. Deliberate divergence from Actual, whose `fromEdit` coerces unparseable input to `defaultValue` and thence to `0`. Ours matches `parseAmountCents` returning `null` for blank, the Escape behavior already in these cells, and the established `EffortCell` contract.                                                                      |
| D5  | **No live preview.** Type `50+25`, press Enter, the cell reads `75.00`.                                                                                                                                                                                                                                                                                                                                                                 |
| D6  | **Currency first, expression second.** Divergence from Actual, which tries `evalArithmetic` first. Reason: `parseAmountCents` reads `(1.23)` as accounting-negative −1.23, whereas an expression grammar reads it as grouping, +1.23. Trying the currency parser first keeps that meaning. The two overlap on nothing else — `parseAmountCents` accepts only a bare signed decimal, and agrees with the evaluator on every one of them. |
| D7  | **`parseAmountCents` is left exactly as it is.** It serves CSV import, where a malformed cell must return `null` rather than be coerced into a plausible-looking number by an expression grammar. Two concerns, two functions.                                                                                                                                                                                                          |
| D8  | **The evaluator is top-level (`src/lib/arithmetic.ts`), not under `finances/`.** Supplies' rate and quantity cells are plain numbers, not money, and take expression support from the same function. Sits beside `src/lib/dateMath.ts`.                                                                                                                                                                                                 |
| D9  | **No `eval`, no `new Function`, no new dependency.** A hand-written recursive-descent parser, structure ported from Actual's.                                                                                                                                                                                                                                                                                                           |

## Acceptance criteria

- [x] `50+25` in the Assigned cell commits `75.00`; Available and Ready-to-Assign both move by $75.
- [x] `(40+60)/2` commits `50.00`; `2+3*4` commits `14.00` (precedence, not left-to-right).
- [x] `$1,000 + 50` commits `1050.00` — currency chrome inside an expression is tolerated.
- [x] Clearing a cell and tabbing out **restores the previous value and writes nothing**.
- [x] `abc`, `2+`, and `1/0` all revert and mark the field invalid; none of them writes.
- [x] Escape mid-expression restores the stored value and blurs, as before.
- [ ] Assign and Move-money dialogs accept `100/2` and enable submit; `0` and blank do not.
      **Verified only in code and unit tests.** The Assign form renders and reads its amount
      through `parseAmountEntryCents`, but its submit was gated shut by a negative Ready to
      Assign in the local data, and Move money needs a positive envelope balance to open — so
      neither guard was exercised against a real click.
- [x] Supplies Cost/order accepts `12.99*2`; supplies Qty accepts `3*2`.
- [x] `grep -rn 'Number(.*replace(/\[\$,\\s\]/g' src/` returns nothing.
- [x] `npm run lint && npm run typecheck && npm run test:unit` green.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                                                                                                                                                                                    | Why                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Whitespace separates tokens; it is not stripped before scanning.** Task 2 asked for both "strip whitespace up front" (Actual's move) and `1 2` → `null`. Those contradict: stripping makes `1 2` twelve. The scanner skips whitespace _between_ tokens, and a number token ends at one. | `1 2` is a typo and a silent `12` is the worst reading of it. Keeping the stated `null` case was the right half of the contradiction to keep — the whitespace instruction was only ever a means to `10 + -4`, which tokenizing also gives.                        |
| C2  | **`AmountCell` resyncs on a changed `cents` prop rather than remounting on `key`.** The sites it replaced used `key={cents}`. It now tracks the last value it rendered and resets state when that changes.                                                                                | Same effect for an idle field, but a `key` remount also fires while someone is mid-type if another edit lands, throwing away focus and the caret. A shared cell used by a live grid should not have that failure mode.                                            |
| C3  | **Commit is blur-only; Enter blurs, and Escape sets a cancel flag first.** `EffortCell`, the model, commits on Enter _and_ on the blur that follows it, and its Escape restores state then blurs into a commit of the stale typed text.                                                   | On `EffortCell` that double-commits and flashes the field invalid on Escape. Copying the shape into a cell that writes money is how a duplicate assignment happens, so `AmountCell` takes the corrected version. `EffortCell` itself is untouched — separate fix. |

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md` (pinned at standards commit
`91b94c6`), and `references.md`. No `visuals/` — there is nothing to mock; the change is
invisible until you type into an existing field.

## Task 2: The evaluator — `src/lib/arithmetic.ts` + `arithmetic.test.ts`

Hand-written recursive descent, precedence chain `additive → multiplicative → parens →
primary`, structure ported from `../actual/packages/loot-core/src/shared/arithmetic.ts`.

```ts
/** Evaluate a typed arithmetic expression. `null` for empty, malformed, or non-finite. */
export function evalArithmetic(expression: string): number | null;
```

Contract: strip whitespace and currency chrome (`$`, thousands commas) before scanning;
return `null` — **never** throw, never `NaN`, never `Infinity` — for empty input, a syntax
error, trailing garbage, or division by zero.

Tests: port `10 + -4`, `(12 + 3) + (10)`, `2400 / 2 / 5` from Actual's
`arithmetic.test.ts`; add precedence (`2+3*4` → 14), `$1,000 + 50` → 1050, and the `null`
cases (`1/0`, `2+`, `""`, `abc`, `1 2`).

## Task 3: The money bridge — `parseAmountEntryCents` in `src/lib/finances/money.ts`

```ts
/**
 * Read what a person typed into a money field, in cents. Unlike {@link parseAmountCents} —
 * which reads a bank CSV and must reject anything malformed — this accepts arithmetic:
 * `50+25`, `(40+60)/2`. Currency first, so `(1.23)` keeps meaning −1.23.
 */
export function parseAmountEntryCents(raw: string): number | null;
```

`parseAmountCents(raw)` first; on `null`, `evalArithmetic(raw)` and round dollars to cents.
Tests in `money.test.ts` covering D6 (`(1.23)` still `-123`) and rounding (`10/3` → `333`).

## Task 4: The shared cell — `AmountCell` in `src/components/grid/cells.tsx`

Three of the eight sites are the same uncontrolled blur-commit input, byte for byte:
`key={shown}` remount, `defaultValue`, select-on-focus, Enter blurs, Escape restores, parse
on blur. D4 must be implemented identically in all three — which is what one shared
implementation is for.

Model it on `EffortCell` in the same file, which already solves this exact problem for
`parseEffort`: controlled state, `commit()` on blur and Enter, `aria-invalid` plus revert
when the parser returns nothing, Escape restores. Props: `cents`, `onCommit(cents)`,
`label`, `disabled`, `className` (so the inspector field and the grid cell keep their
present styling).

Supplies' local `NumberCell` stays local — it is generic over decimals and serves counts and
rates as well as cost — but its blur handler moves to `evalArithmetic`.

## Task 5: Convert the eight call sites

| Site                                                                    | Change                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/components/finances/budget/budgetColumns.tsx:50` `assignedCell`    | Replace body with `<AmountCell>`                                           |
| `src/components/finances/budget/BudgetInspector.tsx:198` bill amount    | Replace with `<AmountCell>`                                                |
| `src/components/finances/budget/AssignDialog.tsx:115`                   | `parseAmountEntryCents`; guard becomes `cents !== null && cents > 0`       |
| `src/components/finances/budget/MoveMoneyDialog.tsx:31`                 | Same; `valid` drops `Number.isFinite`                                      |
| `src/components/finances/budget/ReviewDrawer.tsx:183`                   | Same                                                                       |
| `src/components/finances/TrackAsBillDialog.tsx:93`                      | Same                                                                       |
| `src/lib/finances/budget/templates/draft.ts` `money()`                  | `parseAmountCents` → `parseAmountEntryCents`; TemplateDrawer needs no edit |
| `src/components/finances/supplies/suppliesColumns.tsx:110` `NumberCell` | Blur handler → `evalArithmetic`; revert on `null`                          |

No schema change, no server-action change, no new dependency. `onAssign` keeps its
`(row, cents)` signature; the write path through `budgetOperationAction` →
`performBudgetOperation` → `applyEdit` is untouched.

## Task 6: Verify, freeze spec, update roadmap

- Walk the acceptance criteria in the running app (dev server + `/finances/budget`), not
  only in tests — none of this is reachable from a unit test.
- Add the missing row to `docs/actual-budget/README.md`: amount input / expression
  evaluation → `packages/loot-core/src/shared/arithmetic.ts` and `useFormat.ts`'s
  `fromEdit`/`forEdit`. Record D4 and D6 under "Where we diverge". This is a real gap in
  the reference map, not bookkeeping.
- Update `plan.md`/`shape.md` for as-built drift; complete **Changes from original plan**.
- Mark both **Status: frozen / complete** (date); list follow-ups as new work.
- Update `agent-os/product/roadmap.md` if this closes a listed item.

---

**Standing rule while this spec is active:** material changes to requirements, design, or
scope — including feedback on what was built — go into `plan.md`/`shape.md` plus a row in
**Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Follow-ups (new work, not part of this spec)

- **`MoneyField`** (`src/components/detail/fields.tsx`) and its callers — project and task
  costs, job pay, residence rent — still have no expression support. Deliberately out of
  scope (D1): it keeps a decimal string end to end rather than converting to cents and it
  rejects negatives, so it needs its own decision about what an expression means there.
- **`EffortCell` double-commits on Enter and flashes invalid on Escape.** Found while
  modelling `AmountCell` on it (C3): it calls `commit()` then `blur()`, and its `onBlur`
  commits again; Escape sets state and blurs, and the blur parses the stale typed text.
  `AmountCell` carries the corrected shape; `EffortCell` was left alone because it writes
  minutes, not money, and fixing it is a `/fix-bug` of its own.
