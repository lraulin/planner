# Standards for Arithmetic expressions in currency inputs

Applied as of standards commit `91b94c63894ceb565c206327847af2185a9b194d`. References, not
copies — see AGENTS.md. `git show 91b94c6:agent-os/standards/<path>` recovers exactly what
applied.

- `agent-os/standards/development/clean-code.md` — the spec's organising standard. "One
  shared implementation per concern" is why the parser is built once in `src/lib` and the
  eight ad-hoc copies are deleted, and why the three identical blur-commit inputs collapse
  into one `AmountCell`. The app→components→lib dependency direction is why the evaluator is
  a pure lib module with no React in it.
- `agent-os/standards/development/testing.md` — the evaluator and `parseAmountEntryCents`
  are pure logic in `src/lib`, so they get `.test.ts` files beside them and that is where
  the real coverage sits. No React component tests for `AmountCell`. No
  `*.integration.test.ts`: no schema, mutation, or `userId`-scoping change, so there is no
  cross-user case to write.
- `agent-os/standards/components/ux-principles.md` — owns "decimal commit on blur", which
  this preserves: expressions evaluate at commit, never per keystroke. The `aria-invalid`
  plus revert treatment for unparseable input follows the same file's invalid-state pattern.
- `agent-os/standards/components/data-grid.md` — `AmountCell` joins the shared cell library
  in `src/components/grid/cells.tsx` and must keep the existing cell-editor contract: grid
  shortcuts stay suppressed while focused (`isTypingTarget`), Escape restores, and the
  `compactText` path stays read-only on mobile.
- `agent-os/standards/components/responsive.md` — the 16px input rule that stops iOS zoom.
  `AmountCell` must carry the existing `text-base ... md:text-[0.8125rem]` pair forward from
  the cells it replaces rather than hard-coding the desktop size.
- `agent-os/standards/development/commits.md` — one logical change per commit. Natural
  split: the evaluator + tests, then the shared cell, then the call-site conversion.

## Deviations

**From Actual Budget, not from a Planner standard** — recorded here because
`docs/actual-budget/README.md` currently has no row for amount input at all, and Task 6
adds one.

1. **Unparseable input reverts rather than committing zero** (D4). Actual's `fromEdit`
   returns `defaultValue` for anything it cannot read and the budget cell's `onSave` coerces
   that to `0`. We write nothing and restore the prior value.
2. **Currency parser runs before the expression evaluator** (D6). Actual runs
   `evalArithmetic` first, then `currencyToAmount`. Inverting it preserves `(1.23)` as
   accounting-negative −1.23 instead of re-reading the parens as grouping.
3. **No `^` operator** (D3). Actual's grammar includes exponentiation; ours stops at the
   four functions and parentheses.

No deviation from any `agent-os/standards/` file.
