# Finances MVP — CSV import + transaction register

**Status: active**  
Spec folder: `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

## Context

First slice of the Finances module: **import bank and card CSV exports, store them, look at
them.** Nothing finance-related exists in the codebase today.

This partially delivers the roadmap's Financial-planning item (`agent-os/product/roadmap.md`
§ Financial planning). That item's MVP reads "Import CSVs; envelopes for known expenses and
contingencies; basic register and balances" — **envelopes are deliberately deferred** to
their own spec, once there is real data to design them against.

Two roadmap constraints are honoured here:

- "Fitness and finance MVPs should stay separate modules that **link into** nodes/goals
  rather than forking a second hierarchy." Finance gets its own tables with their own
  `userId`. No new `node_type` values, no second tree.
- Plaid (or SimpleFIN, or direct OFX) is the eventual destination, sequenced after CSV is
  trustworthy. So provenance is `(externalSource, externalId)` rather than anything
  CSV-specific, and account identity is an opaque external key. A future feed becomes a new
  `externalSource` writing into these same tables, not a second schema.

**Achieve had no finance module.** This is "beyond Achieve" territory — there is no fidelity
obligation and no `docs/achieve-planner/` reference that governs it.

## Source formats

Four real exports, all parsed with the existing `parseCsvRows` in `src/lib/csv/text.ts`
(quoted commas, CRLF, BOM, blank rows). No new dependency.

| Source           | Header                                                                                                     | Amount encoding                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Chase credit     | `Transaction Date, Post Date, Description, Category, Type, Amount, Memo`                                   | signed; negative = purchase           |
| Capital One card | `Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit`                            | two columns, one populated            |
| Capital One bank | `Account Number, Transaction Description, Transaction Date, Transaction Type, Transaction Amount, Balance` | unsigned + `Debit`/`Credit` + balance |

Edge cases confirmed in the actual files, each of which earns a test:

- Quoted fields with embedded commas — `"CURSOR, AI POWERED IDE"`, `"Deposit from MBI
ACCTVERIFY RAULIN,LEE"`.
- Three date shapes: `MM/DD/YYYY` (Chase), `MM/DD/YY` (Capital One bank), `YYYY-MM-DD`
  (Capital One card).
- Trailing blank line (Capital One card).
- **One genuinely duplicated row** — `2026-07-01, SBARRO, 6.59` appears twice. This is the
  case a naive dedup key silently eats.
- Chase carries no account number anywhere in the file; only the filename has `9910`.

## Decisions

| Topic         | Choice                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Schema scope  | Two tables — accounts and transactions. No categories table, no envelopes.                                   |
| Categories    | Bank string verbatim in `sourceCategory`; separate nullable user-editable `category`. No taxonomy, no rules. |
| Accounts      | Auto-created and matched by the importer from each file's own account key; renameable afterward.             |
| Register UI   | Rides the shared `DataGrid`, following `src/components/resources/`.                                          |
| Envelopes     | Deferred to a later spec.                                                                                    |
| Amount sign   | One rule: signed, **positive = money into the account**.                                                     |
| Money storage | `numeric(14,2)`, matching the existing cost columns. Sums in SQL, not JS floats.                             |
| Dedup         | `(externalSource, externalId)` where `externalId` is a fingerprint **including an occurrence ordinal**.      |
| Re-import     | Only ever inserts or skips — never updates. User edits survive.                                              |

### Amount sign

Positive is money into the account. A card purchase is negative, a payment to the card
positive; a bank deposit positive, a withdrawal negative. Chase already uses exactly this so
its column passes through unchanged; the other two formats normalise onto it. A credit card
reads as a liability account whose balance runs negative and moves toward zero as it is paid.

### Dedup — the part that has to be right

`externalSource` is the feed (`csv:chase-credit`, `csv:capitalone-card`,
`csv:capitalone-bank`; later `plaid`). `externalId` is a deterministic fingerprint over:

```
accountId | transactionDate | postedDate | description | signedAmount | occurrenceOrdinal
```

`occurrenceOrdinal` is the 0-based index among rows in the same file sharing all five
preceding fields. It exists for the SBARRO case: two identical $6.59 rows on one day become
ordinals 0 and 1, so both import; re-importing the same file regenerates ordinals 0 and 1,
so both are recognised and skipped. Without the ordinal the second row is silently dropped —
an invisible failure, which is why it gets its own unit test.

Deliberately **excluded** from the fingerprint: the running `Balance` column (banks restate
it) and `sourceCategory` (banks recategorise).

Enforced by the repo's established partial unique index, the shape `metricEntries` uses:

```ts
uniqueIndex(...).on(userId, externalSource, externalId).where(sql`external_id is not null`)
```

Inserts use `onConflictDoNothing()` and count created vs. skipped from `.returning()`, so
the database is the arbiter and a double-submitted upload cannot duplicate rows.

**Known limitation:** a transaction whose amount changes between pending and posted (tips)
fingerprints differently and imports twice. These exports contain only posted transactions,
so it does not bite today. Mitigation is a manual row delete, which the register provides.

## Acceptance criteria

- [ ] All four CSV formats import in one multi-file upload, format auto-detected per file
- [ ] Accounts auto-created and matched on re-import; renameable
- [ ] Signs normalised so positive is money into the account, across all three formats
- [ ] Quoted commas, all three date shapes, and blank lines survive parsing
- [ ] Re-importing the same files creates 0 rows and skips all of them
- [ ] Both identical SBARRO rows persist — one import, not a silent drop; no third on re-import
- [ ] User edits to `category` / `notes` survive re-import
- [ ] Register rides the shared DataGrid with sort, filter, search and saved views
- [ ] Cross-user isolation: a second user cannot read, change or delete another's rows

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Tasks

1. **Save spec documentation** — this folder.
2. **Schema + migration** — `finance_accounts`, `finance_transactions`, account-kind enum;
   `db:generate`, read the SQL, `db:migrate`; commit `.sql` + snapshot + journal together.
3. **Pure parsing layer** — `src/lib/finances/{types,money,formats,fingerprint}.ts` with unit
   tests for every edge case above.
4. **Import + persistence** — `{import,queries,mutations}.ts`, both integration suites with
   the two-user cases, and registration in `src/lib/db/crossUserReads.integration.test.ts`.
5. **Import route and panel** — `src/app/api/finances/import/route.ts` and
   `FinanceImportPanel.tsx`; wire into Settings → Import & export.
6. **Register UI** — page, actions, columns, view; nav entry in `modules.ts` plus an icon.
7. **Import the real data** — verify counts and signs, then re-import and verify dedup.
8. **Verify, freeze spec, update roadmap** — mark Financial planning partially delivered.

> While this spec is **active**, material changes to requirements, design or scope go into
> the sections above plus a row in **Changes from original plan**. Pure implementation
> detail does not. Freeze when verified.

## Out of scope (this spec)

Envelopes and budgeting, categorization rules or auto-categorization, transfer matching
between accounts, splits, reconciliation, reporting and charts, multi-currency, goal
linkage, and any API feed including Plaid.
