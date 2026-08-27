# Amazon Subscribe & Save bills and charge matching — Shaping Notes

**Status: active**

## Scope

Automate importing current Amazon Subscribe & Save subscriptions as Bills, retain Amazon's
exact payment-to-orders evidence, match those charges to existing card transactions, and file
product-specific amounts through ordinary categories or balanced split children.

Cancelled subscriptions do not become Bills. Their historical or already-placed orders remain
receipt evidence and may be reviewed against a bank transaction.

### Out of scope

- Amazon credentials or server-side scraping.
- Learning categories for every ordinary Amazon purchase.
- Chewy or a general retailer automation framework.
- Automatic positive-refund categorisation or fuzzy automatic matches.
- Resyncing Amazon prices onto Supplies offers.

## Decisions

- **Capture:** Tampermonkey → privacy-limited versioned clipboard snapshot → Planner paste.
- **Automatic threshold:** exact account suffix + signed amount + transaction date + Amazon
  merchant, unique on both sides, completed and posted only.
- **Mixed charge:** recognised S&S lines go to Bills; the exact ordinary remainder keeps the
  transaction's existing category.
- **Backfill:** all evidence available from the privacy import and browser capture. Active
  subscriptions alone create Bills; cancelled and ambiguous history stays reviewable.
- **Bill drift:** later amount/schedule/status changes require review.
- **Supplies:** fill a blank envelope only when an ASIN identifies one Supply item; never
  overwrite an existing selection.
- **Review surface:** initial paste is a capture modal; persistent unresolved evidence uses an
  Orders drawer/full-screen compact sheet.
- **Identity:** Bill per Amazon subscription id. Historical ASIN mapping is automatic only
  when unambiguous.

## Context

- **Visuals:** Live authenticated Amazon subscription, order-detail, order-history and Your
  Payments pages were inspected read-only. No account screenshot is copied into the spec.
- **Observed source facts:** subscription cards expose subscription id, ASIN, cadence, quantity
  and next delivery but not price; order details expose exact totals; Your Payments exposes
  card suffix/date/status/amount and may attach one payment to several order numbers.
- **Product alignment:** roadmap itemized-receipts / purpose-not-vendor follow-up. Amazon session
  data remains browser-local and uncertain evidence is reviewed.
- **References:** See `references.md`.

## Standards Applied

See `standards.md`. The capture modal is the fast-capture exception; persistent review follows
the drawer pattern.
