# Standards for Inline Budget Structure

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`. References, not
copies — see `AGENTS.md`. `git show 2920aa76:agent-os/standards/<path>` recovers exactly what
applied.

- `agent-os/standards/components/ux-principles.md` — the source of D4 and D5. "Inline editing
  for grid-visible fields" is why the name renames in the cell rather than in a drawer;
  "avoid modals for routine editing" is why creating an envelope is a composer line and not a
  dialog; "do not move the world while the user is still typing" is why the composer sits
  under the grid instead of being a draft row inside it.
- `agent-os/standards/components/navigation.md` — D8. A command without a menu is not
  shipped, so every new gesture is a declared page command under Organize ▸ Budget;
  unavailable is disabled **with the reason** (the non-empty group delete), never absent.
- `agent-os/standards/components/data-grid.md` — the new `groupChrome` seam. One shared
  DataGrid, hosts render their own content into it rather than the grid growing a
  budget-specific prop; `rowMenu` takes a nullable row; every preference persists through
  `useGridState`.
- `agent-os/standards/components/responsive.md` — every affordance needs a visible tappable
  path below `md`: the `+` and `⋮` are real buttons, the row commands reach the phone through
  long-press and `⋯`. This is also why row commands beat drag, which is off below `md` by
  design.
- `agent-os/standards/development/testing.md` — `moveDestinations` is pure logic and gets
  `hierarchy.test.ts`; every touched mutation gets an integration test with a second user
  trying to read, change and delete the first user's row and failing.
- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the
  model". The bill refusal lives in three places (`ENVELOPE_SECTION_KINDS`,
  `createBudgetCategory`, `updateBudgetCategory`) plus a fourth workaround in the drawer's
  read-only Bill option; that is the repeated-workaround signal, so the fix is the model, not
  a fourth special case.
- `agent-os/standards/development/commits.md` — one logical change per commit across the five
  implementation tasks; the `Spec` trailer points here.

## Deviations

**The composer is not a draft row inside the grid.** The reference screenshots
(`visuals/`) show Actual and YNAB rendering the new-category input as a row within the group.
This spec renders it as a one-line strip directly beneath the section's grid, indented to the
target group. Reason: our budget grids are real `DataGrid`s with live sort, filter, grouping
and collapse, so a draft row would be reordered out from under the cursor as soon as it had a
name — the failure `ux-principles` names explicitly. The gesture (click `+`, type, Enter,
repeat) is preserved; only the input's position differs.

**Reordering has no drag.** `data-grid.md` calls drag-to-reorder "first-class, not a
fallback", and this spec ships reordering as row commands only. Reason: `DataGrid` requires
`gutter: "handle"` for `rowDrag`, and `2026-08-27-2200-plan-gutter-drag-handle` decided the
Budget tables keep the checkbox gutter and header select-all. The standard's concern —
that reordering not be a second-class afterthought — is met by commands that are declared,
keyboard-bound and phone-reachable, which the drawer's desktop-only drag was not.
