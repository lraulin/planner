# Sections are a property of the envelope, not of its group

**Status: active**
Spec folder: `agent-os/specs/2026-08-24-0930-envelope-sections/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — the Budget page's section
  layout and the `kind` discriminator it put on `finance_budget_categories`.
- **Supersedes:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — the decision to keep
  `is_income` on the group "as Actual does"; and
  `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/` — "groups are purely
  organisational" now holds without exception, because the one structural fact they still
  carried moves off them.

## Context

`one-budget` split the page into Income / Bills / Regular spending. Building it surfaced that
**the same question is answered three different ways**:

| Section | Decided by                                            |
| ------- | ----------------------------------------------------- |
| Income  | `finance_category_groups.is_income` — a group flag    |
| Bills   | `finance_budget_categories.kind` — an envelope column |
| Savings | nothing at all                                        |

That is the "two workarounds for one missing concept" signal in
`agent-os/standards/development/clean-code.md`. The concept is **which section an envelope
belongs to**, and `kind` is already most of it.

It bites twice in practice. The seeded "Income" and "Spending" groups **cannot be deleted**,
because income-ness has nowhere else to live — the user asked to remove them and cannot. And
savings has no home at all, so a large transfer into a house fund lands inside "All spending"
and reads as a five-thousand-dollar overspend against income.

## Decisions

**D1 — `kind` is the section.** `finance_budget_categories.kind` becomes
`income | spending | bill | savings`. `'envelope'` renames to `'spending'`: every row here is
an envelope, so the supertype's name cannot also mean one of its four cases.

**D2 — `is_income` retires from groups.** Groups become purely organisational containers at
any depth, _inside_ whatever section their envelopes belong to, and they are **optional**.
The sections (Income, Bills, Regular spending, Savings) are the top level — the equivalent
of Actual's only allowed group layer. An envelope with `group_id` null sits directly in its
section. Groups exist only if the user wants subtotals inside a section. A group whose
envelopes span sections renders in each — the UI stops that from being created rather than
the schema forbidding it, because the constraint spans rows and a CHECK cannot express it.

**D3 — Savings is a peer of Spending, not a child.** Four top-level sections: Income,
Spending (holding Bills and Regular spending), and Savings. "All spending" stays
bills + regular so it remains comparable with income; Savings carries its own subtotal. This
is the whole reason Savings is being split out, so it must not be folded back into that sum.

**D4 — Savings is an ordinary envelope in every other respect.** It takes assignments, has
activity and a balance, and participates in templates and Ready to Assign. Only its section
and its exclusion from the spending total differ. Nothing about the envelope arithmetic
changes — that stays Actual's.

**D5 — Migration derives, then the user corrects.** `kind` backfills to `income` from the
group flag and `spending` otherwise. Nothing guesses a savings envelope from its name: the
section is set through the UI, and this file's own "Savings" envelope is moved by a recorded
one-off data step rather than by a name rule baked into code.

## Acceptance criteria

- [ ] `finance_category_groups.is_income` is gone from the schema and every reader.
- [ ] An envelope's section comes from `kind` alone, on the page and in the fold.
- [ ] The seeded "Income" and "Spending" groups can be deleted without losing a section.
- [ ] An envelope can have no group. Tracking a bill does not require creating one, and does
      not invent Spending / Bills.
- [ ] Four sections render: Income, Spending (Bills + Regular spending), Savings.
- [ ] "All spending" is bills + regular only; Savings is excluded and totalled separately.
- [ ] An envelope's section can be changed from the UI, and creating one picks a section.
- [ ] Ready to Assign, carryover and cover-overspending are unchanged for every existing row —
      verified against the real file's figures before and after.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:unit` (Postgres up), `npm run build`,
      and `npm run smoke` all pass.

## Changes from original plan

| #   | Change                                                                                                                                             | Why                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `isIncome` remains a derived field on category/row types (`kind === "income"`), rather than being deleted from the fold, auto-map and apply engine | Those modules already keyed off a boolean; changing the source of the boolean is the model correction, rewriting every caller to branch on `kind` is not                       |
| 2   | The structure drawer's section picker is Income / Spending / Savings. A bill is still created from Review, not by picking `bill` here              | Creating a bill requires a cadence, which the blank-envelope form does not collect                                                                                             |
| 3   | One-off: `0f8193f0-a01c-42c9-bd82-9865c67c5dca` (Savings, `test@example.com`) set to `kind = 'savings'`. Assigned was 0; Ready to Assign unchanged | D5: do not bake a name rule into the migration. The local file's Savings envelope is the one this spec named                                                                   |
| 4   | Declaring a bill no longer creates `Spending › Bills`. Review stays open after Track / Dismiss.                                                    | Groups are organisational (D2). Recreating the seeded containers after the user deleted them, and closing Review after every accept, fought the work of going through the list |
| 5   | `group_id` is nullable. A new bill (and a new envelope from the structure drawer at the root) has no group. Sections are the top level.            | "Create a group before adding a bill" was the leftover of required groups. Actual's top-level groups _are_ our sections; further grouping is optional                          |

---

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Schema and migration

`ENVELOPE_KINDS` → four values; `kind` default becomes `'spending'`; the bill-facet CHECK
keys off `kind <> 'bill'` instead of `kind = 'envelope'`. Drop
`finance_category_groups.is_income`.

Migration order matters: relax the `kind` CHECK **before** rewriting values, backfill
`spending` then `income`, then drop the column and reset the default.

## Task 3: Domain

`queries.ts` derives `isIncome` from `kind`; `rows.ts` gains a savings section and
`budgetSections` returns four; `presets.ts` carries a `kind` per preset category instead of
`isIncome` per group; `autoMap.ts`, `apply.ts`, `envelope.ts` callers and `seedBudget` all
read `kind`. Pure modules keep their tests beside them.

## Task 4: UI

Four sections on `/finances/budget`, Savings with its own subtotal and outside "All
spending". `BudgetStructureDrawer` loses the group income checkbox and gains a section on
envelope create and edit.

## Task 5: Verify, freeze, roadmap

Full gate plus `npm run smoke`. Diff the real file's Ready to Assign and per-envelope
balances before and after. Freeze **only after the page has been used**, not on the
implementer's own say-so — the mistake `one-budget` made.
