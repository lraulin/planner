# Budget assign options — Shaping Notes

**Status: frozen / complete** (2026-08-24)

## Scope

Replace Apply templates / Overwrite with templates (and the unclamped month-bar fills
Copy last month, Set to 3-month average, Set all to zero) with YNAB-shaped **Assign**.

Auto-assign has eight options. It acts on every eligible envelope when nothing is selected,
or on the focused table's selection when there is one. Right-click Assign is always that
one envelope. Assign never consumes more than Ready to Assign; a preview names a partial
envelope and any that will not be funded.

Templates and bill cadence stay as the _ask_. Assign is how money moves.

### Out of scope

- A new YNAB-style target type, separate from templates.
- Credit-card payment underfunded (no CC payment categories).
- Auto-assign on month open or any background job.
- Changing template types or the templates editor's unclamped demand preview.
- Replacing Hold for next month.
- Clamping the inline Assigned-cell edit to Ready to Assign.

## Decisions

Confirmed in shaping:

- **All eight YNAB options.** Underfunded, Assigned Last Month, Spent Last Month, Average
  Assigned, Average Spent, Reduce Overfunding, Reset Available Amounts, Reset Assigned
  Amounts.
- **Underfunded's ask is templates + bill cadence + overspend**, not a new target type.
- **Clamp is the rule.** This supersedes goal-templates D2 (Apply may drive RTA negative).
  The diagnostic is the preview, not a negative headline.
- **Always a preview**, then Assign Money / Cancel. The preview _is_ the engine.
- **Banner = all unless the focused table has a real selection; right-click = that row.**
  Budget tables allow an empty selection (exception to Outline's never-empty rule). A lone
  focus highlight is not an assign selection.
- **Averages are 12 months excluding current**, first-activity start. Replaces the 3-month
  spent SET.
- **Manual tab** in the same Assign popover (amount + To). Inline Assigned edit stays.
- **Hold for next month** stays on the month bar.
- Product alignment: assign until Ready to Assign is $0.00.

Why Apply/Overwrite "don't work anymore": after one-budget, bill envelopes hold no template
JSON. The month bar and row menu still gate on `templates.length > 0`, so bills are
invisible to the fill gesture even though `apply.ts` would fund them from cadence if it
were reached.

## Context

- **Visuals:** `visuals/ynab-assign-auto.png`, `ynab-assign-manual.png`,
  `ynab-assign-manual-picker.png`, `ynab-underfunded-preview.png` — YNAB's Assign popover
  (Auto list, Manual tab, category picker) and the Underfunded shortfall preview.
- **References:** See `references.md`.
- **Product alignment:** Financial planning track. Zero-based-budget's original rule —
  assign only money you have — restored as the assign gesture. Templates remain the
  autopilot _declaration_; Assign is the click that uses them.

## Standards Applied

See `standards.md`. Clean-code, testing, security, dates, commits; ux-principles,
navigation, data-grid, modal-pattern, responsive. No migration.
