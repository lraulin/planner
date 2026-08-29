# Hidden categories stay in the Category picker

**Status: frozen / complete** (2026-08-29)  
Spec folder: `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-26-1151-category-picker-typeahead/` — typeahead, Budget tree order, one shared `CategorySelect`, filter, New {type}…, closed field shows the envelope name.
- **Supersedes:** that spec’s **“Hidden stays hidden”** decision and its acceptance criterion that hidden envelopes and hidden-group descendants are absent from the picker.
- **Extends:** Budget Show Hidden in `nestedBudgetGridRows` / `sectionGridRows` (`agent-os/specs/2026-08-22-1948-zero-based-budget/` and later budget-structure work) — unchanged. Hide remains a Budget display flag.

## Context

Hiding an envelope is how you retire a category that still has history: old gym, a closed bill, last year’s project. The Budget correctly drops those rows when Show Hidden is off. The shared Category picker currently drops them too, because the typeahead spec copied Budget visibility into the catalog tree.

That blocks the actual job of Hide: file historical transactions into the retired envelope without keeping it on the monthly budget.

Actual Budget’s `CategoryAutocomplete` also omits hidden categories unless `budget.showHiddenCategories` is on — the same pref as the budget tables. We diverge on purpose: hide is Budget display, not catalog availability. Auto-assign still skips hidden envelopes (`src/lib/finances/budget/assign/plan.ts`); that is a different surface and stays.

## Decisions

- **Picker lists every envelope.** `categoryPickerSections` no longer filters `envelope.hidden` or `group.hidden`. Hidden-group headings stay so descendants keep their place in the tree. Empty groups still drop.
- **Marked, not relocated.** Same type / group / envelope order as Budget. Envelope rows (and group headings that are themselves hidden, or sit under a hidden ancestor) carry `hidden: true`. The open list appends a subdued `(hidden)`. Closed field still shows the envelope name only.
- **`hidden` means “hidden from Budget by this row or an ancestor.”** An envelope in a hidden group is marked even if its own flag is false. Type headings are never marked. Filter still matches name / ancestor group names / type label — not the marker string.
- **One shared `CategorySelect`.** Register cell, transaction drawer, splits, Set category. No new control, no per-surface filter flag.
- **Budget Show Hidden is unchanged.** `nestedBudgetGridRows(..., { showHidden })` remains the only visibility gate for the Budget tables.
- **Out of scope:** Payees learned/fixed `SelectField` (already receives the full catalog), Supplies, Move money, auto-assign, creating envelopes as hidden, a Hide control on groups (column exists; no UI).

## Acceptance criteria

- [x] Opening Category on the Register (cell, drawer, splits, Set category) lists hidden envelopes in Budget tree order, with a subdued `(hidden)` on the row (and on a hidden group heading).
- [x] Typeahead still finds a hidden envelope by name or group path.
- [x] Budget with Show Hidden off still omits those envelopes and hidden groups; Show Hidden on still reveals them.
- [x] Closed Category cell still shows the envelope name, including when the assigned envelope is hidden.
- [x] `categoryPickerSections` unit tests pin “hidden envelopes stay, marked” rather than “omitted”. No React component tests.
- [x] lint, typecheck, `test:unit`. Browser: Register picker with a hidden envelope; Budget Show Hidden off.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change | Why        |
| --- | ------ | ---------- |
|     | none   | As shaped. |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, Actual divergence, no visuals)
- **standards.md** — references only, pinned to `f07525efa9cf700e35d44a5b37fa00c76e03bc61`
- **references.md** — picker spec, Budget `showHidden`, Actual `CategoryAutocomplete`

Shaping stops here. Implementation begins at Task 2 in a fresh session.

## Task 2: Include hidden rows in the picker tree

In `src/lib/finances/budget/groupEnvelopeOptions.ts`:

- Stop filtering groups and envelopes on `hidden`.
- Add `hidden: boolean` to `CategoryPickerEnvelope` and `CategoryPickerHeading`.
- Set it true when the envelope (or group) is hidden **or** any ancestor group is hidden.
- Keep empty-group dropping, type sections, New {type}…, and substring filter as they are.

Replace the unit test that currently expects omission (`groupEnvelopeOptions.test.ts` “omits hidden envelopes and anything under a hidden group”) with cases that would fail if the filter came back: hidden leaf under a visible group, envelope under a hidden group (heading + envelope both marked), nested group under a hidden ancestor, and filter still matching the hidden envelope by name.

## Task 3: Render `(hidden)` in `CategorySelect`

In `src/components/finances/CategorySelect.tsx`, when `row.hidden` is true, append a subdued `(hidden)` after the label on envelope options and group headings. Do not put the marker in the closed field. Shared control, so every CategorySelect surface picks this up. No catalog or query change — `listBudgetEnvelopeOptions` already returns `hidden`.

## Task 4: Verify, freeze spec, do not invent a roadmap line

Browser: hide an envelope on Budget, confirm it leaves the table with Show Hidden off, then file a Register transaction into it from the picker (typeahead + click). Repeat from the drawer. Show Hidden on Budget still reveals it.

Then lint / typecheck / `test:unit`. Update plan/shape for any material drift; fill **Changes from original plan**; mark **frozen / complete**. This is not a roadmap item.

**As built.** `categoryPickerSections` no longer filters `hidden`; heading and envelope rows carry `hidden` when the row or an ancestor is hidden from Budget. `CategorySelect` appends a subdued `(hidden)` on those open-list rows only. Budget Show Hidden is unchanged.

Verified 2026-08-29: hid Pizza on Budget (row left the table); Register cell typeahead on an uncategorized Amazon row filtered to `Pizza (hidden)`, click filed it (closed field `Pizza`, then cleared); drawer Category on Pizza Hut listed `Pizza (hidden)` and closed as `Pizza`. Show Hidden revealed Pizza; unhid so the live budget is restored.

## Follow-ups (new work — not amendments to this frozen spec)

None. Further picker or Hide changes open a new delta-spec.

---

This spec is **frozen**. Do not treat it as a living control plane. A later change opens a
new delta-spec.
