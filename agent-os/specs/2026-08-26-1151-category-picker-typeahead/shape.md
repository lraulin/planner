# Category picker typeahead — Shaping Notes

**Status: frozen / complete**

## Scope

Replace the Register / drawer / Set category `CategorySelect` native dropdown with a
typeahead combobox whose open list is organised the way the Budget page is: type (Income,
Regular spending, Bills, Savings), then nested budget groups, then envelopes.

### Out of scope

- Payees learned/fixed Category `SelectField`
- Supplies envelope picker
- Move money destination `<select>`
- Minting an envelope from unmatched typed text (creation stays New {type}…)
- Changing envelope `kind`, group membership, or Budget page layout

## Decisions

- Typeahead (YNAB-shaped): filter as you type, first match highlighted, Enter/click
  commits. Not native `<datalist>`, not Access AutoExpand-only.
- Group headings match Budget: nested groups in `sortKey` order, ungrouped envelopes on
  the type, not flattened “Type › Group › Subgroup” labels.
- Hidden envelopes and hidden-group descendants omitted. Empty types still show so
  New {type}… is reachable.
- Filter is substring, tree order preserved (unlike `⌘K` ranking).
- Closed cell shows envelope **name**; path lives in the open list.
- One shared control. Catalog must carry group rows plus `groupId` on envelopes.
- Fixed-position list so DataGrid `overflow-hidden` does not clip it.
- No new combobox library.

## Context

- **Visuals:** None. Budget page structure is the reference.
- **References:** See `references.md`.
- **Product alignment:** Finance is beyond Achieve (Phase 3). This is filing UX on the
  envelope Category, not an Achieve control. Aligns with “modern UX on a proven model”
  and with Actual/YNAB category pickers rather than a Win32 dropdown.
- **Shaping session:** Grok `/shape-spec`. User chose typeahead combobox and Budget-matched
  nested groups; CategorySelect-only scope; no mockup.

## Standards Applied

See `standards.md`.
