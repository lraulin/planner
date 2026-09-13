# Ingest by identity, not by date — Shaping Notes

**Status: frozen / complete** (2026-09-13)

## Scope

Transactions arrive from three sources — SimpleFIN, the bank-page userscripts (Chase, Capital
One), and CSV/statement files. Lee's requirement: ingest from any of them, in any order, without
duplicates, turning pending into posted when appropriate, and without losing categories, splits
or notes. On 2026-09-13 that visibly failed (Ready to Assign −$5.19). This spec replaces the
date-based ownership rule with pairing by identity, fixes the sync window, and breaks the
same-day balance tie by evidence.

### Out of scope

- The stable −$122.09 Account reconciliation (opening recorded at setup vs recomputed today).
  Checking and savings match every statement; the residue sits in the cards and predates the
  audit log. Follow-up: an audited opening rebase.
- Whether automatic assign options should refuse to run while rows and balance disagree.
- Repairing historical categories that were dropped or cross-carried; Lee has re-filed the
  current month by hand.

## Decisions (from shaping Q&A)

- **Posted never disappears.** Lee: "If it posted, it posted, and would need another transaction
  to cancel it." So a posted row is removed only when a successor is identified, or by hand.
- **Only pending holds may vanish** (e.g. a duplicate Xfinity hold that never posted). The
  bank-page capture's complete pending list clears them on its next run — "what we were trying
  to do. Let's just make sure it works correctly."
- **Snapshot inserts pair too** ("Match"), after confirming SimpleFIN is late rather than lossy.
- **A lost hold's envelope and notes carry to a near match** (7.5% band, close date, merchant
  overlap); otherwise removed with a warning.
- **Include the same-day balance tie** in this spec rather than a separate one.

## Evidence (read-only production, 2026-09-13)

- Audit `simplefin_sync` 2026-09-10 19:37: retired 16 browser rows, carried 5; 11 posted
  Capital One rows dated Sep 1–7 deleted with no successor. Their SimpleFIN rows were created
  2026-09-11 09:11; SMECO/NEON only via `csv:capitalone-card` on 2026-09-12 19:20.
- SimpleFIN inserted 0 Capital One rows on every daily sync Sep 4–9; `syncedThrough` advanced
  daily; `syncWindow` = `syncedThrough − 7`, so Sep 2 postings were never requested.
- Same pending holds (Apple −$3.08, Vetsource −$29.70, Domino's −$20.11, Starbucks −$5.57)
  retired on 09-11 20:45, 09-12 08:13, 18:58, 19:20 and 09-13 10:31; none currently stored.
- Handover carried scraped CHATGPT −$21.20's envelope onto SimpleFIN's ANTHROPIC CLAUDE −$21.20
  (posted Sep 9).
- `finance_account_source_state` for Capital One: feed $0.00 as of 2026-09-12 22:18Z; file
  −$5.19 day 2026-09-12 (withheld: "a more current figure is already in force"); browser −$5.19
  as of 2026-09-13 13:25Z. Reconciliation moved −$5.19 at that capture.
- Reconciliation −$122.09 = `openingPositionFor(2026-08)` today ($439.81) − stored
  `openingCents` ($561.90); 360 Checking and Savings statement closings match the walked-back
  register exactly for May–July.

## Context

- **Visuals:** None
- **References:** see `references.md`
- **Product alignment:** Finances module; memory note "bank feed workflow" (SimpleFIN first,
  scripts for the tail, never manual entry).

## Standards Applied

See `standards.md`.
