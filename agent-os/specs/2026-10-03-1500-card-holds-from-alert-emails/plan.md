# Card holds from alert emails — Plan

**Status: active** (shaped 2026-10-03; not yet implemented)

## Spec relationships

- **Extends:** `agent-os/specs/2026-09-23-1316-one-history-source-per-account/` (D1
  `history_source`, D5 cutover), `agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/`,
  `agent-os/specs/2026-09-13-1127-ingest-by-identity/`
- **Supersedes:** `agent-os/specs/2026-09-23-1316-one-history-source-per-account/` — Decision 1
  (Capital One on the bank page); `agent-os/specs/2026-09-24-1330-chase-to-bank-page/` — D1
  (Chase on the bank page). Both cards return to `simplefin`.

## Decisions

- **D1. An alert is a hold, never posted history.** New `external_source` values
  `alert:capitalone` and later `alert:chase`. `external_id` is the Gmail message id, so the
  existing partial unique index makes a re-push a no-op. Rows insert `pending: true` with the
  alert's date, display name (as `description`) and signed amount (a charge is negative).
- **D2. Retirement uses the existing handover.** Alert holds join the retiring set and retire
  onto any SimpleFIN row, pending or posted, that pairs
  (`retireRowsOntoOtherSources`, `feedHandoverWrite.ts`), carrying envelope and notes, inside the
  SimpleFIN sync transaction. Pairing rules are `feedPairing.ts` as they stand. **No new merchant
  aliases in `descriptionsOverlap`** (forbidden by the holds-never-deleted spec).
- **D3. Unmatched alert holds are flagged, never auto-deleted.** After
  `LOST_HOLD_TOLERANCE_DAYS` (7) with no successor, flag for review using the `unlistedAt`
  mechanism. Accepted cost: a declined authorization lingers until Lee clears it.
- **D4. The budget counts alert holds** on `simplefin` accounts: `selectWorkingPending`
  (`workingPending.ts`) counts the account's feed holds plus its alert holds. Retirement is what
  prevents double counting.
- **D5. Delivery by Apps Script push.** A time-triggered script (every 5 min) in Lee's Gmail
  searches `from:(capitalone@notification.capitalone.com OR no.reply.alerts@chase.com)
newer_than:2d` for messages without a `planner/pushed` label, POSTs
  `{messageId, from, subject, receivedAt, plainText}`, and labels on a 2xx. **Parsing happens in
  Planner**, so a format change is a deploy, not a script edit. The raw text is kept as audit
  evidence.
- **D6. Routing by the card's last four digits.** An unknown last-four or unparseable body
  returns 422 and writes an audit warning — never a silent drop.
- **D7. Cutover back to SimpleFIN** via `scripts/history-source-cutover.ts --to simplefin`, dry
  run first, Lee reads the receipt. It must retire the page's **posted** rows since
  `history_source_since` onto SimpleFIN's twins (not only holds), ensure the sync backfills
  SimpleFIN rows it skipped since that day, and list anything unpaired — never delete it.
- **D8. Userscripts retired for the cards.** Pastes are already refused for `simplefin`
  accounts.

## Evidence (Lee's Gmail, 2026-10-03)

- Capital One sends `capitalone@notification.capitalone.com`, subject "A new transaction was
  charged to your account": _"on Oct. 2, 2026, at Pizza Hut, a pending authorization or purchase
  in the amount of $12.71 was placed or charged on your VentureOne Credit Card"_, "ending in
  3448". Day-only date, display name, amount, last four; **no transaction id**; fires for
  authorizations too (gas, hotels). "A deposit has been made to your account" is a separate
  subject (a 360 deposit; decide whether a credit is ever a hold).
- Chase sent **no per-purchase email in 90 days** — only payment-scheduled and statement-ready.
  Lee must enable a Chase transaction alert first; the Chase parser waits for a real sample.

## Tasks

1. **Parser** `src/lib/finances/alertEmail.ts` (pure) + `alertEmail.test.ts`. Real Capital One
   bodies as fixtures.
2. **Write** `alertIngestWrite.ts` + `alertIngestWrite.integration.test.ts`: idempotent re-push;
   a second user cannot read, change or delete the first user's alert rows; unknown last-four
   rejected.
3. **Route** `src/app/api/finances/alerts/route.ts`, Bearer auth through the agent-key path
   (`getAgentUserId()`).
4. **Retirement:** `ALERT_FEEDS` beside `SCRAPE_FEEDS` (`bankSnapshot.ts`); call
   `retireRowsOntoOtherSources(..., ALERT_FEEDS, { pendingOnly: true })` where the sync calls
   `retireCoveredScrapeRows`. Integration tests: exact match, tip, ambiguous-keep.
5. **Lost-hold flag** for stale alert holds, reusing the `unlistedAt` review UI.
6. **`selectWorkingPending`** + its test.
7. **Cutover** `--to simplefin` per D7, with an integration test.
8. **Apps Script** `scripts/gmail-alert-push.gs` with setup notes here.
9. **Freeze:** roadmap live-bank-sync entry; `bank-feed-workflow` memory.

## Acceptance

- [ ] A Capital One alert POSTed twice yields one pending row on •••3448.
- [ ] A SimpleFIN row for the same charge retires it, carrying envelope and notes; a tipped
      charge too; an ambiguous one is kept and flagged.
- [ ] Cutover dry runs for both cards read cleanly and are applied on production.
- [ ] A real purchase appears as a hold within ~5 minutes and retires when SimpleFIN posts it.
- [ ] `npm test` (database tests actually ran) and `npm run smoke` pass.

## Out of scope

Plaid or any other feed; an LLM in the loop; rewriting SimpleFIN's dates (Capital One via
SimpleFIN dates by posting day — accepted); the 360 accounts; a Chase parser before a real Chase
alert exists.

## Changes from original plan

| What         | Why |
| ------------ | --- |
| _(none yet)_ |     |
