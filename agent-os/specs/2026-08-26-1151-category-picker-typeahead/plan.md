# Category picker: groups within types, typeahead instead of dropdown

**Status: frozen / complete** (2026-08-26)  
Spec folder: `agent-os/specs/2026-08-26-1151-category-picker-typeahead/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` — D1–D2 (four type sections + New {type}… sentinels). Grouping is no longer type-only.
- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — section from `kind`; groups optional and organisational; ungrouped envelopes sit in their type; a mixed group may appear in more than one type.
- **Extends:** `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/` — arbitrary-depth groups, sibling order from `sortKey` (groups and envelopes interleaved).
- **Extends:** `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/` — Register cell, drawer, and Set category modal share one picker; bulk still writes through `onSetEnvelope`.
- **Supersedes:** D1 of `2026-08-24-1522-category-by-kind-and-history` as implemented — type `<optgroup>`s with a flat envelope list. Types remain the outer axis; budget groups become inner headings. Native `<select>` is replaced.

## Context

`CategorySelect` is a native `<select>` with four `<optgroup>`s (Income, Regular spending, Bills, Savings). Envelope labels already include the full group path (`Food › Groceries`) because two leaves can share a name — but the list does not follow the Budget page, and a long `<select>` is a poor way to find one envelope among many.

HTML cannot nest `<optgroup>`, so “groups within types” cannot be done with a dropdown. The replacement is a typeahead combobox whose open list mirrors Budget.

## Decisions

- **Typeahead combobox, not a dropdown.** Focus opens a text field with the current name selected. Typing filters; the first remaining envelope is highlighted. Enter / click commits. Escape restores the previous value. Blur commits the highlighted match if the draft is non-empty, or uncategorises if the draft is empty. Keystrokes never write.
- **Tree matches the Budget page.** Outer headings are the four types. Under each type, nested group headings and envelopes in `budgetChildren` / `sortKey` order. An envelope with `groupId` null sits directly under its type. `New {type}…` stays at the end of that type (D2 unchanged).
- **Hidden stays hidden.** Hidden envelopes, and anything under a hidden group (including hidden ancestors), are omitted. Type sections with no visible envelopes still render so New {type}… is reachable.
- **Filter keeps tree order.** Case-insensitive substring on envelope name, ancestor group names, and the type label. Empty groups drop out. Empty query keeps budget order (do not re-rank like `⌘K`). `New {type}…` remains when the query is empty or matches the create label.
- **Closed field shows the envelope name**, not the path. The open list supplies the group context. Idle placeholder remains “Categorize”.
- **One shared `CategorySelect`.** Register cell, transaction drawer, Set category modal. Payees learned/fixed `SelectField`, Supplies, and Move money stay as they are.
- **No new dependency.** Same idea as `CommandPaletteDialog`: input + grouped list, keyboard, no cmdk/radix combobox.
- **List is not clipped by the grid.** DataGrid cells are `overflow-hidden`. The open list is a fixed-position popover anchored to the input (ColumnMenu measurement), so it can paint outside the cell. On compact layouts, options are `min-h-tap`; the input stays ≥16px (`text-base` below `md`).
- **Catalog carries groups.** `listBudgetEnvelopeOptions` must return envelopes with `groupId` / `sortKey` / `hidden` plus the group rows (`id`, `name`, `parentGroupId`, `sortKey`, `hidden`). Payees keeps using `label` (full path) on its existing SelectField.
- **Created envelopes** from New income/envelope/savings land at type root (`groupId: null`, not hidden).
- **Do not mint an envelope from free text.** Unmatched draft does not create. Creation stays the New {type}… sentinels.

## Acceptance criteria

- [x] Register Category cell, transaction-drawer Category, and Set category modal all use the typeahead; native `<select>` is gone from `CategorySelect`.
- [x] Open list is Income / Regular spending / Bills / Savings, then nested groups, then envelopes, in Budget order; ungrouped envelopes sit on the type; New {type}… is last in that type.
- [x] Hidden envelopes and hidden-group descendants are absent.
- [x] Typing filters without writing; Enter/click commits; Escape cancels; empty commit clears Category.
- [x] First remaining envelope is highlighted as the query changes; arrows move among envelopes and create rows, not headings.
- [x] New bill… / New income… / New envelope… / New savings… still open the existing create flows.
- [x] Grid cell list is not clipped (verified in the browser). 390×844 not driven — the automated window would not leave fullscreen, so the compact rules (`min-h-tap` options, `text-base` input below `md`) were verified as applied classes, not as a rendered narrow viewport.
- [x] Payees auto-category dropdown is unchanged (still the flat `SelectField` on path labels).
- [x] `categoryPickerSections` and friends have unit tests for nesting, hidden, mixed groups, filter, empty types, create sentinels, and type-vs-group headings. No React component tests.
- [x] lint, typecheck, test:unit (Postgres up, no skip — 3385 tests), production build, `npm run smoke` (61/61). Driven in the browser at desktop, dark. Light theme not driven: the app follows `prefers-color-scheme` with no in-app toggle, and the picker uses only tokens defined in both schemes.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                                                      | Why                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The open list is **portalled to `document.body`**, not merely `position: fixed`.                                                            | The plan assumed fixed positioning escapes the cell. It does not: the grid's virtualized rows sit under a `transform`, which makes that ancestor the containing block for fixed children, and the list painted a row-offset away from its own cell.                                           |
| 2   | Opening shows the **whole tree**, not the list filtered by the current envelope's name.                                                     | The plan puts the current name in the field selected, and filtering by it opened the picker on a single row — hiding the tree the picker exists to show. The draft only filters once the user actually types.                                                                                 |
| 3   | **Hovering no longer moves the highlight.**                                                                                                 | Blur commits the highlight, so a highlight that follows the pointer meant dragging the mouse across the list and clicking elsewhere silently refiled the transaction. It did, during verification. Hover gets its own shading; only typing and the arrows choose what Enter or a blur writes. |
| 4   | **An expanded combobox gets Escape before the surface behind it** — a shared `comboboxOwnsEscape` guard added to `Drawer` and `ModalShell`. | Both claim Escape on `document` in the _capture_ phase, so no handler on the control can win: Escape closed the drawer out from under the picker's own open list. Now the first Escape collapses the list and the second leaves the surface, as a native `<select>` behaves.                  |
| 5   | Type headings and group headings are drawn differently (`scope` on the heading row).                                                        | A budget can hold a group named "Income" inside the Income type, and the picker drew the two identically.                                                                                                                                                                                     |
| 6   | `parseNewEnvelopeKind` deleted.                                                                                                             | The create rows now carry their `envelopeKind`, so parsing the sentinel string back into a kind had no caller left.                                                                                                                                                                           |
| 7   | Typing or arrowing in a **closed but still focused** field reopens the list.                                                                | Committing with Enter leaves the field focused and closed; the next keystroke landed in an inert input and was lost.                                                                                                                                                                          |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-26-1151-category-picker-typeahead/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes
- **standards.md** — which standards apply, why, and any deviations (references, not copies)
- **references.md** — governing specs and code studied
- **visuals/** — none; Budget page structure is the reference

Shaping stops here. Implementation begins at Task 2 in a fresh session.

## Task 2: Picker catalog includes groups

Extend `EnvelopePickerOption` / `BudgetEnvelopeOption` with `groupId`, `sortKey`, `hidden`. Return group rows from `listBudgetEnvelopeOptions` (same query already loads them). Update Register and Payees callers so Payees still receives a flat envelope list with path `label`. Newly created envelopes in `FinancesView` get `groupId: null`.

## Task 3: Nested tree + filter in lib

Replace the flat `groupEnvelopeOptions` with a tested builder that:

- walks `budgetChildren` per type
- includes a group only when it has a visible descendant envelope of that type
- omits hidden envelopes and hidden-group subtrees
- leaves empty types in place for New {type}…
- filters by substring on name / ancestor groups / type label, preserving order

Reuse `budgetChildren` rather than inventing a second sibling order.

## Task 4: CategorySelect typeahead

Rewrite `CategorySelect` as an input + anchored listbox (combobox pattern: `role="combobox"` / listbox, aria-activedescendant). Commit on Enter/click/blur as in Decisions. Keep `onChange` / `onCreate` contracts. Style the closed field to match today’s cell (transparent border, `text-base` on compact, `md:text-[0.8125rem]`).

## Follow-ups (new work — not amendments to this frozen spec)

- The picker is the only expanded-combobox in the app, so `comboboxOwnsEscape` currently
  has one caller shape. If a second typeahead appears, check that the guard still reads the
  right control (it keys off the _focused_ element's `role`/`aria-expanded`).
- Compact (390×844) and light theme were not driven in a browser — see the acceptance
  criteria for what was checked instead. Worth a look on the deployed phone.

## Task 5: Verify, freeze spec, update roadmap only if a listed item closed

Browser: Register cell (type, arrow, Enter, Escape, clear, New {type}…), drawer, Set category modal; another Register surface that reads Category; desktop and 390×844; light and dark. Then lint / typecheck / unit (Postgres up) / build / smoke.

Update `plan.md` / `shape.md` for material as-built drift; fill **Changes from original plan**; mark **frozen / complete**. This is not a roadmap line item — do not invent one.

---

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
