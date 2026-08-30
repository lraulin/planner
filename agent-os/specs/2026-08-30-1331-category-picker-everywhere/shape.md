# Category picker on every remaining chooser — Shaping Notes

**Status: active**

## Scope

Replace every remaining flat envelope dropdown with the hierarchical typeahead: Move money
**To**, Assign → Manually **To**, Payees learned/fixed Category, Supplies **Funded from**.
Create sentinels stay off these surfaces. Register keeps New {type}… and keeps hidden
envelopes for historical filing.

### Out of scope

- Cover-from (row-menu submenu of named sources, not a dropdown)
- Minting an envelope from unmatched typed text
- Changing envelope `kind`, group membership, or Budget page layout
- Wiring destination lists to the Budget Show Hidden switch
- Auto-assign filling hidden envelopes (already skipped)

## Decisions

- A flat, unordered dropdown is never the right chooser for this list. Sharing one React
  component is DRY, not the requirement.
- No New {type}… on the four new surfaces — Budget can create envelopes on the page;
  Payees and Supplies are not a create surface.
- **Filing vs moving money, for hidden.** Register (and Payees) keep hidden, marked:
  Wedding savings, cancelled Apps subscriptions that were never worth a bill. Move money
  and Assign omit them: hidden means inactive, not currently in use for budgeting. Unhide
  to fund. Independent of Show Hidden.
- Move money open-list rows keep Available (`$12.34`); closed field stays the name.
- Move / Assign cannot clear; Payees / Supplies can (None / —).
- Catalog-as-filter: Income omitted where it already was (Move, Assign, Supplies); present
  on Payees. Hidden omitted only on the two destination pickers.

## Context

- **Visuals:** None. The existing Register Category picker is the reference. Move money’s
  current “Name ($12.34)” option label is the reference for the Available suffix.
- **References:** See `references.md`.
- **Product alignment:** Finance is Phase 3 (beyond Achieve). Aligns with “modern UX on a
  proven model” and with Actual/YNAB category pickers rather than a Win32 dropdown.
- **Shaping session:** Grok `/shape-spec`. User asked to reuse the typeahead everywhere a
  category is chosen, without create rows. Chose all four remaining dropdowns and to keep
  Available on Move money. Review on approval: Budget destinations must not show hidden;
  Register must, for old transactions in retired envelopes. Same component is an
  implementation detail; the point is never a flat scroll.

## Standards Applied

See `standards.md`.
