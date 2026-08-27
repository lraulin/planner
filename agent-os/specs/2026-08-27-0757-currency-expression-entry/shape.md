# Arithmetic expressions in currency inputs — Shaping Notes

**Status: frozen / complete (2026-08-27)**

## Scope

Let a person type an arithmetic expression into a finance money field and have the result
committed — `50+25`, `(40+60)/2`, `12.99*2` — the way YNAB and Actual Budget both work.

The request was about the Budget page's currency cells. Exploration widened it on purpose:
the parse those cells use is copy-pasted across eight inputs, so the parser is built once in
`src/lib` and the eight copies are deleted. That also retires a latent bug all eight share
(`Number("")` is `0`, so an emptied field silently commits $0.00).

### Out of scope

- **`MoneyField`** (`src/components/detail/fields.tsx:604`) and its callers — project and
  task costs, job pay, residence rent. A different subsystem: it keeps a decimal string end
  to end rather than converting to cents, and it rejects negatives. Giving it expressions
  is a reasonable follow-up, not this spec.
- **Persisting the typed expression.** No schema change; the number is what is stored.
- **A live preview of the result while typing.** Considered and declined — the result is
  visible the moment you commit, and a running `= 75.00` is chrome the grid does not need.
- **Exponentiation (`^`).** Actual supports it; no budgeting gesture uses it.
- **The transaction register.** Amounts there are the bank's record and are deliberately
  not editable (`financeColumns.tsx:107`). There is no manual transaction entry UI.

## Decisions

The nine decisions D1–D9 are recorded in `plan.md` rather than duplicated here. The two
that were genuinely contested during shaping:

**D4, blank reverts instead of committing $0.** Today it commits $0, which is Actual's
behavior too (`fromEdit` → `defaultValue` → `?? 0`). It was still judged a bug rather than a
feature: nothing about a Budget grid makes "I cleared the field" a safe synonym for "zero
this envelope", the write is not undoable, and every other tri-state parser in this repo
(`parseEffort`, `parseMetricInput`) already treats unparseable as "do nothing". Typing `0`
remains a one-keystroke way to zero a cell.

**D6, currency parser first, expression second.** Actual runs `evalArithmetic` first and
falls back to `currencyToAmount`. We invert it because `parseAmountCents` gives `(1.23)` the
accounting meaning −1.23, and an expression grammar would silently reverse the sign to
+1.23. Checked for other overlap: `parseAmountCents` accepts only a bare signed decimal
(`-5`, `+5`, `5.00`), and on all of those the two parsers agree, so parens are the sole
divergence and currency-first is safe.

**Why the evaluator is top-level, not under `finances/` (D8).** Supplies' `NumberCell`
edits quantities and consumption rates, not money. Those want expressions for the same
reason budget cells do (`3*2` boxes), and they never touch cents. So the number evaluator
lives at `src/lib/arithmetic.ts` beside `dateMath.ts`, and `parseAmountEntryCents` in
`money.ts` is the thin money-specific bridge on top of it.

**Why a shared `AmountCell` rather than eight patched call sites.** Three of the eight are
the same uncontrolled blur-commit input, character for character. D4 has to land in all
three identically, and duplicating a revert-on-invalid contract three more times is what
`standards/development/clean-code.md` ("one shared implementation per concern") exists to
prevent. `EffortCell`, already in `src/components/grid/cells.tsx`, is the working precedent
for the whole contract.

## Context

- **Visuals:** None. The change is invisible until you type into a field that already exists.
- **References:** See `references.md`. The load-bearing one is
  `../actual/packages/loot-core/src/shared/arithmetic.ts`.
- **Product alignment:** N/A — this is a fidelity fix inside a shipped Budget page, not a
  roadmap item. Task 6 checks whether it closes one.

## Standards Applied

See `standards.md`.
