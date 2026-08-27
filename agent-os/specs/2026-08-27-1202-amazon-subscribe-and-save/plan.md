# Amazon Subscribe & Save bills and charge matching

**Status: active**
Spec folder: `agent-os/specs/2026-08-27-1202-amazon-subscribe-and-save/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — a subscription is a
  bill envelope, and its category is what receipt allocations spend from.
- **Extends:** `agent-os/specs/2026-08-26-0910-supplies-worksheet/` and
  `agent-os/specs/2026-08-27-0958-supplies-merge-and-restock/` — ASIN identifies an
  Amazon offer; a Supply item keeps its user-owned envelope and price semantics.
- **Supersedes:** `agent-os/specs/2026-08-14-1439-amazon-order-ingest/` — only the
  boundary that Amazon receipts never write `finance_transactions`. Exact browser-captured
  charge evidence may now link and categorise the existing bank row.
- **Supersedes:** `agent-os/specs/2026-08-26-2022-split-transactions/` — only the
  statement that nothing creates a split automatically. A uniquely exact, completed Amazon
  card charge may create one balanced split.

## Context

Subscribe & Save turns household purchases into predictable product-specific expenses, but
Amazon may combine several orders in one card charge. The subscription page supplies the
active schedule but not its price; order details supply item totals; Your Payments supplies
the exact payment transaction and can link one charge to several order numbers.

The existing privacy import reaches orders and ASINs but not this payment relationship. The
register therefore still sees one Amazon merchant lump and cannot file each recurring item to
its own Bill. Split transactions removed the model blocker.

## Decisions

### Browser capture

- A Tampermonkey userscript performs authenticated Amazon GETs and copies a tagged
  `# planner-amazon v1` JSON snapshot. It never sends Amazon cookies or credentials to
  Planner and excludes addresses, customer details, and full payment data.
- Capture current subscription cards, Amazon Payments transactions, their linked orders,
  order lines and Subscribe & Save markers. First run scans all available history; later
  runs reuse completed browser-local history while refreshing subscriptions, recent and
  pending payments. A full rescan remains available.
- Completeness is explicit. Partial evidence may import, but only a complete subscription
  snapshot may propose that a missing subscription was cancelled.
- Reuse retail line identity `orderId:ASIN:ordinal`, so the browser and privacy import enrich
  one receipt line rather than double-count it.

### Bills and Supplies

- Find or create the root group **Amazon Subscribe & Save**. Create one Bill per Amazon
  subscription id, not per ASIN. Product name is the editable default; quantity/cadence
  disambiguate duplicate names.
- Current subscription cards are authoritative for creation. Attention-only, cancelled or
  historical subscriptions do not create Bills, although their in-flight orders still match.
- Expected amount is the latest completed gross item allocation, including proportionally
  allocated tax and discount. Unknown amounts require review. Future prices are estimates,
  never presented as guaranteed.
- Completed Amazon charge evidence anchors the Bill. Before one exists, the next delivery
  date may be approved as a clearly provisional anchor.
- Later amount, cadence, exceptional date, disappearance or status changes require review.
  Normal next-delivery progression only refreshes Amazon-owned evidence. Cancellation keeps
  the Bill and its history; it never deletes it.
- If an ASIN resolves to exactly one Supply item whose envelope is blank, link it to the new
  Bill. Existing or ambiguous choices require review and are never overwritten. Amazon still
  does not resync Supply option prices.
- Amazon Bill history is explicit receipt evidence, not a fabricated product-specific payee
  claim. Bill last-charge queries include this evidence alongside existing payee claims.

### Exact matching and allocation

Automatically match only a completed card charge whose suffix resolves to exactly one open
account and whose signed amount, transaction date and Amazon merchant identity resolve to one
ordinary posted bank row. Anything pending, shifted, duplicated, already split, rewards-funded,
refunded or incomplete stays in review.

- A charge owns a many-to-many relationship to orders. One bank transaction matches at most
  one Amazon charge, and vice versa.
- Allocate each charge across all linked order lines. Order-level tax, discounts, shipping,
  rewards or other remainder use the existing proportional exact-cent allocator.
- Aggregate recognised active subscription lines by Bill. Ordinary, cancelled or unmapped
  lines become one exact remainder in the bank row's existing category, or remain unassigned
  when the parent was unassigned.
- A charge belonging entirely to one Bill is categorised directly. Otherwise write balanced
  children whose sum equals the bank amount while the parent keeps bank amount, date, payee,
  description and notes.
- Store the receipt allocation independently from split children. A later manual split edit
  does not erase Amazon evidence and a repeated capture never rewrites that edit.
- Manual review may approve an equal-amount owned Amazon row outside the strict automatic
  date/card match, with the mismatch shown. Unequal totals remain impossible.

### UI

- Register **Import Amazon subscription snapshot…** under File beside the privacy import.
  The capture modal supplies clipboard paste, validation, Bill drift, exact-match effects and
  unresolved counts.
- Add persisted Bill and Match columns to Orders.
- Unresolved evidence opens in the standard right drawer (full-screen sheet below `md`). It
  shows subscription, order/payment evidence, candidate bank row, item allocations and the
  proposed category/split. Save stays open; Save & Close finishes.

## Acceptance criteria

- [ ] Active subscriptions create idempotent Bills under **Amazon Subscribe & Save**; a
      cancelled subscription such as the cat litter creates no Bill while a final order stays
      matchable.
- [ ] A complete later snapshot proposes, but never automatically applies, price, cadence,
      exceptional-date or cancellation changes.
- [ ] One charge can explain several orders, one order can contain several items, and rewards
      or other payment components remain evidence without becoming a bank match.
- [ ] Only one exact posted card candidate auto-matches. Pending rows, date/card drift,
      duplicate candidates and existing splits remain review work.
- [ ] Mixed charges split recognised subscription amounts to their Bills and preserve one
      exact ordinary remainder in the previous category. Children always balance to the cent.
- [ ] Re-pasting is a no-op for settled evidence and never overwrites a manual split, Bill
      name/group, reviewed mapping or existing Supply envelope.
- [ ] Historical S&S lines map by ASIN only when exactly one subscription fits; duplicate-ASIN
      histories require review.
- [ ] Every new query and mutation is user-scoped; a second user cannot read, match, change or
      delete the first user's Amazon evidence.
- [ ] Desktop and compact Orders flows expose the same import and review actions.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                    | Why                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Orders uses the Register windowed index (100-row blocks) rather than hydrating every receipt                              | Thousands of line items froze the page once Bill/Match evidence was stamped onto every row  |
| 2   | Match Review is a link into order-level review; Group by Order headers carry the item total; newest orders sit at the top | Rows are items; the card charge matches the order total, which Group by Order makes visible |

## Task 1: Save spec documentation

- [x] Create this folder with `plan.md`, `shape.md`, `standards.md`, and `references.md`.
- [x] Record no raw Amazon payloads, addresses, payment details or account screenshots.

## Task 2: Browser capture contract and userscript

- [x] Add the versioned parser/types and sanitised fixtures in `src/lib/amazon/`.
- [x] Add the Amazon userscript with progress, incremental cache, completeness and full rescan.
- [x] Pin malformed dates, money, identifiers, duplicate line items and incomplete pages in
      unit tests.

## Task 3: Receipt evidence schema and reconciliation

- [x] Add per-user subscription, charge, charge-order, match and allocation tables.
- [x] Generate, inspect and apply the Drizzle migration with snapshot and journal entry.
- [x] Reconcile browser rows into the existing canonical Amazon order/item records.
- [x] Cover upsert idempotence and cross-user read/change/delete refusal in integration tests.

## Task 4: Import preview and apply

- [x] Build pure preview decisions for Bill creates/drift, exact matches and review work.
- [x] Revalidate the raw capture and decisions server-side; atomically store evidence and
      approved effects.
- [x] Return stable result counts through thin finance actions.

## Task 5: Subscription Bill sync

- [x] Create/link Bills by subscription id and preserve user-owned Bill fields on refresh.
- [x] Link only blank, unambiguous Supply envelopes.
- [x] Extend Bill last-charge evidence without creating Amazon product payees.

## Task 6: Exact matcher and split application

- [x] Implement strict automatic candidate selection and proportional receipt allocation.
- [x] Apply direct categories or exact balanced splits in one domain transaction.
- [x] Persist automatic/manual provenance and protect later manual edits.

## Task 7: Orders capture and review UI

- [x] Add the File command, capture modal/sheet, preview and inline errors.
- [x] Add Bill/Match grid columns and the persistent review drawer/sheet.
- [x] Keep every desktop action discoverable and tappable below `md`.

## Task 8: Verify, freeze spec, update roadmap

- [ ] Run unit and real-Postgres integration tests, lint, typecheck, production build and
      `npm run smoke`.
- [ ] Verify userscript → paste → Bills/matches in a real browser without saving personal data;
      check desktop, 390×844 PWA shape and both colour schemes.
- [ ] Align the spec to as-built reality, fill material changes, update the roadmap, and mark
      the spec **frozen / complete**.
- [ ] Commit logical changes with the canonical `Spec:` trailer and push `origin/master`.

## Out of scope

- Server-side Amazon login or credential storage.
- General categorisation of ordinary Amazon products, Chewy integration or Supply inventory.
- Fuzzy automatic matching, automatic rewriting of an existing split, or future-price claims.
- Automatic categorisation of positive Amazon refunds/credits; retain them as review evidence.

While this spec is active, material requirement/design/scope changes update this file and
`shape.md` and append a row above. Pure implementation details do not.
