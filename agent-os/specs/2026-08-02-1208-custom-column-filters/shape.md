# Custom Column Filters — Shaping Notes

**Status: frozen / complete (2026-08-04)**

## Scope

Achieve's **(Custom)** entry on every column filter dropdown, opening a multi-condition
criteria dialog (And/Or, operator, operand) with operators restricted by column type.

### In scope

- Shared DataGrid filter model extension (all filter-enabled tabs)
- Kind-restricted operators (text / enum / priority / date)
- Persistence under `grid:{tabId}.filters` with legacy `string[]` compatibility
- Modal criteria UI (OK/Cancel draft)

### Out of scope

- Like / Not Like / regex
- Cross-column filter expressions
- Named views / Views sidebar
- Notes and Task Chooser advanced UIs

## Decisions

- Reopen item previously listed under roadmap "Out of roadmap" and main-grid-tabs out of
  scope — same class of reopen as task recurrence.
- Custom XOR checklist (mutually exclusive) keeps active-filter state explainable.
- Pure matching in `src/lib/grid/customFilter.ts`; components stay thin.

## Product alignment

Unblocks daily outline/list work ("hide cancelled but keep postponed", "name does not
contain …") without inventing a full query language.

## Standards

- `development/testing` — pure logic adjacent tests; no React component tests
- `components/ux-principles` / `modal-pattern` — config modal OK (NoteFilterDialog class)
- `components/responsive` — ModalShell already bottom-sheets below `md`
