# Chase to the bank page — Plan

**Status: frozen / complete** (2026-09-24)

## Spec relationships

- **Extends:** `agent-os/specs/2026-09-23-1316-one-history-source-per-account/`
- **Supersedes:** `agent-os/specs/2026-09-23-1316-one-history-source-per-account/` — Decision 1
  (Chase on SimpleFIN) and D5's "the link to unlink" (a cutover removes the link).

## D1: Chase takes its history from the bank page

SimpleFIN never delivered Chase's pending Amazon holds, and Lee mostly uses the card for Amazon.
Chase •••9910 is `history_source = bank_page` since 2026-09-20 (SimpleFIN's last posted day),
applied on production 2026-09-24. Lee pastes with `scripts/chase-pending.user.js`; the paste path
was kept for exactly this in `78530c44`. Chase's SimpleFIN rows stay as they are.

## D2: A cutover keeps the SimpleFIN link

The sync ignores a linked account whose source is not `simplefin` (`otherSourceExternalIds` in
`src/lib/banksync/syncPlan.ts`) and counts a provider account with **no** link as unmatched.
Capital One's cutover deleted the link, so Accounts showed a permanent red "Match accounts in
Settings" line until Lee re-linked it by hand. Root cause: the parent spec said "remove the link"
without checking what the unmatched count reads. `applyHistorySourceCutover` no longer deletes
links (`1808a81d`), so Chase's provider account stays matched.

## As applied

- Dry run: 0 holds retired, 0 unpaired, 4 "missed" rows from the 2026-09-17 capture.
- Applied **without** `--insert-missed`: the capture was seven days stale; one row was
  "Payment Thank You - Web" −$455.51, the wrong-signed row of the unresolved Chase sign bug; and
  the three Amazon rows probably already sit under SimpleFIN's wording, so inserting them risks
  the duplicates the parent spec exists to remove.

## Acceptance

- [x] The cutover integration test asserts `links: 1` after apply and on a dry run.
- [x] Production lists Chase as `bank_page since 2026-09-20 (linked)`.

## Follow-ups (new work — not amendments to this frozen spec)

- Confirm the red line clears after the next sync, and that Amazon holds arrive from the first
  Chase paste.
- The Chase payment sign bug, if it recurs (needs live chase.com DOM evidence).
