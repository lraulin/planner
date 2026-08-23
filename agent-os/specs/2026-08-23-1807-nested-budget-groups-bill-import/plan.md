# Nested Budget Groups and Commitments Import

**Status: frozen / complete** (2026-08-23)
Spec folder: `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — preserves its
  Actual-derived envelope arithmetic and the separation between taxonomy and envelopes.
- **Extends:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — preserves recurrence,
  status, matching, and independent editing after a Commitments import.
- **Extends:** `agent-os/specs/2026-08-22-2242-budget-goal-templates/` — schedule templates
  remain the explicit bridge from a schedule to monthly funding.
- **Extends:** `agent-os/specs/2026-08-23-1536-finance-rules/` — keeps the fixed spending
  taxonomy and user-owned rules while refining one broad category.
- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` and
  `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/` — active bills and stable payee
  identities are the seed source.
- **Supersedes:** only the zero-based budget's flat, two-level group model and the minimal
  preset's use of one undifferentiated Bills envelope.

## Summary

Budget groups become arbitrary-depth organizational containers whose totals recursively sum
every descendant envelope. The Actual-derived money math remains unchanged: groups never hold
money, allocations stay on envelopes, and transactions spend from envelopes.

An explicit, re-runnable **Import commitments…** flow seeds active declared bills into
`Spending › Bills › Commitments category › one envelope per bill`, reusing or creating each
bill's Schedule and attaching one schedule template to its envelope. Commitments remains an
independent inventory after import; later edits do not silently rewrite the budget.

The fixed taxonomy replaces `Software & AI` with `AI`, `Productivity & Security`, and
`Software & Development`. This is a guarded data cutover, not a display-only rename.

## Divergence from Actual

Actual Budget stores one flat category-group level. Planner deliberately adds nested groups
because a recursive Spending total and category-organized bill envelopes are useful here.
Actual's allocation, balance, carryover, Ready to Assign, schedule-template, and transaction
sign semantics remain authoritative and unchanged.

## Decisions

- Groups may contain child groups and envelopes in one ordered sequence, at any depth.
- Every group shows recursive Assigned, Activity, and Available totals. Hidden descendants
  remain included; collapse changes visibility only.
- Income and spending are separate structural branches. A subtree or envelope cannot move
  across that boundary.
- Deleting a group is organizationally safe: only an empty group may be deleted. Envelopes
  retain their existing explicit destructive delete.
- Active Commitments bills import; paused, cancelled, and ignored bills are reported and
  skipped. A blank category uses `Uncategorized`.
- Imported groups and envelopes carry stable provenance. Re-runs add missing items and
  preserve manual names, positions, moves, and template edits.
- The existing generic `Bills` envelope keeps its id and becomes `Other bills` under the new
  Bills group. Bill schedule templates move to specific envelopes; unrelated templates stay.
- Import changes structure, routing, and templates only. It does not Apply/Overwrite templates
  and does not change Assigned amounts, allocations, or stored goals.
- Transactions already unassigned or in the legacy Bills envelope may move to the specific
  bill envelope. Any other envelope assignment is treated as an explicit user choice.
- A schedule's envelope routes Post now and newly matched transactions when the transaction
  has no envelope. Existing manually assigned envelopes win.
- Commitments is a seed, not ongoing synchronization. Schedule and envelope edits are
  independent after import.
- Taxonomy split:
  - `AI`: OpenAI, Anthropic/Claude, xAI/Grok.
  - `Productivity & Security`: Dropbox, 1Password, SaneBox, Google One/Storage.
  - `Software & Development`: Cursor, GitHub, JetBrains, Paddle, Apple, Microsoft, Adobe,
    and remaining software vendors.

## Tasks

### Task 1: Save the active intent checkpoint

- [x] Create `plan.md`, `shape.md`, `standards.md`, and `references.md`; no visuals.
- [x] Copy the selected standards in full.

### Task 2: Correct the budget structure model

- [x] Add group parent/provenance, bill-envelope provenance, and schedule-envelope routing.
- [x] Generate and review a Drizzle migration that preserves existing ids and makes current
      groups roots.
- [x] Make group deletion refuse non-empty groups at both database and mutation boundaries.

### Task 3: Implement nested budget behavior

- [x] Add pure hierarchy/order/totals/placement logic with adjacent tests.
- [x] Render recursive group headers in Budget without changing envelope arithmetic.
- [x] Extend the structure drawer with subgroup creation and complete desktop/phone move paths.

### Task 4: Split the software taxonomy

- [x] Add the three selected categories and narrow starter-rule mappings.
- [x] Implement an idempotent compatibility cutover for transactions, commitments, rules,
      and envelope source-category claims before rejecting the legacy value.
- [x] Update both presets without renaming user-owned envelopes.

### Task 5: Import Commitments into Budget

- [x] Add a deterministic preview planner and user-scoped transactional executor.
- [x] Add the shared Budget/Schedules command and preview-confirm surface.
- [x] Preserve manual organization on replay, report per-bill conflicts, and prove a second
      run writes nothing.
- [x] Route posted and matched schedule transactions into the linked bill envelope without
      overwriting a manual assignment.

### Task 6: Verify and freeze

- [x] Run unit and real-Postgres integration tests, lint, typecheck, build, and route smoke.
- [x] Verify desktop and 390×844 phone flows in light and dark mode.
- [x] Record material changes, update the roadmap, satisfy acceptance, and freeze the spec.

## Acceptance criteria

- [x] Spending can contain Bills plus direct envelopes, Bills can contain category groups plus
      Other bills, and every header equals the sum of all descendant envelopes.
- [x] Every structural action has desktop and touch-complete paths; cycle/cross-kind/non-empty
      deletion failures explain why they are unavailable.
- [x] On the current data, preview proposes four active bill envelopes under Uncategorized,
      reuses their four source-bill schedules, moves those four templates, leaves the unrelated
      schedule template on Other bills, and changes no allocation before Apply/Overwrite.
- [x] Import is transactional, user-scoped, and idempotent; conflicts on one bill do not create a
      partial structure for that bill or block unrelated bills.
- [x] Existing manual group/envelope organization survives re-runs.
- [x] The legacy taxonomy value is absent after cutover, while account balances, flows,
      allocations, Ready to Assign, and existing envelope assignments remain unchanged.
- [x] Post now and schedule matching use the schedule's envelope only when no explicit envelope is
      already present.
- [x] Every new database read/write rejects a second user's ids at read, change, and delete/move.

## As-built map

- `drizzle/0068_vengeful_war_machine.sql` and `src/db/schema.ts` hold parent/provenance and
  schedule-envelope identities, restricted group deletion, the taxonomy cutover, and legacy
  sort-key normalization.
- `src/lib/finances/budget/hierarchy.ts` owns recursive traversal, totals membership, legal
  placement, depth, and cycle prevention; Budget and the structure drawer consume it.
- `src/lib/finances/budget/commitmentsImport.ts` is the deterministic preview planner;
  `commitmentsImportMutations.ts` recomputes its fingerprint and applies it transactionally.
- `src/lib/finances/ingestion.ts` orders payee classification before schedule matching when a
  schedule exists. Live bank sync retains its prior unconditional classification behavior.
- Budget and Schedules share one import destination, and the schedule drawer exposes its
  optional envelope route for independent edits after import.

## Out of scope

- Replacing, deprecating, or continuously synchronizing Commitments.
- Automatically applying or overwriting budget templates during import.
- Reorganizing existing non-Bills envelopes such as Recurring spend, Discretionary, or Savings.
- Porting Actual's generic schedule actions or changing envelope formulas.

## Changes from original plan

| #   | Change                                                                                                                               | Why                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Normalize every existing budget sort key during migration and seed new envelope keys per sibling list.                               | Flat budgets encoded `group:envelope`; `:` is intentionally invalid for fractional insertion once groups and envelopes share one ordered sequence.                                                 |
| 2   | Finish CSV/pending ingestion with classification and matching only when schedules exist; live bank sync forces the same finish step. | Schedule conditions use stable payee ids, so matching must follow classification, while imports without schedules retain the explicit Reclassify workflow and do not mint identities unexpectedly. |
| 3   | Expose the optional schedule-envelope route in the schedule drawer and route the old Schedules import command to the shared preview. | Imported schedules remain independently editable and there must be one canonical import rather than a schedule-only path that can leave envelopes/templates behind.                                |

## Follow-ups (new work — not amendments to this frozen spec)

- Decide from lived use whether Commitments should eventually merge into or be replaced by
  Schedules; this import deliberately does neither.
- Any future automatic synchronization after import requires a new delta-spec because manual
  budget organization is authoritative here.
