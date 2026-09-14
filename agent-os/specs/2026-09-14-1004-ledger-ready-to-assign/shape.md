# Ledger Ready to Assign — Shaping Notes

**Status: active**

## Scope

Two changes that answer one complaint: _"after Ready to Assign is $0, updating transactions makes
it positive or negative, so I can't trust what any number means."_

1. Ready to Assign stops reading the bank headline. It is derived from the register the way YNAB
   and Actual derive it; bank disagreement becomes a warning plus a deliberate Reconcile action.
2. Bank-page captures stop writing posted history for accounts SimpleFIN covers, removing the
   duplicate source behind the Aug 29, Sep 13 and Sep 14 incidents.

### Out of scope

- Historical month headlines, the credit-card envelope model, feed description heuristics beyond
  ranking, and automatic deletion of existing duplicates (a report is produced; Lee deletes).

## Decisions (Lee's answers, 2026-09-14)

- **Duplicates:** "Pages stop adding posted rows." For feed-covered accounts the page supplies the
  balance and pending holds only. A hold posted at the bank stays, with its envelope, until the
  feed row replaces it. Chosen over amount+date pairing for page inserts.
- **Ledger gaps:** "Warn, keep out of RTA." Bank-vs-register mismatches and one-sided transfers are
  shown with links on the Budget card and Accounts; they never change the headline. Uncategorized
  activity remains an RTA term.
- **Cutover:** "Show it, add a Reconcile action." No silent rebase. The one-time drop (about the
  current $73.47 reconciliation once the Sep 14 duplicates are gone, including the −$122.09 opening
  gap) is shown with its causes; a YNAB-style per-account Reconcile writes one audited adjustment
  when Lee confirms a difference that row fixes cannot explain.

## Evidence gathered while diagnosing (Sep 14)

- Chase bank snapshot 09:34, audit event `89f8b4e3-a6ad-4d7c-88bc-e3d137b75c0b`: "0 posted
  transitions, 14 new posted, 0 pending; 1 already held by the bank feed". Sep RTA $0.00 → $45.53,
  reconciliation $73.47 → $403.04, pool unchanged at $95,627.42.
- Register shows each page row beside its SimpleFIN twin (same amount, page posted = purchase day,
  feed posted 1–3 days later). `descriptionsOverlap` returns false for every Amazon pair (checked
  locally with the real strings): `AMAZON.COM` is under the 11-char containment floor and the brand
  stem rule refuses a `*` boundary.
- The page's `PAYMENT THANK YOU - WEB` stored `amountCents: -45551`; the feed row is +45551.
- The Chase userscript sets `postedDate` equal to the purchase date — it has no posted date.
- The 14 rows were left for Lee to delete by hand (Claude selected the 13 Amazon copies; deletion is the user's action).

## Context

- **Visuals:** None.
- **References:** see `references.md`.
- **Product alignment:** roadmap Phase 3 Financial planning, the Ready to Assign entries. Memory:
  YNAB wins except credit cards; prefer fixing the model.

## Standards Applied

See `standards.md`.
