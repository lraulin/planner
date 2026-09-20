# Holds are never deleted by absence — Shaping Notes

**Status: active**

## Scope

On 2026-09-20 Lee refreshed the Capital One card page, ran the userscript and pasted the
snapshot. Planner reported it could not find a match for the pending **Chewy.com $51.29** hold and
removed it, though the charge is plainly on the page. Neither a SimpleFIN refresh nor another paste
brought it back. Lee: "Stuff like this continues to happen when I refresh my accounts, after many,
many attempts to fix... Which makes it hard to trust the system. Starting to wonder if we need to
completely reconsider our approach to this from scratch."

This spec fixes the four defects that combined to lose the row, and adds the backstop that turns a
future ingestion mistake into a click instead of a loss.

### Out of scope

- Replacing the identity/pairing model from `2026-09-13-1127-ingest-by-identity`. It is sound; no
  candidate in this incident ever reached the matcher.
- The merchant-alias treadmill in `descriptionsOverlap` (`f8228400`, `36bbfe90`). Real, ongoing,
  and not this bug. **The next session must not reach for another alias entry here.**
- A balance-identity guard comparing the projected register balance with the capture's own
  `currentBalance`. Follow-up; D3 removes most of the need that motivated it.

## Decisions (from shaping Q&A, 2026-09-20)

- **Scope: all four defects** — scraper capture, never-delete-on-absence, restore-from-audit, and
  state carry on SimpleFIN's own pending→posted delete.
- **A lost hold is kept and flagged for review, not auto-expired.** Consistent with Lee's earlier
  rule "If it posted, it posted" (ingest-by-identity shape.md). Cost accepted: a hold that really
  did vanish (the duplicate Xfinity hold) now lingers visibly until Lee resolves it.
- **Spec only.** Implementation starts in a fresh session against this folder.

## Evidence (2026-09-20, from the pasted snapshot and screenshot)

- The Sep 20 statement closed that morning. Chewy.com $51.29 (Sep 19), SimpliSafe $34.97,
  LINK.COM* SIMPLEFIN $1.59 and Walmart $154.03 sit under **"Statement Ending Sep 20, 2026"**.
  "Posted Transactions Since Your Last Statement" reads "There are no transactions since your last
  statement."
- The snapshot has `"posted": []` with `completeness.posted: true` and `currentCycle: true`.
- Its six pending rows sum to $249.44, matching the page's own "Total: $249.44". The scraper read
  the pending table correctly.
- `currentBalance` $340.18 is posted-only and **still includes Chewy**. Deleting the hold therefore
  left the register $51.29 below the bank's own figure in the same capture, and returned $51.29 to
  Ready to Assign.
- The deleted row's full prior state is in `finance_audit_changes.before_fields`
  (`bankSnapshotApply.ts` `auditChanges`); the raw paste is byte-for-byte in
  `sourceEvidence.rawText`.
- `finance_transactions` has no tombstone; SimpleFIN re-inserts a deleted row once its feed
  delivers it, days late and without the envelope.

## Root cause

A source is trusted to authorize deletions in a region of history it cannot see, and the deletion
is irreversible. Specifically:

1. The scraper reads only two table headings and skips every `Statement Ending <date>` table.
2. Its `postedKnown` regex runs against whole-page text, so the empty-cycle sentence counts as a
   verified-empty posted list.
3. The parser accepts that as complete; `resolveLostHold` searches stored rows only; the `none`
   branch hard-deletes.

Had the statement row been captured, the existing `postedAtBankMarks` path would have kept the hold
with its envelope. The correct handling was starved of input.

## Context

- **Visuals:** the Sep 20 screenshot (not committed).
- **References:** see `references.md`.
- **Product alignment:** Finances module; memory notes "bank feed workflow" (never manual entry)
  and "prefer fixing the model".

## Standards Applied

See `standards.md`.
