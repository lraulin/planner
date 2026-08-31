# Category picker on every remaining chooser

**Status: active**  
Spec folder: `agent-os/specs/2026-08-30-1331-category-picker-everywhere/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-26-1151-category-picker-typeahead/` — typeahead combobox, Budget tree order, filter, closed field shows the envelope name, no mint-from-text.
- **Extends:** `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/` — Register (and other filing surfaces) still list hidden envelopes, marked `(hidden)`, so history can be filed into a retired category.
- **Supersedes:** that pair’s “Payees learned/fixed `SelectField`, Supplies, and Move money stay as they are” / “out of scope” surface list. A flat dropdown is never the right chooser once the list is long.
- **Supersedes:** `2026-08-29-1605-hidden-categories-in-picker` “one shared `CategorySelect`, no per-surface filter” **only for destination catalogs**. Filing still shows hidden. Moving this month’s dollars does not. Visibility is the catalog the caller passes, not a `showHidden` prop on the control.
- **Extends:** `agent-os/specs/2026-08-24-1311-budget-assign-options/` D8 — Assign → Manually `To` still omits Income and does not open the auto-assign preview.
- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` and `2026-08-24-1522-category-by-kind-and-history/` — learned/fixed auto-category still lives on the payee; only the chooser control changes.
- **Extends:** `agent-os/specs/2026-08-26-0910-supplies-worksheet/` D3 — `envelope_id` is still a nullable FK; Supplies still does not create envelopes.

## Context

The typeahead is the Register Category cell. Four remaining choosers are still a flat `<select>` / `SelectField`: Move money **To**, Assign → Manually **To**, Payees learned/fixed Category, Supplies **Funded from**. HTML cannot nest `<optgroup>`, so those lists cannot match Budget. Finding one envelope among fifty is a search, not a scroll.

Whether the four surfaces share one React component is an implementation detail (DRY says yes). The product rule is: a flat, unordered dropdown is never the right choice for this list.

Create rows stay off here. Register still has **New {type}…**. Budget can mint envelopes on the page itself; Payees and Supplies are not a create surface.

Hidden means two different jobs:

- **Filing** (Register, and Payees learned/fixed): a retired envelope still has history. Wedding savings, cancelled App Store subscriptions that were never worth a bill — those charges still need a Category. Hidden stays in that list, marked.
- **Moving this month’s dollars** (Move money, Assign Manual): hidden means inactive, not currently in use for budgeting. Do not offer those destinations. Unhide first if you want to fund them. This does **not** follow the Budget Show Hidden switch.

## Decisions

- **Typeahead with Budget tree order everywhere a category is chosen.** No remaining native `<select>` / `SelectField` of envelopes.
- **One `CategorySelect` with variants as props**, not a second combobox. Catalog-as-filter is how surfaces differ.
- **No create rows** on the four new surfaces (`onCreate` omitted). Empty types then drop — Move money will not show a bare Income heading.
- **Register is unchanged:** create sentinels, empty commit uncategorises, placeholder “Categorize”, hidden envelopes stay marked.
- **Required vs clear.** Move money and Assign Manual cannot uncategorise: empty draft restores the previous destination (`allowClear: false`). Payees and Supplies stay nullable (placeholders “None” and “—”).
- **Catalog is the filter.** Callers pass the eligible envelopes.
  - Move money: `moveTargets` (non-income, not the source), then drop hidden envelopes and hidden-group descendants — same predicate as `nestedBudgetGridRows(..., { showHidden: false })`. Independent of the page’s Show Hidden switch.
  - Assign Manual: spending + bills + savings (Income omitted, D8), same hidden omit.
  - Payees: full catalog, including Income and hidden (a paycheck default is valid; a learned default of a retired Apps envelope is the filing job).
  - Supplies: non-income via `listBudgetEnvelopeOptions` (replace the flat `listSupplyEnvelopes` name list). Hidden stay marked — Funded from is a link, not a transfer of this month’s dollars.
- **Available amount only on Move money.** Envelope rows in that open list show `formatUsd(balanceCents)` right-aligned, tabular. Closed field stays the envelope **name**. Filter does not match the amount string. Assign / Payees / Supplies stay name-only.
- **Default destination** (Move / Assign) is the first remaining envelope in Budget tree order, not the old flat group-then-name sort.
- **Styling.** Dialogs pass the existing bordered `className`. Grid cells (Supplies) keep the transparent-border cell chrome. List is already portalled; Supplies must not clip.
- **Cover-from** stays a row-menu submenu of named sources. Out of scope.

## Acceptance criteria

- [ ] Move money **To** is the typeahead (Budget tree, typeahead, no New…, no Income, source omitted, no hidden, cannot clear). Open-list rows show Available; closed field is the name.
- [ ] Assign → Manually **To** is the same picker (no New…, no Income, no hidden, cannot clear, no Available suffix).
- [ ] Payees learned/fixed Category is the same picker (Income included, hidden marked, clearable to None, no New…).
- [ ] Supplies **Funded from** is the same picker (no Income, hidden marked, clearable to —, no New…). Grid cell list is not clipped.
- [ ] Register / drawer / splits / Set category still show New {type}…, still list hidden marked, and still clear Category on empty commit.
- [ ] `categoryPickerSections` / `commitCategoryPicker` unit tests cover `includeCreate: false` (no sentinels, empty types drop), `allowClear: false` (empty draft restores), `detail` is not a filter token, and the destination catalog omit of hidden / hidden-group descendants. No React component tests.
- [ ] lint, typecheck, `test:unit` (Postgres up), `next build`, `npm run smoke`. Driven in the browser: all four new surfaces plus one Register cell (create and hidden still present).

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                           | Why                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Task 2 (lib variants) shipped overnight 2026-08-30; Tasks 4–6 (the four surfaces) still open.                    | The catalog filter, `includeCreate: false`, `allowClear: false`, and `detail` not being a filter token are the invariants the UI will call. |
| 2   | Task 3: `CategorySelect` now accepts optional `onCreate`, `allowClear`, `placeholder`, and renders `row.detail`. | Register call sites unchanged.                                                                                                              |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-30-1331-category-picker-everywhere/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, review comments)
- **standards.md** — which standards apply, why, and any deviations (references, not copies)
- **references.md** — governing specs and reference implementations studied
- **visuals/** — none; the existing Register picker is the reference

Shaping stops here. Implementation begins at Task 2 in a fresh session.

## Task 2: Picker variants in lib

In `src/lib/finances/budget/groupEnvelopeOptions.ts`:

- `categoryPickerSections(..., query, { includeCreate = true })`. When false: no create rows; skip a type with no remaining envelopes.
- Optional `detail?: string` on `EnvelopePickerOption` / envelope rows. Filter still matches name / ancestor groups / type label only.
- `commitCategoryPicker` fourth arg `allowClear = true`. Empty draft + `allowClear: false` → `{ action: "restore" }`.
- A small catalog filter that drops hidden envelopes and hidden-group descendants with the same predicate as `nestedBudgetGridRows(..., { showHidden: false })`. Destination callers use it; Register / Payees do not. Do not add a `showHidden` prop to `CategorySelect`.
- Existing tests keep passing with the create-on default.

## Task 3: `CategorySelect` variants

- `onCreate?` — omitted means no create rows.
- `allowClear?: boolean` (default true).
- `placeholder?: string` (default `"Categorize"`).
- Render `row.detail` on envelope options, right-aligned tabular; never in the closed field.
- Register call sites unchanged.

## Task 4: Budget destinations

- `MoveMoneyDialog`: `CategorySelect` over a catalog of visible `moveTargets` + groups, `detail: formatUsd(balanceCents)`, `allowClear={false}`, no `onCreate`.
- `AssignDialog` Manual **To**: same control, no `detail`, Income already absent, hidden omitted.
- Preselect the first envelope in picker tree order.

## Task 5: Payees learned/fixed

`/finances/payees` already loads `listBudgetEnvelopeOptions` and throws the groups away. Pass the full catalog. Replace the auto-category `SelectField` with `CategorySelect` (`allowClear`, placeholder `"None"`, no `onCreate`). Income and hidden stay.

## Task 6: Supplies Funded from

Replace `listSupplyEnvelopes` with `listBudgetEnvelopeOptions`, drop income in the view. Cell uses `CategorySelect` (`allowClear`, placeholder `"—"`, no `onCreate`, cell chrome). Hidden stay marked. Delete the now-unused name-only query if nothing else calls it.

## Task 7: Verify, freeze spec, update roadmap only if a listed item closed

Browser: Move money (type, arrow, Enter, Escape, Available suffix, cannot pick source / Income / hidden / create / clear), Assign Manual, Payees auto-category (clear to None, Income and hidden present), Supplies Funded from (clear to —, not clipped), Register still has New… and hidden. Then lint / typecheck / unit (Postgres up) / build / smoke.

Update `plan.md` / `shape.md` for material as-built drift; fill **Changes from original plan**; mark **frozen / complete**. This is not a roadmap line item — do not invent one.

---

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
