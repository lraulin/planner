# Amazon order totals and register linking — Shaping Notes

**Status: active**

## Scope

Make an Amazon order carry Amazon's own printed money — subtotal, shipping, promotions, tax and
grand total — as stored facts rather than a read-time sum of item lines, then link orders to
register transactions through their charges.

Subscribe & Save Bills become one consumer of that receipt ledger instead of its entire
purpose. Everything the S&S spec built stays; what changes is where an order's total comes from
and how orders and charges are reached.

### Out of scope

- Amazon credentials or server-side scraping.
- Chewy or a general retailer automation framework.
- Fuzzy automatic matching, or rewriting an existing manual split.
- Resyncing Amazon prices onto Supplies offers.

## Decisions

- **Model:** `amazon_orders` gains `items_subtotal`, `shipping_handling`, `promotion`, `tax`,
  `grand_total`, verbatim `summary_lines` and `summary_source` (`printed` | `derived`).
- **Invariant:** the grand total must equal the sum of the recognised summary lines. An order
  that does not reconcile is flagged, never quietly trusted.
- **Allocation:** tax spreads across all lines; the subscription saving spreads across S&S lines
  only. Per-item tax is allocated at use time, never fabricated into the item table.
- **Enumeration:** walk order history per year for every order id, date and grand total; fetch
  order detail only for the breakdown and item fields.
- **Charges:** fetch per order via the transactions page filtered by order id. Charge identity
  becomes `orderId|date|last4|amountCents|ordinal` instead of a text-derived id.
- **Contract:** clipboard snapshot goes to `# planner-amazon v2`; v1 is refused with an
  actionable message.
- **Register link:** derived from order → charges → matched transactions. Manual review may link
  an order on an equal grand total when charge evidence is missing; never automatic.

## Context

- **Trigger:** the S&S spec's Task 8 verification. An exported Orders row showed `$23.49` for an
  order the card was charged `$23.66` for.
- **Root cause:** the userscript never captured order-level tax or discounts, and `amazon_orders`
  had no column to hold a total even if it had. The grid recomputed the total by summing items.
- **Why it matters beyond S&S:** the −$1.17 line is the subscription saving itself. The number
  the Bill exists to track was the number being dropped.
- **Visuals:** live authenticated order-history, order-detail and per-order transactions pages
  were inspected read-only on 2026-08-27. No account screenshot is copied into this spec.
- **References:** see `references.md`.

## Standards Applied

See `standards.md`. The capture modal remains the fast-capture exception; persistent review
keeps the drawer pattern.
