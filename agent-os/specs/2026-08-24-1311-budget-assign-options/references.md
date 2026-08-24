# References for Budget assign options

## Governing specs

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends D1 (envelope math) and D7 (every affordance is an allocation
  edit; clamps are the semantics). **Supersedes** the unclamped month-bar fills Copy last
  month, Set to 3-month average, and Set all to zero.
- **Relevant decisions:** Ready to Assign fold; `assignFromReadyToAssign` already clamped;
  `copyPreviousMonth` / `setToAverage` / `setZero` currently SET Assigned without a clamp
  and become the SET assign options.

### `agent-os/specs/2026-08-22-2242-budget-goal-templates/`

- **Relationship:** Extends templates, `goalCents`, Edit templates…. **Supersedes D2**
  (Apply / Overwrite as the fill gesture, and Apply may drive Ready to Assign negative).
- **Relevant decisions:** Demand math (`simple` / `by` / `remainder`); bill envelopes later
  gained intrinsic demand in one-budget. The templates editor's preview stays the unclamped
  ask. `goalCents` now records that full ask even when Underfunded only partially funds.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends D4's "a bill envelope funds itself." **Supersedes** only the
  "Apply/Overwrite stay the fill click" sentence.
- **Relevant decisions:** Empty `templates` on a bill is correct; `billFundingDemand` is
  the ask. Paused/cancelled bills are filtered before the schedule module.

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends. Savings assigns like any envelope; Income never does.
- **Relevant decisions:** Four sections. Banner Assign with an empty selection covers
  Bills + Regular spending + Savings.

## YNAB (shaping reference, not source code)

Assign = give every dollar a job from Ready to Assign. Eight Auto options (web), preview
before commit, selection scopes the run, right-click can target one category. Underfunded
priority: overspend, then due-dated needs, then end-of-month, then future custom targets.
We map due-dated needs onto bill cadence + `by` templates. No credit-card payment bucket.

Visuals in `visuals/`.

## Similar implementations in this repo

### Template demand

- **Location:** `src/lib/finances/budget/templates/` (`apply.ts`, `simple.ts`, `by.ts`,
  `remainder.ts`, `schedule.ts`)
- **Relevance:** Underfunded's ask. Export or reuse `demandOf` rather than copying the
  math. `applyTemplates` itself (absolute Assigned, may go negative) is no longer the fill
  gesture.

### Budget operations

- **Location:** `src/lib/finances/budget/operations.ts`
- **Relevance:** `assignFromReadyToAssign` (Manual), `copyPreviousMonth`, `setToAverage`
  (3-month, unclamped), `setZero`. SET options replace the last three with a 12-month
  window and an RTA clamp. Movement notes still append through `applyEdit`.

### Budget page

- **Location:** `src/components/finances/budget/BudgetView.tsx`, `BudgetSummary.tsx`,
  `AssignRemainingDialog.tsx`, `TemplateDrawer.tsx`
- **Relevance:** Month-bar fills and `templatedCount` gate to remove. Assign remaining
  becomes the Manual tab. Summary is the Assign control. Row menu loses Overwrite this
  envelope and gains Assign ▸.

### Multi-select

- **Location:** `src/lib/grid/selection.ts`, `src/components/grid/useMultiSelect.ts`,
  `DataGrid` `selectedIds`
- **Relevance:** Budget tables adopt this, with empty selection allowed (D7). Outline's
  `applySelect` refuses empty; budget starts empty and clears on Escape / blank click.
