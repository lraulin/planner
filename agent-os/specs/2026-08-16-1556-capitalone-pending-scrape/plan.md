# Capital One pending scrape

**Status: active**
Spec folder: `agent-os/specs/2026-08-16-1556-capitalone-pending-scrape/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` — `pending` is a real column; SimpleFIN pending is a replaceable set; there is no `pending_transaction_id`.
- **Extends:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — available-to-spend adds pending only on synced accounts (D2a). Scraped Cap One pending must land on the linked •••3448 row so they count once.
- **Supersedes:** live-bank-sync D5a **only** in the sense that Capital One pending becomes available via a human scrape. SimpleFIN itself still does not supply them.
- **Does not change:** CSV/statement import (insert-or-skip, never update); SimpleFIN's own pending path for Chase.

## Context

SimpleFIN does not supply Capital One pending rows. The dashboard therefore understates card spend by whatever is sitting in myaccounts.capitalone.com's Pending table — $379.68 on 2026-08-16. Temporary bridge until Chase is the main card.

## Decisions

**D1 — Tampermonkey copies a tagged TSV. Planner pastes it. No POST from the bank page.**

**D2 — Snapshot replace, not append.** Each paste deletes this user's `scrape:capitalone` pending rows on the matched account and inserts the new set.

**D3 — New feed `scrape:capitalone`, not `api:simplefin`.** Rows are `pending=true`. `externalId` is `3448|{folded-desc}|{cents}|{n}` so two Sheetz $24.45 rows stay two rows.

**D4 — Resolve the account by trailing last-4. Never create one.** Credit-card whose `externalKey` ends in the payload's last-4.

**D5 — Date is the Purchased date from the expanded drawer, else the scrape day.** Collapsed rows show only "Pending". Expanding reveals `Purchased: Sun, Aug 16, 2026`. The userscript expands each row to copy that date. The parser accepts `YYYY-MM-DD` and that weekday form. A row with no date uses `# scraped=`.

**D6 — SimpleFIN must not treat scrape-pending as a statement duplicate.** Exclude every `pending` row from the cross-source comparison. After a posted insert, delete scrape-pending that match on exact amount + merchant **within 14 days**. Date cannot be ignored entirely: SimpliSafe is $34.97 every month, and last month's posted row is not this month's pending. Amount-changed holds survive until the next paste.

**D7 — Paste lives on the Dashboard.** File ▸ Import detects the same `# planner-pending v1` header.

## Acceptance criteria

- [ ] Userscript copies a `# planner-pending v1` TSV of the live pending table (10 rows, −$379.68) including Purchased dates.
- [ ] Pasting on `/finances/dashboard` writes `pending=true` rows on the existing •••3448 card; available-to-spend drops by that total once.
- [ ] A second paste of the same table does not duplicate. A paste with a row gone deletes that pending row.
- [ ] A second user cannot read or write the first user's scrape-pending rows.
- [ ] SimpleFIN posting a matching amount+merchant inserts the posted row and deletes one scrape-pending. It does not skip the posted row.
- [ ] Two Sheetz $24.45 pending rows both survive a paste; one posted $24.45 Sheetz clears only one.
- [ ] A gas hold that posts at a different amount stays pending until the next paste.
- [ ] `npm run test:unit` including DB tests; `npm run smoke` after touching `src/app/**`.

## Changes from original plan

| #   | Change                                                                          | Why                                                                                                         |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Date comes from the expanded drawer's Purchased field, not only the scrape day. | The collapsed table has no date; expanding Chipotle shows `Purchased: Sun, Aug 16, 2026`.                   |
| 2   | Posted match is amount + merchant **within 14 days**, not date-blind.           | A date-blind match treated last month's SimpliSafe $34.97 as this month's pending and skipped the live row. |

## Task 1 — Save spec documentation

This folder.

## Task 2 — Parse the TSV

`src/lib/finances/capitalOnePending.ts` + tests. Fixture is the live 10-row table.

## Task 3 — Replace-set mutation

`replaceScrapedPending` + `resolveScrapedPending`. Cross-user integration test.

## Task 4 — Sync cleanup

Exclude pending from `selectUnmatched`. Resolve scrape-pending after `applySync`.

## Task 5 — Dashboard paste + userscript

Dashboard control, server action, `scripts/capitalone-pending.user.js` that expands rows for Purchased dates. File import detects the header.

## Task 6 — Verify, freeze, update roadmap

While this spec is **active**, material requirement/design/scope changes update these files and append to **Changes from original plan**. Freeze when verified.
