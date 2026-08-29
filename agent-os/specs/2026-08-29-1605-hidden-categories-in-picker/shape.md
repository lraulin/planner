# Hidden categories stay in the Category picker — Shaping Notes

**Status: active**

## Scope

Hidden envelopes remain in every `CategorySelect` (Register cell, transaction drawer,
splits, Set category) so historical transactions can still be filed into a retired
category. They stay off the Budget when Show Hidden is off.

### Out of scope

- Payees learned/fixed Category `SelectField` (already receives the full catalog)
- Supplies envelope picker
- Move money destination
- Auto-assign filling hidden envelopes
- Creating envelopes as hidden
- A Hide control on groups (the column exists; there is no UI)
- Changing Budget Show Hidden

## Decisions

- Hide is a Budget display flag, not catalog availability. Deliberate divergence from
  Actual’s `CategoryAutocomplete`, which gates the picker on the same
  `budget.showHiddenCategories` pref as the budget tables.
- Hidden envelopes stay in Budget tree order, not a separate Hidden section.
- Open list marks them with a subdued `(hidden)` (envelope, and group headings that are
  hidden or sit under a hidden ancestor). Closed field stays the envelope name.
- `hidden` on a picker row means this row or an ancestor is hidden from Budget.
- Filter still matches name / ancestor groups / type label, not the marker.
- One shared control; no per-surface `showHidden` flag.

## Context

- **Visuals:** None
- **References:** See `references.md`
- **Product alignment:** Phase 3 Finances (beyond Achieve). Aligns with “modern UX on a
  proven model”: Actual remains the envelope-formula reference; this is a stated
  divergence so Hide can retire a category from the monthly budget without making it
  unfileable.
- **Shaping session:** Grok `/shape-spec`. User confirmed: same tree with `(hidden)`
  marker; all CategorySelect surfaces; no mockup.

## Standards Applied

See `standards.md`.
