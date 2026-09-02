# References for Retire Tags and the Legacy Category Column

## Governing specs

### `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/`

- **Relationship:** Supersedes decision 2, decision 6 (only where tags are an Insights filter
  dimension), and the task 2 deferral of destructive removal.
- **What it decided:** The budget envelope UUID became the single transaction Category. The old
  fixed reporting taxonomy's durable meaning moved into case-sensitive `#tags` stored in Notes
  (`/(?<!#)#([^#\s]+)/g`, `##` for a literal hash), with presentation metadata in a separate
  `finance_tags` table whose deletion never edits Notes.
- **What carries forward:** Decision 1 — `budget_category_id` is the category value, with no
  automatic-vs-override shadow column. Decision 5 — on-budget transfers have no category.
- **The sentence this spec acts on:** _"Destructive removal of the legacy storage is a
  separately gated follow-up after every environment is backed up and reconciled."_
- **Its migration:** `drizzle/0069_majestic_thunderbolt_ross.sql` is the cutover being undone.
  It created `finance_tags`, appended the slugified legacy label to each transaction's Notes,
  and seeded the 22 metadata rows with `Migrated from legacy category "…"` descriptions. Read
  it before writing the new migration — the slug rules there (NFKD lowercase kebab, `&` → `and`)
  are what produced the exact 22 strings to remove.

### `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

- **Relationship:** Extends.
- **Relevant:** Payee auto-category superseded the tags spec's decisions 3, 4, and 8 —
  later-match rule composition and category learning. That is why no `finance_rules` table or
  rules UI exists today, and why the `add-tag` action survives only as a fixture in
  `src/lib/finances/payees/autoCategory.test.ts`.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Neither extends nor supersedes; cites the tags spec.
- **Relevant:** Established groups and bill envelopes as the budget hierarchy. This is the
  structure that should carry reporting once a follow-up spec gives Insights a Group dimension.

### Also citing the tags spec (no decisions affected)

`2026-08-29-2206-ready-to-assign-derivation/`, `2026-08-28-1356-budget-activity-register-links/`,
`2026-08-25-0922-grid-checkboxes-bulk-category/`, `2026-08-21-1403-commitments-expected-vs-income/`.
Checked; none depend on tags.

## Code to remove

| Location                                                                            | What                                                          |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/lib/finances/tags.ts`, `tags.test.ts`                                          | `tagsInNotes`, `addTagToNotes`, `normalizeTagInput`           |
| `src/lib/finances/tags/`                                                            | `queries.ts`, `mutations.ts`, `mutations.integration.test.ts` |
| `src/app/finances/tags/page.tsx`                                                    | The route                                                     |
| `src/components/finances/tags/TagsView.tsx`                                         | The page's view                                               |
| `src/app/finances/actions.ts:149-150`                                               | Tag mutation/query exports                                    |
| `src/lib/navigation/pages.ts:286-292`                                               | The Tags nav entry                                            |
| `src/components/finances/financeColumns.tsx:268-290`                                | Tags column and pills                                         |
| `src/lib/finances/registerFields.ts:19,35,91-96`                                    | `tags` field and `filterKind: "tags"`                         |
| `src/lib/finances/registerQuery.ts:42,46,102,110,136-137,229,294-295`               | `tag` view, `asTag`, filter                                   |
| `src/components/finances/FinancesView.tsx:87,110,249-364,521-522,796,862`           | Deep link, colors, `managedTags`                              |
| `src/components/finances/TransactionDrawer.tsx:21,38-49,73,104-114,132,161,204-240` | Tag section                                                   |
| `src/lib/finances/insightsFilter.ts:26,33,75-80,171-190`                            | Tags filter and options                                       |
| `src/components/finances/insights/InsightsView.tsx:188,234-247,330-358`             | Both Tags chip groups                                         |
| `src/lib/finances/queries.ts:17,342`, `dashboardQueries.ts:40,140`                  | `tagsInNotes` calls                                           |
| `src/lib/finances/analytics.ts:81`, `types.ts:264`                                  | `tags?: string[]`                                             |
| `src/lib/db/crossUserReads.integration.test.ts:62`                                  | `listFinanceTags` case                                        |
| `src/db/schema.ts:3076-3117`                                                        | `financeTags`, `financeCategoryCutovers`                      |
| `src/db/schema.ts:2202`                                                             | `finance_transactions.category`                               |
| `src/lib/finances/analytics.ts:124-127`                                             | `effectiveCategory` legacy fallback                           |
| `src/lib/finances/mutations.ts:101,122,224,229`                                     | `category` in audit columns and payload                       |
| `src/lib/finances/payees/autoCategory.test.ts:244`                                  | Stale `add-tag` fixture                                       |

## Similar implementations

### The cutover this reverses

- **Location:** `drizzle/0069_majestic_thunderbolt_ross.sql`
- **Relevance:** The pattern to mirror in reverse — a single migration doing a guarded,
  idempotent text rewrite of `notes` alongside schema changes.
- **Key patterns to borrow:** Its `notes ~ '(^|[^#])#' || tag || '($|[[:space:]#])'` guard is
  the right shape for matching a token without matching a `##` escape or a prefix collision.
  Reuse that boundary expression rather than inventing one.

### A prior column drop from the same family

- **Location:** `drizzle/0075_payee_auto_category.sql:111` —
  `ALTER TABLE "finance_transactions" DROP COLUMN "derived_category";`
- **Relevance:** The sibling column was already dropped this way, after its readers were
  removed first. Same sequence applies to `category`.
