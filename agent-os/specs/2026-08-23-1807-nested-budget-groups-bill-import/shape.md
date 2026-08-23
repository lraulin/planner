# Shape

**Status: frozen / complete** (2026-08-23)

## User intent

Budget groups should be organizational containers, not envelopes. A top-level Spending group
must show everything beneath it while ordinary groups such as Bills organize more specific
envelopes. Bills benefit from one envelope per specific obligation because their amounts and
dates are predictable; lumpy discretionary purchases still belong in broad envelopes.

The existing Commitments inventory has already identified the bills. Re-entering them by hand
as Schedules, envelopes, and goal templates would repeat work. The bridge must remain available
after initial budget setup because the Minimal preset is already in use.

Commitments should remain unchanged and parallel for now. The import is explicit and
re-runnable, not a hardwired merge. Manual rearrangement after import is authoritative.

## Shaping decisions

- Bill tree: `Spending › Bills › [Commitments category] › [bill envelope]`.
- Re-run behavior: add missing only; never undo manual rename, move, or template edits.
- Eligibility: active bills only; blank category becomes Uncategorized.
- Existing generic Bills envelope: preserve the row and history as Other bills, then move
  bill-specific schedule templates out of it.
- Funding: leave Assigned explicit; offer Apply/Overwrite after import.
- Import interaction: preview, then confirm one server-recomputed transactional plan.
- Taxonomy: narrow three-way split, with Cursor under Software & Development.
- Groups: arbitrary depth in both budget branches; no visual redesign beyond hierarchy.
- No visuals are required for this spec.

## Implementation discovery

The flat budget had used `groupKey:categoryKey` as a global display key. Nested groups make
groups and envelopes true siblings, so that composite key cannot remain: the fractional-key
library deliberately rejects `:`. The migration therefore normalizes every existing root and
child sequence while preserving its order, and future presets seed category keys within their
own group.

## Current-state evidence

- The budget schema is flat: groups have no parent and envelopes point to exactly one group.
- The shared DataGrid already understands arbitrary group depth and recursive collapse.
- Minimal budget is configured as Income › Income and Spending › Bills, Recurring spend,
  Discretionary, Savings.
- The generic Bills envelope currently holds five schedule templates; four schedules came
  from active Commitments bills and one schedule is unrelated.
- Current active bills are Geico, Taylor Gas, Rent, and 1Password; all currently have blank
  Commitments categories.
- Schedules carry stable `sourceBillId` provenance but no budget-envelope destination.
- Transactions already carry orthogonal schedule and budget-envelope ids.
- Actual's category groups are flat, so nested groups are an explicit Planner divergence.

## Product alignment

The change preserves explicit control: nothing funds itself and Commitments remains parallel.
It uses stable identities instead of names, keeps difficult arithmetic in the existing pure
budget fold, and makes a previously identified join available as a deliberate user action.
