# Envelope sections — Shaping Notes

**Status: frozen / complete** (2026-08-27)

## Scope

Move "which section is this envelope in" onto the envelope, as `kind`, and retire
`finance_category_groups.is_income`. Add Savings as a fourth section, peer to Spending.

### Out of scope

- Envelope arithmetic (Ready to Assign, carryover, cover-overspending) — unchanged.
- Sub-sections beyond Bills / Regular spending inside Spending.
- Any rule that infers a section from an envelope's name.
- Percentage-of-income templates and income carryover — still unshaped.

## Decisions

From conversation, after the first use of the `one-budget` page:

- **"Spending and Income should be separate UI sections, not groups, as should Bills
  and... Regular Spending? Within Spending. Each I suppose can have its own Groups."**
  Sections are structural; groups are the user's own organisation _inside_ a section.
- **Savings is separate because of the total, not the columns.** "Bills + regular spending
  should add up to less than income, but savings could be large amounts that exist outside
  of monthly income/expenses." A savings envelope looks exactly like a spending one; what
  differs is that counting it against income makes the comparison meaningless.
- The seeded groups being undeletable is the concrete bug this fixes: "Those are user
  settings, so maybe it won't matter, and I can clean them up through the UI" — which is not
  currently possible for the Income group.

## Context

- **Visuals:** None. The four-section layout follows the three already built.
- **References:** See `references.md`.
- **Product alignment:** Closes the last structural difference between this budget and
  Actual's, in the direction the roadmap's "envelopes" line has been moving since
  2026-08-22 — the app is for one person and does not need Actual's generality.

## Standards Applied

See `standards.md`.
