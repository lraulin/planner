# Retire Tags and the Legacy Category Column

**Status: active**
Spec folder: `agent-os/specs/2026-09-02-1050-retire-tags-and-legacy-category/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` — decision 2
  (tags as case-sensitive Notes tokens with separate metadata), decision 6 only where tags are
  a filter dimension in Insights, and the standing deferral in its task 2 that destructive
  removal of the legacy storage is a gated follow-up. **This spec is that follow-up.** Its
  decisions 1 and 5 — the budget envelope UUID is the one transaction Category, transfers
  between on-budget accounts have none — carry forward unchanged.
- **Supersedes:** `agent-os/specs/2026-08-21-1403-commitments-expected-vs-income/` — nothing.
  Listed only because it cites the tags spec; its totals, export, and grouping stand.
- **Extends:** `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` — payee
  auto-category already superseded the rule engine that owned the `add-tag` action. This spec
  removes the last fixture still referencing it.

## Context

Tags were added because Actual Budget has them, and because they looked like a safe place to
park the retired reporting taxonomy during a transitional period when we were not yet ready
to let go of the old system. Every bill is now its own envelope Category, which is poor for
reporting, and tags were meant to fill that gap.

They do not. The old transaction-type categories were **mutually exclusive**; tags are
explicitly **not**, which is their defining feature. A non-exclusive label set is the wrong
shape for the reporting axis it was standing in for. Groups are the right shape, and they
already exist.

Meanwhile the general-purpose half of the feature has no user. The live database confirms it:

- **22 tag rows, every one a migration artifact.** Every description reads
  `Migrated from legacy category "…"`. Zero user-created tags.
- **4,798 transactions carry a `#tag` in Notes.** 4,797 of them have _nothing else_ in the
  note — the note is only the migrated token. Exactly one has real text:
  `baby stuff #shopping`.
- **`finance_transactions.category` is null on all but 1 row.** The Notes tokens are the last
  surviving copy of the old taxonomy, and it is not wanted.
- **`finance_category_cutovers` is declared in `schema.ts` and referenced by no code at all.**
- **The rule engine that owned `add-tag` no longer exists** — no `finance_rules` table, no
  rules UI. Only a stale fixture in `payees/autoCategory.test.ts` still mentions the action.

The roadmap already anticipated this work. The Actual Categories and Tags entry ends:
_"Destructive removal of the compatibility storage is a future audited delta."_

## Decisions

1. **Tags go entirely** — metadata table, page, Register column and pills, drawer adder and
   `#` autocomplete, `tag` register view and deep link, Insights filter dimension, and the
   `src/lib/finances/tags*` modules. This is a removal, not a deprecation; nothing is left
   behind "in case".
2. **Notes are scrubbed of the 22 migrated tokens by name, not by a blanket `#`-token
   regex.** Slower to write, but the migration file then _is_ the permanent record of exactly
   which strings were deleted from user-authored text. For a one-way destructive change to
   content, that record is worth more than brevity. 4,797 notes become empty; `baby stuff
#shopping` becomes `baby stuff`.
3. **`finance_transactions.category` and `finance_category_cutovers` are dropped in the same
   migration.** All three artifacts are the same compatibility storage from the same cutover;
   splitting them across specs would leave the cutover half-retired with no one able to say
   which half.
4. **Insights keeps Accounts / Categories / Merchants.** Removing the Tags filter leaves a
   reporting gap that groups should fill, but group-based reporting gets its own spec and is
   shaped on its own merits rather than bolted onto a deletion.
5. **`finance_transactions.source_category` is untouched.** That is what the bank called the
   row, it is never user-edited, and import still depends on it. Different concern.
6. **Historical audit rows keep their `category` JSON.** They are a record of what happened
   at the time; rewriting them would be falsifying history. Only the live column and the
   code that writes it go.

## Acceptance criteria

- [ ] `/finances/tags` returns 404; the navigation registry has no Tags entry; `npm run smoke`
      passes against the reduced route set
- [ ] The Register has no Tags column, no tag pills, no `?tag=` deep link, and no `tag` view
- [ ] The transaction drawer has no tag adder and no `#` autocomplete
- [ ] Insights filters are Accounts / Categories / Merchants
- [ ] `finance_tags`, `finance_category_cutovers`, and `finance_transactions.category` no
      longer exist in the database or in `schema.ts`
- [ ] `effectiveCategory()` has no legacy-string fallback branch, and its tests reflect that
- [ ] No note contains a migrated tag token; the one real note still reads `baby stuff`
- [ ] `grep -rE "tagsInNotes|addTagToNotes|normalizeTagInput|financeTags|add-tag" src` returns
      nothing
- [ ] `npm test` passes with the integration project actually running (no skip warning),
      alongside typecheck, lint, and `next build`

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, and `references.md`. No visuals
were supplied.

## Task 2: The migration

One **generated** Drizzle migration — never hand-written without its snapshot — that, in order:

1. Strips the 22 named tags from `finance_transactions.notes`, enumerating them literally in
   the SQL, and trims the resulting whitespace so an emptied note is `''` rather than `' '`.
2. Drops `finance_tags`.
3. Drops `finance_category_cutovers`.
4. Drops `finance_transactions.category`.

Remove all three from `src/db/schema.ts`.

Expected effect on current data: 4,798 notes rewritten, 4,797 to empty. Record the actual
counts in **Changes from original plan** if they differ.

## Task 3: Delete the tag modules and page

- `src/lib/finances/tags.ts` and `tags.test.ts`
- `src/lib/finances/tags/{queries,mutations,mutations.integration.test}.ts`
- `src/app/finances/tags/` and `src/components/finances/tags/`
- The tag action exports in `src/app/finances/actions.ts`
- The `listFinanceTags` case in `src/lib/db/crossUserReads.integration.test.ts`
- The Tags entry in `src/lib/navigation/pages.ts`

## Task 4: Strip tags from the Register and drawer

- The `tags` column in `financeColumns.tsx`
- The `tags` field in `registerFields.ts`, **including its `filterKind: "tags"` — check first
  whether any other field uses that filter kind.** If something else needs multi-valued
  filters the kind stays and only the tags field goes.
- The `tag` view id, `asTag`, and deep-link plumbing in `registerQuery.ts` and `FinancesView.tsx`
- `tagsInNotes` in `queries.ts` and `dashboardQueries.ts`
- `tags` off `AnalyticsRow` (`analytics.ts`) and `types.ts`, and out of the affected fixtures
- The drawer's Tags section in `TransactionDrawer.tsx`, plus the `managedTags` prop chain
  from `register/page.tsx` down

## Task 5: Strip tags from Insights

The `tags` field on the filter type, its predicate in `insightsFilter.ts`,
`insightsFilterOptions.tags`, and both Tags chip groups in `InsightsView.tsx`.

## Task 6: Remove the legacy category column's readers

- The `row.category` fallback branch in `effectiveCategory()` (`analytics.ts`)
- `category` in `TRANSACTION_AUDIT_COLUMNS`, `transactionAuditFields`, and the reclassify
  audit payload in `mutations.ts`
- The `category` writes and assertions in `import.integration.test.ts`,
  `mutations.integration.test.ts`, and `reclassify.integration.test.ts`
- The stale `{ op: "add-tag" }` fixture in `payees/autoCategory.test.ts`

## Task 7: Verify

`npm test` (both projects — **confirm the integration suite ran rather than skipped**),
typecheck, lint, `next build`. Then start the dev server and run `npm run smoke`, because a
green gate does not prove the app renders. Finally open the Register, the drawer, and Insights
in a browser and confirm no orphaned `#` text and no empty filter chips.

## Task 8: Verify, freeze spec, update roadmap

- Confirm every acceptance criterion
- Update plan/shape for material as-built drift; complete **Changes from original plan**
- Mark files **Status: frozen / complete** (date); list follow-ups as new work
- Amend the `✅ Actual Categories and Tags shipped 2026-08-23` roadmap entry: its closing
  sentence about a future audited delta now names this spec, and the tag-scrub counts are
  recorded as built. Note that group-based reporting remains open.

---

**Standing rule while this spec is active:** when a material change to requirements, design,
or scope appears — including feedback on what was actually built — update the relevant
sections and append a row to **Changes from original plan**. Skip pure implementation
details. Freeze when verified.
