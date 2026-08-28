# A group belongs to a section

**Status: active**
Spec folder: `agent-os/specs/2026-08-28-1613-group-kind/`
Standards pinned at: `b48a3649baaa98c551b6ee2aac18d0d0166ac322`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-28-1527-inline-budget-structure/` — this is the model
  correction that spec's implementation exposed, and its acceptance criteria depend on it.
- **Supersedes:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — its D1 note that "a
  group whose envelopes span sections is prevented by the UI, not the schema". The schema
  states it now.
- **Supersedes:** `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/` — only
  the rule that a group's section is **derived from its members**. Arbitrary depth, recursive
  totals, empty-only delete and "groups hold no money" all stand; a child group must now
  match its parent's `kind`.

## Context

`finance_category_groups` has no section. Which of the four budget tables a group belongs to
is recomputed at read time from the kinds of the envelopes inside it — `groupPageSection`
(`hierarchy.ts:221`) walks every descendant envelope and returns `income | spending | savings
| mixed | null`.

**An empty group therefore has no section, and renders nowhere.** `nestedBudgetGridRows`
drops any group whose visible envelope count is zero (`hierarchy.ts:198`), which was
invisible while `BudgetStructureDrawer` existed — the drawer listed groups directly, so an
empty one was still reachable there. `2026-08-28-1527-inline-budget-structure` deleted the
drawer and moved structure editing onto the tables, and the hole became load-bearing:

- `+ Group` creates a group that cannot be seen, added to, or deleted.
- A group is **stranded** the moment its last envelope leaves — it disappears from the page
  exactly when it becomes eligible for deletion. "Only an empty group may be deleted" is
  therefore unreachable: no group can ever be deleted through the UI.

Observed on real data, not reasoned about: creating a bill in a new group, then deleting the
bill, left `Subscriptions` in the database with no surface anywhere in the app.

This is the signal `clean-code.md` names — **a fact recomputed at read time because nothing
stores it** — and the second workaround for it is `sectionGridRows` hiding a lone root header
(`rows.ts:186`), which exists because the seeded preset groups are chrome that says nothing
the section headings do not already say.

**The seeded groups are the proof.** `presets.ts` seeds a group literally named `Spending`
holding Bills, Recurring spend, Discretionary **and** Savings — three different sections in
one group, invisible in the UI because it is the lone root header. It predates
`envelope-sections` making `kind` the section, and it is chrome the page no longer needs.

**Intended outcome:** a group states which section it is in. Every group is visible in
exactly one table, empty or not; the seeded chrome groups are gone; and the section rules
that four call sites derive separately become one column comparison.

## Decisions

**D1 — `finance_category_groups.kind` is an `EnvelopeKind`, not null.**
Four values, not the three page sections: the page renders **four** tables, and Bills is its
own. A group belongs to exactly one of them. This is what the user wants groups for — "I only
use groups for bills" — and a bill group and a regular-spending group are different things.

**D2 — An envelope's `kind` must equal its group's `kind`.**
Enforced in `createBudgetCategory` and `updateBudgetCategory`, replacing the
`groupPageSection`-derived guard (`budget/mutations.ts:588-604`). Changing an envelope's
section while it sits in a group **moves it to that section's root** (`groupId = null`)
rather than refusing: the user asked for a section change and the group cannot hold it, so
refusing would make Change section fail with no way forward. A cross-table CHECK cannot state
this, so it is a mutation guard and gets an integration test.

**D3 — A child group must match its parent's `kind`.** Nesting is otherwise unchanged.
Whether nesting is still earning its keep — the user's observation that separate envelope
kinds removed the reason YNAB needed it — is deliberately **out of scope** and left to a
future spec.

**D4 — Groups whose members disagree are dissolved by the migration.**
The group is deleted and its envelopes move to their own section root. Not "the majority kind
wins": the only such groups in existence are the seeded chrome ones, they are invisible today,
and dissolving them leaves the page pixel-identical while leaving a clean slate. An **empty**
legacy group is dissolved too — it has no members to infer a kind from, and by definition
nobody can currently see it.

**D5 — The presets stop seeding groups.** `kind` is the section; a group named `Income`
holding the income envelope, or `Spending` holding everything else, repeats the section
heading. Preset envelopes land at their section root. This is what `sectionGridRows`' lone-
root-header rule was already faking.

**D6 — `sectionGridRows` keeps empty groups, and filters groups by `kind`.**
Each table is handed only its own groups, and a group with no envelopes still renders its
header — that is the whole point. The lone-root-header suppression in `sectionGridRows`
(`rows.ts:186`) is **removed**: with D5 there is no chrome group left to suppress, and the
rule would now hide a real group the user made and needs to reach.

**D7 — `groupPageSection` is deleted.** Its four callers read `group.kind` instead:
`resolveBudgetDrop`, `moveDestinations`, `updateBudgetCategory`, and the drawer (already
gone). `moveDestinations` becomes kind equality plus the descendant refusal — the `mixed` and
`null` cases it had to reason about cannot occur any more.

### Out of scope

- Removing nesting (D3).
- Group `hidden`, which still has no UI.
- Any change to budget arithmetic. No figure on the page moves.

## Acceptance criteria

- [ ] `+ Group` on a section creates a group that appears immediately, empty, with its `+`
      and `⋮`.
- [ ] Deleting a group's last envelope leaves the group on screen, and its `Delete…` is now
      enabled.
- [ ] A group created under Bills appears only in Bills; one created under Savings only in
      Savings.
- [ ] `Move to group…` offers only groups of the moving item's own kind, and never a
      descendant of a moving group.
- [ ] `Move up` / `Move down` reorder a **root-level** envelope against its own section's
      neighbours, not whatever shares its null parent.
- [ ] Changing an envelope's section while it is in a group moves it to that section's root
      and leaves a legal row.
- [ ] A fresh `seedBudget` creates no groups, and the page renders the same five envelopes in
      the same three tables.
- [ ] The migration dissolves the seeded `Spending` and `Income` groups on existing data,
      moving their envelopes to their section roots, and deletes nothing else.
- [ ] `groupPageSection` no longer exists; nothing references it.
- [ ] lint, typecheck, `npm test` (unit **and** Postgres integration, no skip warning),
      `next build`, `npm run smoke`.

## Changes from original plan

| #   | Change                                                                                                                                                                                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **D5 narrowed: the presets stop seeding groups that _name a section_, not all groups.** `minimal` now seeds none; `detailed` keeps `Home`, `Everyday`, `Enjoyment` and `Obligations` as `spending` groups. | D5 was written from `minimal`, whose only groups are `Income` and `Spending`. `detailed`'s groups organise _within_ Regular spending and say something the section heading does not — deleting them would have removed the only real grouping the app ships.                                                                                                                                                          |
| 2   | **The migration dissolves income groups too, whatever their kind.**                                                                                                                                        | The Income section is a plain list, not a grid (`one-budget` D7), so it has no group chrome and gets none here. Without this the seeded `Income` group survives the migration into exactly the stranded state this spec exists to remove: legal, invisible, undeletable.                                                                                                                                              |
| 3   | **`seedBudget`'s "already set up" check moved from groups to envelopes.**                                                                                                                                  | A preset may now seed no groups at all, so checking groups would have let `minimal` be seeded repeatedly.                                                                                                                                                                                                                                                                                                             |
| 4   | **`budgetGridRows` deleted** rather than updated.                                                                                                                                                          | It was a one-line pass-through to `sectionGridRows` with no production caller — only its own test.                                                                                                                                                                                                                                                                                                                    |
| 5   | **`budgetSiblings` added: root-level sibling order is per-section.** `resolveBudgetDrop`, `moveBudgetStructureItem` and the row menu use it.                                                               | Found driving the page: Move up on a root-level bill did nothing. The four tables share one `parent_group_id IS NULL`, so an unfiltered sibling list interleaved a bill with a savings envelope and the move aimed at a row in another table, which `resolveBudgetDrop` then correctly refused. Root-level envelopes were rare while every one lived in a seeded section group; this spec makes them the normal case. |

---

## Task 1: Save spec documentation

## Task 2: Schema and migration

`src/db/schema.ts` — `financeCategoryGroups.kind`, `text` over `ENVELOPE_KINDS`, not null.

`drizzle/00XX_group_kind.sql` — add the column nullable; set it from the single distinct
`kind` of each group's **direct and descendant** envelopes; dissolve every group left null or
disagreeing (envelopes' `group_id` to null, then delete the group, deepest first so the
`restrict` FK is satisfied); then set not null.

## Task 3: Domain

`hierarchy.ts` — delete `groupPageSection`; `moveDestinations` and `resolveBudgetDrop` compare
`kind`. `nestedBudgetGridRows` keeps zero-count groups.

`rows.ts` — `sectionGridRows` takes the section's `kind`, filters groups by it, and loses the
lone-root-header suppression.

`budget/mutations.ts` — `createCategoryGroup` takes `kind` and validates it against its
parent; `createBudgetCategory` validates envelope kind against the group; `updateBudgetCategory`
clears `groupId` when the new kind no longer matches.

`presets.ts` — a preset entry is a group _or_ a run of root-level envelopes, and carries one
`kind` for itself and everything in it. See Changes row 1.

Tests: `hierarchy.test.ts` and `rows.test.ts` for the pure rules; integration for the guard,
the section-change eviction, and the second-user case on `createCategoryGroup`'s new argument.

## Task 4: UI

`BudgetView.tsx` — `openComposer` passes the section's kind to `createCategoryGroupAction`;
`sectionGridRows` calls pass their kind. `groupChromeFor` no longer needs its `kind` argument
threaded from the call site — it can read `group.kind`.

## Task 5: Verify and freeze

Full gate plus the browser pass in `2026-08-28-1527-inline-budget-structure` Task 6, which
this unblocks. Freeze both specs together only after the page has been used.
