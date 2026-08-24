# Actual Categories and Tags

**Status: frozen / complete** (2026-08-23)

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/`
- **Extends:** `agent-os/specs/2026-08-23-1536-finance-rules/`
- **Extends:** `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/`
- **Supersedes:** zero-based-budget D4/D6 where transaction taxonomy and envelopes are separate axes joined by `sourceCategories`.
- **Supersedes:** finance-rules D2/D4 where the first matching rule wins and Category actions write taxonomy strings.
- **Supersedes:** nested-budget language that retains the taxonomy/envelope split; its group, bill-envelope, schedule, and hierarchy decisions continue unchanged.
- **Supersedes:** commitments-expected-vs-income D6 only where the organizational field is
  called Category; it is now Group. Its totals, export, grouping, and Review behavior remain.

## Summary

The budget envelope UUID becomes the transaction's single Actual-style Category. The old
fixed reporting taxonomy is retired: its durable meaning moves into case-sensitive `#tags`
stored in Notes, while commitment categories remain only as organizational Group names.
Balanced reports group by the one Category; tags filter and drill without double-counting.

Actual's transaction workflow is authoritative: Budget links to a filtered Uncategorized
Register, the Category cell says **Categorize**, a selection chooses a budget category, and
3-of-the-latest-5 payee history can create or update an exact-payee category rule.

## Decisions

1. `finance_transactions.budget_category_id` is the category value. Manual choices and rules
   write the same field; there is no automatic-vs-override shadow column.
2. Tags are Notes tokens matching `/(?<!#)#([^#\s]+)/g`. They are case-sensitive, allow
   multiple values, and use `##` for a literal hash. Metadata is separate; deleting metadata
   never edits Notes, and tags cannot be renamed.
3. Rules apply every match in visible order. Later actions win per scalar field; Add tag
   actions union idempotently. Category actions store owned envelope UUIDs.
4. Category learning is per payee, on by default: within Actual's 180-day window, one non-null
   category must occur at least three times in the latest five and an edited row must be in
   that five. Learning updates exact-payee setters or creates one last.
5. On-budget transfers between on-budget accounts have no category and are excluded from the
   Uncategorized count. The on-budget side of an off-budget transfer does require one.
6. Additive Insights group by category UUID and display the hierarchy-qualified name. Tags
   are OR within their filter dimension and AND with other filters; there are no tag-total
   charts that can double-count one transaction.
7. Legacy category slugs use NFKD lowercase kebab form, replace `&` with `and`, and collapse
   punctuation. `Rent & Housing` becomes `#rent-and-housing`.
8. An unresolved legacy rule keeps Add tag, loses Set category, and is durably marked for
   review. The cutover never invents an envelope.

## Implementation tasks

### 1. Spec package

Save this plan, shaping notes, full standards, references, and the supplied Actual Tags
visual before product code changes.

### 2. Schema and cutover

Add tag metadata, payee learning, rule review state, and per-user cutover audit state. Ship
an idempotent preview/apply cutover that preserves existing category IDs, maps null rows only
when the legacy mapping is unique, writes legacy tags without damaging Notes, converts rules
and commitment/payee declarations, and records unresolved rules. Destructive removal of the
legacy storage is a separately gated follow-up after every environment is backed up and
reconciled.

### 3. Rules and learning

Change Category actions to envelope UUIDs, add idempotent Add tag, compose all matching rules,
and extend previews with all matches and per-field attribution. Imports run rules on new rows;
existing rows change only through direct edit or an explicit previewed Run rules operation.

### 4. Tags and Register

Add `/finances/tags` with add/discover/color/description/hide/delete/view-transactions. Extend
the shared grid for multi-valued tag filters. Render clickable tag pills and `#` autocomplete.
Replace Category + Envelope with one Category picker and add Uncategorized/tag deep-link views.

### 5. Budget, Commitments, and Insights

Remove taxonomy auto-map controls and behavior. Rename commitment Category to Group and remove
charge reclassification. Move Category charts, trends, Sankey, filters, and drills to budget
category IDs; add tags as a shared Insights filter.

### 6. Verification and freeze — complete

Run unit, live database, lint, typecheck, build, smoke, and real desktop/phone browser checks.
Record material changes and final cutover counts, then freeze this folder as the as-built
record.

## Acceptance criteria

- [x] Clicking Budget's uncategorized count opens the Register filtered to the exact same eligible rows.
- [x] An eligible null Category cell says Categorize and assigns an owned budget category.
- [x] A third matching category among the latest five produces visible learning feedback and an exact-payee rule.
- [x] Tags support Actual syntax, metadata management, autocomplete, pills, exact filtering, and transaction deep links.
- [x] Multiple matching rules compose in visible order and repeated runs never duplicate tags.
- [x] Legacy assignments survive; legacy classifications become tags; unresolved mappings are reviewable; no envelope is created.
- [x] Commitments Group no longer reclassifies charges.
- [x] Category reports balance even when transactions have several tags.
- [x] Every new database surface proves second-user read/change/delete isolation.

## Out of scope

Tag-grouped additive totals, tag renaming, a relational transaction-tag join table, a global
learning toggle, split transactions, surprise envelope creation, and new bank-category
classification.

## Changes from original plan

| #   | Change                                                                                                                                                  | Why                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kept the legacy taxonomy columns, preset claims, and automatic-map implementation in place but removed them from the current UI and ingestion workflow. | The plan's destructive-cleanup gate requires every deployed environment to be backed up and reconciled first. Migration receipts make that later removal auditable without risking an irreversible production cutover. |
| 2   | Rendered Tags as a dense editable table on desktop and stacked management cards on phones.                                                              | Inline table controls became unreadable at the app's 390 px phone target; the card layout preserves every management action without horizontal page overflow.                                                          |
| 3   | Took import rule watermarks from PostgreSQL rather than the application clock.                                                                          | Database and JavaScript clocks can differ by milliseconds. One clock makes the “new rows only” boundary exact instead of relying on a tolerance that could touch a concurrent existing row.                            |
| 4   | Uncategorized uses effective Flow when excluding unpaired internal transfers.                                                                           | A direct or rule-owned Flow choice must have the same eligibility semantics as a derived Flow; using only the derived value exposed internal transfers in the browser backlog.                                         |
| 5   | Moved destructive removal of legacy taxonomy storage into a future delta-spec.                                                                          | The shipped workflow is complete and reconciled locally; production backup and receipt reconciliation remain prerequisites for an irreversible cleanup, not for using Categories and tags.                             |

## Verification

- Local cutover receipt: 4,798 tagged transactions, 4,799 mapped Category assignments,
  and 0 unresolved rules.
- `npm run test:unit`: 286 files, 3,339 tests passed.
- `npm run test:integration`: 54 files, 880 tests passed against PostgreSQL.
- Lint, typecheck, production build, and the 63-route smoke suite passed.
- Desktop Uncategorized Register and phone Tags management were inspected in a real browser.

## Status (closed)

Shipped and verified 2026-08-23. The additive cutover is the accepted as-built boundary for
this release.

## Follow-ups (new work — not amendments to this frozen spec)

- After every deployed environment has a backup and reconciled cutover receipt, open a new
  delta-spec to remove the legacy transaction taxonomy columns, fixed classifier code,
  `sourceCategories`, preset claims, and dormant automatic-map implementation.
