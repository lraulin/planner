# One history source per account — Shaping Notes

**Status: frozen / complete** (2026-09-24)

## Scope

Stop merging two or three feeds on one credit card. Each account gets exactly one source of
posted history:

- **Chase •••9910:** SimpleFIN only. Chase bank-page pastes are refused, and the Chase
  userscript is retired.
- **Capital One •••3448:** the bank page only. SimpleFIN is unlinked from this card, and pastes
  write posted history with purchase and posted dates.
- **360 Checking / 360 Performance Savings:** SimpleFIN, unchanged.

### Out of scope

- Plaid or another feed; making Chase page-sourced.
- Rewriting existing SimpleFIN rows' dates or descriptions.
- Manually merging or editing bank fields in the register. Lee asked for this on 2026-09-23 (he
  could only delete one of two duplicate rows); it is a separate spec.
- Pruning the page↔feed pairing code. It still serves SimpleFIN accounts' own holds.

## Decisions (Lee, 2026-09-23)

1. **A for Chase, B for Capital One.** Capital One is the card Lee pays with, pasting from its
   page is the first thing he does every time he opens the app, and it is where the problems
   concentrate. Chase is used less and has had fewer issues.
2. **Keep SimpleFIN's Capital One history and cut over at a date.** Rows up to the last SimpleFIN
   day stay. Page rows in the overlap that SimpleFIN seems to have missed go on a dry-run receipt,
   never inserted automatically.
3. **Statement descriptor plus display name.** `description` = "Appears on statement as" (the
   CSV/PDF wording). The page's short name is kept in `bank_display_name`.
4. **Statement files fill only periods no paste covered.** A PDF still records its balance.

Found while shaping, not asked about: the headline balance is cached on the SimpleFIN link row
(`bank_account_links`), and `applyBankBrowserSnapshot` refuses an account without a link. So
unlinking SimpleFIN is impossible without moving the headline to the account (D2). The source-state
table was already keyed by account, "links come and go" (source-as-of-authority D1); only the
cache was left on the link.

## Context

- **Evidence from 2026-09-23** (the session that led here):
  - Starbucks −$5.57: a Capital One card CSV row sat beside SimpleFIN's `STARBUCKSXXXXXXXXXXX`
    (masked digits). Fixed by `ca5b063f`.
  - Kim's Nails III: a $50 page hold sat beside the $60 SimpleFIN posting (20% tip). Fixed by
    `461399c5`.
  - YouTube $16.95: posted Sep 22, on the page, not yet in SimpleFIN; the paste summary counted
    it nowhere. Named by `31b07512`.
  - Capital One via SimpleFIN dates a purchase by its posting day (`banksync/mapping.ts:150-156`).
- **Visuals:** `visuals/` holds Capital One's expanded row detail for Kim's Nails and YouTube
  (showing Purchased / Posted / "Appears on statement as"), the userscript's "Copied 9 posted +
  2 pending" toast, and the paste summary ("8 already covered by the bank feed").
- **References:** see `references.md`.
- **Product alignment:** the roadmap's live-bank-sync entry names SimpleFIN as the primary feed
  and the scrapes as the tail. This spec narrows SimpleFIN to the accounts where it is the only
  source. Update the roadmap at freeze.

## Standards Applied

See `standards.md`.
