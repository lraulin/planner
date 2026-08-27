# Split transactions — Shaping Notes

**Status: active**

## Scope

One bank transaction can be divided into child rows, each with its own amount and envelope.
The parent keeps the bank's amount and holds no envelope; the children sum to it exactly.

The motivating case is Apple: `PP*APPLE.COM/BILL` is one string for every product, and Apple
batches renewals into a single charge ($34.97 = a $13.00 monthly subscription + a $19.99 annual
membership + tax). Since a bill is an envelope, that charge has to fund two envelopes, and one
nullable FK cannot say so.

### Out of scope

- **Any automatic split.** No rule action creates one (`2026-08-23-1536-finance-rules` D4 stands),
  no import creates one, nothing runs unattended.
- **An Apple receipt ingest.** Scraping `reportaproblem.apple.com` or parsing Apple's emailed
  receipts would save typing, but the subscription inventory is already effectively complete, so
  the data it would provide is not the bottleneck. Separate spec if it is ever wanted.
- **Fully-indexed split children in the register** — children do not sort, filter, search or
  group (D8). A later delta if splits stop being rare.
- **Mobile split editing** (D12). Read-only on the phone.
- **Splitting a transfer leg** (D10).
- **Per-child flow, tags, `excludeFromBaseline` or `eventLabel`** (D9). Amount, envelope, notes.

## Decisions

The full set is in `plan.md`. The four that took the most argument:

- **Same table, parent/child — not a splits table.** Actual's shape, minus its `is_child`
  column, which is a stored duplicate of `parent_id is not null`.
- **Two audit answers, not one.** Money sums want leaf rows (`is_parent = false`); "how many
  bank transactions" wants non-child rows (`parent_id is null`). Discovered by noticing that
  `listAccounts.transactionCount` and `queries.ts:77`'s balance sit in the same function and
  want opposite filters.
- **Strict balance** rather than Actual's tolerated error state, because `reconcile.ts` is a
  hard arithmetic check here and there is no sync layer forcing tolerance.
- **Proportional `Distribute`.** Actual's spreads evenly across empty children only, which does
  not solve the tax remainder. This is the one place the reference implementation was found
  wanting rather than merely different.

### The tax question, and why it shaped D6/D7

The user's objection to strict balance was concrete: you enter the subscription amounts as the
receipt lists them, and they do not add up to the charge, because tax. And per-item tax is not
something anyone is going to compute by hand — ordinarily tax is just part of the charge and
the whole charge gets one envelope.

Strict balance is only defensible if closing that gap is one click, and the click has to
allocate tax the way tax actually behaves: in proportion to price. Hence D7, and hence the
worked $13.78 / $21.19 case being an acceptance criterion rather than an example.

## Context

- **Visuals:** None. The register shape is sketched in `plan.md` D8.
- **References:** See `references.md`. Actual Budget (`../actual`, MIT) is the reference
  implementation for the parent/child model, the leaf-row aggregate filter, and the `Distribute`
  affordance we then diverge from.
- **Product alignment:** Closes the blocker named twice in `agent-os/product/roadmap.md`
  (§ Itemized receipts) and in the `financeSupplyItems` schema header — attributing one charge
  across several envelopes. Unblocks the Supplies worksheet's stated reason for not writing the
  budget.

## Standards Applied

See `standards.md` for the pinned list and the one deviation (`components/responsive.md`,
desktop-only for v1).
