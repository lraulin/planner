# Amazon order totals as stored facts, and orders linked to the register

**Status: active**
Spec folder: `agent-os/specs/2026-08-27-1521-amazon-order-totals-register-link/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-27-1202-amazon-subscribe-and-save/` — the
  subscription/charge/charge-order/match/allocation tables, Bill sync, exact matcher and the
  Orders capture UI all carry forward unchanged unless named below.
- **Supersedes:** `agent-os/specs/2026-08-27-1202-amazon-subscribe-and-save/` — two decisions
  only:
  1. that an Amazon order's money is the sum of its item lines. An order now stores Amazon's
     own printed order summary, and the grand total is the authority.
  2. that orders are reached only through a full Your Payments history walk. Orders are
     enumerated from order history, and charge evidence is fetched per order.
- **Extends:** `agent-os/specs/2026-08-14-1439-amazon-order-ingest/` — canonical
  `orderId:ASIN:ordinal` line identity and Amazon-owned upserts.
- **Extends:** `agent-os/specs/2026-08-26-2022-split-transactions/` — parent/children ledger
  model and the proportional exact-cent remainder allocator.

## Context

The S&S spec shipped Tasks 1–7. Its Task 8 verification found the defect that makes the
feature not work: the total Planner shows for an Amazon order is not what Amazon charged.

Order `111-7959899-2189857`, as Amazon prints it:

| Line                          | Amount     |
| ----------------------------- | ---------- |
| Item(s) Subtotal              | $23.49     |
| Shipping & Handling           | $0.00      |
| Subscription saving           | −$1.17     |
| Total before tax              | $22.32     |
| Estimated tax to be collected | $1.34      |
| **Grand Total**               | **$23.66** |

Planner shows $23.49. The $0.17 gap is not rounding — it is a −$1.17 Subscribe & Save discount
netted against $1.34 of tax. Two order-level lines, and the discount is precisely the S&S value
the Bill exists to track.

Neither line is captured, and neither has anywhere to live:

- `scripts/amazon-subscribe-save.user.js` hardcodes `itemTax: ""`, `discounts: ""` and
  `shippingCharge: ""` on the DOM path, and takes item price from the first `$X.XX` regex hit
  in the row's text. Product name is `text.slice(0, 160)` of raw card text.
- `amazon_orders` has no total column at all. The per-order figure in the Orders grid is
  recomputed at read time by `amazonGroupPaidCents` summing `itemPaidCents`.

That is the "a fact recomputed at read time because nothing stores it" signal from `AGENTS.md`
— a model problem, not a scraper tweak. An order is a receipt, and a receipt has a total.

Correcting it is also what makes the larger goal reachable: a stored Amazon order total that
equals a card charge lets orders link to register rows, with S&S Bills as one consumer of that
receipt ledger rather than its whole purpose.

## Capture surfaces

Verified read-only against the live authenticated account on 2026-08-27. No account screenshot
or personal data is copied into this spec.

| Surface                                                                                                 | Yields                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/your-orders/orders?timeFilter=year-YYYY&startIndex=N`                                                 | Every order: placed date, `TOTAL` (grand total), order id. ~10 per page.                                                                               |
| `/your-orders/order-details?orderID=…` → `#od-subtotals` / `[data-component="chargeSummary"]`           | The labeled order summary breakdown verbatim. Prefer this modern path; `/gp/your-account/order-details` and `/gp/css/order-details` stay as fallbacks. |
| `[data-component="itemTitle" \| "unitPrice" \| "quantity" \| "orderedMerchant" \| "deliveryFrequency"]` | Clean per-item fields.                                                                                                                                 |
| `/cpe/yourpayments/transactions?transactionTag=<orderId>`                                               | That order's charges — status, date, instrument and suffix, signed amount. Amazon's own page warns "Orders may have multiple charges."                 |

The per-order transactions URL is the significant one: charge evidence is now addressable per
order instead of scraped from a full history walk and matched back by order ids appearing in
free text.

## Decisions

### An order stores Amazon's printed money

Add to `amazon_orders`: `items_subtotal`, `shipping_handling`, `promotion`, `tax` and
`grand_total` (`numeric(14,2)`, nullable), plus `summary_lines` (`jsonb`) holding the verbatim
label/amount pairs and `summary_source` (`printed` | `derived`).

`summary_lines` is what keeps this honest: a line we do not recognise — gift card applied, tip,
regulatory fee, a state delivery fee — is stored rather than silently dropped.

**Invariant, asserted on write and surfaced in the UI:** the grand total equals the sum of the
recognised summary lines. An order that does not reconcile is flagged, never quietly trusted.
This is the check that would have caught the present bug the day it shipped.

A privacy-zip order has no printed summary. Derive one (Σ `Total Amount` + Σ tax + shipping −
discounts) and mark `summary_source = 'derived'`. Derived is never presented as printed.

### Per-item tax is allocated, never fabricated

`amazon_order_items` already carries `item_tax`, `discounts` and `shipping_charge`; the zip
fills them from real columns and the browser capture leaves them null. Amazon prints tax and
the subscription saving at order level only, so per-item figures stay an allocation performed
at use time by the existing `distributeRemainder`, with one correction:

- **Tax** allocates proportionally across all lines.
- **Subscription saving** allocates proportionally across **Subscribe & Save lines only**.

Today `allocateCharge` smears everything proportionally over every line, which puts part of an
S&S discount onto an unrelated item in a mixed order — the exact case Bill amounts must get
right.

### Charge evidence is fetched per order

Charges come from `/cpe/yourpayments/transactions?transactionTag=<orderId>`. `amazon_charges`
and `amazon_charge_orders` already model the many-to-many correctly and are unchanged; only the
source and its reliability change. A full-history payments walk is no longer required for
correctness, though the payments page stays a valid supplementary source.

A charge gets a stable natural key: `orderId|date|last4|amountCents|ordinal`. The current DOM
path mints `pay-${orderIds}-${text.slice(0,24)}`, so any Amazon wording change creates a
duplicate charge for a payment already recorded.

### Orders are enumerated from order history

Walk the order-history pages per year rather than visiting only orders reachable from payments.
Each card yields order id, placed date and grand total in one fetch, so the ledger's totals are
right before any order-detail request; order detail is then needed only for the breakdown and
the item fields. The incremental browser-local cache and the full-rescan button stay.

### Snapshot contract v2

The clipboard header becomes `# planner-amazon v2`. The parser in `src/lib/amazon/snapshot.ts`
remains the sole authority on cents, calendar days, identifiers and completeness; the userscript
remains a thin extractor that never POSTs to Planner and never copies addresses, customer
details, cookies or full card numbers. A v1 paste is rejected with an explicit "update the
userscript and re-capture" message rather than importing partially.

### Order ↔ register

- A **charge** matches a bank row. The strict rules in `src/lib/amazon/match.ts` are unchanged:
  exact account suffix, signed amount, transaction date and Amazon merchant, unique on both
  sides, completed and posted only.
- **Order → register is derived**: order → its charges → their matched transactions. Where an
  order has exactly one charge and that charge is matched, the link is one-to-one. A
  multi-shipment order links to each matched row.
- Manual review may link an order whose **grand total** equals a posted Amazon bank row when
  charge evidence is unavailable. Review-only, never automatic, and the mismatch is shown.
  Unequal totals remain impossible.

### UI

- The Orders Group-by-Order header shows `amazon_orders.grand_total`, not the item sum. The
  item sum appears only when the two disagree, alongside a does-not-reconcile marker.
- Add persisted `Order total` and `Register` columns.
- The review drawer shows the verbatim summary lines beside the item allocations, so an
  unexplained amount is visible rather than smeared.

## Acceptance criteria

- [ ] Order `111-7959899-2189857` stores Item(s) subtotal $23.49, Subscription saving −$1.17,
      tax $1.34 and grand total $23.66, and its grand total equals the matched `Visa ****3448`
      charge. — **Awaiting a real capture.** The parsing of exactly those printed lines is
      pinned in `orderSummary.test.ts`; only the live end-to-end run is outstanding.
- [x] An order whose summary lines do not reconcile to its grand total is flagged, not silently
      summed.
- [x] A multi-shipment order records several charges and links to each matched bank row.
- [x] A mixed order allocates the subscription saving only across its S&S lines, and tax across
      all lines; children still balance to the cent.
- [x] A `TOTAL $0.00` gift-card-funded order imports without inventing a card charge.
- [x] A privacy-zip order gets a derived summary marked `derived`, never `printed`.
- [x] Re-pasting is a no-op for settled evidence and never overwrites a manual split, a Bill
      name/group, a reviewed mapping or an existing Supply envelope.
- [x] A v1 snapshot paste is refused with an actionable message.
- [x] Every new query and mutation is user-scoped; a second user cannot read, change or delete
      the first user's order totals or charge links.
- [x] Desktop and compact Orders expose the same totals, columns and review actions.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                                     | Why                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reconciliation has three outcomes, not two: `reconciled`, `unbalanced`, `incomplete`.                                                      | The order-history walk yields a grand total for every order but a breakdown only for the ones whose detail page was fetched. "Total, no breakdown" is not the same failure as "breakdown that does not add up", and calling both "does not reconcile" would flag every order mid-capture.                                                                                  |
| 2   | An unrecognised summary line does not by itself fail reconciliation.                                                                       | A gift card or "total charged to credit card" line is printed _after_ the grand total and is not part of it. Excluding unknown lines from the sum is enough: an unknown line that really was additive breaks the equation on its own, which is the behaviour the invariant wanted. Unknown labels are still reported and marked in the UI.                                 |
| 3   | Charge identity carries `sourceOrderId` from the userscript, and the ordinal is the largest multiplicity any single order's page reported. | `orderId\|date\|last4\|amountCents\|ordinal` alone cannot distinguish one charge fetched from each of the two orders it covers (must collapse) from two charges listed twice on one order's page (must not). Which order's page a row came from is the only thing that separates them.                                                                                     |
| 4   | Charges captured under v1 are flagged for review, not deleted or migrated.                                                                 | Their ids can never be minted again, so a re-capture leaves them beside the charge they duplicate. Some carry a match and a split the user already approved, so deleting them silently would discard reviewed work.                                                                                                                                                        |
| 5   | Manual order-to-register linking is implemented as a **stand-in charge** rather than a new order-to-transaction link.                      | The order borrows the charge machinery that already exists — review drawer, equal-amount candidates, allocation, split. The stand-in's status (`unknown`) and instrument (`other`) make it ineligible for automatic matching by construction rather than by a new rule, and it is removed once the real charge arrives unless the user already approved a link through it. |
| 6   | Per-item tax and discounts are left empty by the capture rather than filled in.                                                            | Amazon prints both at order level only. The v1 script's placeholder values were the mechanism by which the wrong total looked plausible; allocation from the order summary is the honest source.                                                                                                                                                                           |

## Task 1: Save spec documentation

- [x] Create this folder with `plan.md`, `shape.md`, `standards.md` and `references.md`.
- [x] Append the corresponding **Changes from original plan** row to the S&S spec.
- [x] Record no raw Amazon payloads, addresses, payment details or account screenshots.

## Task 2: Order summary in the model

- [x] Add the `amazon_orders` summary columns and generate, inspect and apply the Drizzle
      migration with snapshot and journal entry.
- [x] Add a pure reconciliation module: parse labeled summary lines to cents, classify the
      known labels, keep unknown labels verbatim, and report whether the order reconciles.
- [x] Cover the C4 order, a gift-card `$0.00` order, an unknown extra line and a
      does-not-reconcile order in unit tests.

## Task 3: Snapshot v2 and the userscript

- [x] Extend the snapshot types with order summaries and per-order charges; reject v1.
- [x] Rewrite the userscript's order-history walk, order-detail extraction (`chargeSummary`
      and the `data-component` item fields) and per-order transactions fetch.
- [x] Pin malformed money, missing summary blocks, duplicate lines and partial pages in tests.

## Task 4: Persist and derive

- [x] Store printed summaries from the capture and derived summaries from the zip import.
- [x] Give charges the stable natural key and keep charge↔order links additive.
- [x] Cover upsert idempotence, key stability across a re-capture, and cross-user
      read/change/delete refusal in integration tests.

## Task 5: Allocation correction

- [x] Allocate tax across all lines and the subscription saving across S&S lines only.
- [x] Keep children balanced to the cent and manual splits protected.

## Task 6: Order ↔ register surface

- [x] Derive the order's register link from its charges' matches.
- [x] Add review-only manual order↔row linking on equal grand totals.
- [x] Add the `Order total` and `Register` columns and the reconciliation marker; show the
      verbatim summary lines in the review drawer.

## Task 7: Verify, freeze both specs, update roadmap

- [x] Run unit and real-Postgres integration tests, lint, typecheck, production build and
      `npm run smoke` (61/61 routes).
- [ ] Real capture → paste → confirm the C4 order reconciles to $23.66 and links to its
      register row. **Outstanding — needs the authenticated Amazon session.** Desktop, 390×844
      and both colour schemes were checked with seeded summaries.
- [ ] Verify the S&S spec's own acceptance criteria, then mark **both** specs
      **frozen / complete** and update the roadmap. **Blocked on the real capture above** —
      both specs stay `active` until then.
- [x] Commit logical changes with the canonical `Spec:` trailer and push `origin/master`.

### What the real capture has to confirm

The parser, the store and the surface are all covered by tests; what no test can cover is
whether the **userscript's selectors still match the live pages**. Specifically:

1. Order history cards yield an id, a placed date and a TOTAL for every order.
2. `#od-subtotals` / `[data-component="chargeSummary"]` yields the labeled summary rows, and
   the C4 order comes back reconciled at $23.66.
3. `?transactionTag=<orderId>` yields the order's charges with a card suffix and a date.
4. Existing orders imported from the privacy zip get `derived` summaries on a re-import of
   the slim file — they were stored before the columns existed, so they are all null today.

## Out of scope

- Server-side Amazon login or credential storage.
- Chewy or a general retailer automation framework.
- Fuzzy automatic matching, or automatically rewriting an existing manual split.
- Resyncing Amazon prices onto Supplies offers.
- Automatic categorisation of positive Amazon refunds or credits.

While this spec is active, material requirement/design/scope changes update this file and
`shape.md` and append a row above. Pure implementation details do not.
