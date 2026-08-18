# References for Finance Accounts page

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. Delivers its follow-up: account management UI.
- **What carries forward:** two tables (accounts + transactions), identity is
  `(externalSource, externalKey)` never the name, positive = money into the account,
  import never updates an existing row, `updateAccount` / `deleteAccount` already exist
  and are cross-user tested.
- **What this adds:** the page that calls those mutations, plus `closedAt` on the edit
  type, plus loosening the later (unspecced) URL host allowlist.

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends.
- **Relevant decisions:** a destination inside Finances is a registered **page**. One
  registry (`src/lib/navigation/pages.ts`), `status: "built"`, page bar appears because
  Finances already has more than one built page. Focused flows are not pages.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Extends. Nothing superseded.
- **Relevant decisions:** page bar ordered by how often a page is read; Dashboard
  already renders `account.url` as the name-link and already hides `closedAt !== null`.
  This page writes the fields those surfaces read.

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Does not supersede. Cited so the next agent does not merge the two
  "account link" concepts.
- **Relevant decisions:** `bank_account_links` binds a SimpleFIN account to a
  `finance_accounts` row. Matching lives in Settings. This page does not touch that
  table.

### `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/`

- **Relationship:** Not governing. Its follow-up "Hide closed accounts in the register
  picker" stays out of this spec.

## Similar implementations

### URL parse — `src/lib/finances/accountUrl.ts`

- **Relevance:** The hardcoded thing. Task 2 deletes `ALLOWED_HOSTS` and keeps the
  `https` + original-string rule. Tests in `accountUrl.test.ts` already pin Cap One
  `+`/`=` and Chase `#`.

### Account mutations — `src/lib/finances/mutations.ts` `updateAccount` / `deleteAccount`

- **Relevance:** The write path. `requireAccount` is the ownership pattern. Task 3 adds
  `closedAt` to `AccountEdit`. Actions already wrap both in `src/app/finances/actions.ts`.

### Account list — `src/lib/finances/queries.ts` `listAccounts`

- **Relevance:** Already returns name, kind, institution, url, closedAt, balances,
  `transactionCount`. The page does not need a new query.

### Catalog grid — `src/components/resources/ResourcesView.tsx`

- **Relevance:** Flat catalog: DataGrid + drawer + `catalogCapabilities` + ConfirmDialog
  - `useViewStateUrl`. Accounts is this shape without a create-blank-row verb.

### Register — `src/components/finances/FinancesView.tsx`

- **Relevance:** Maps the catalog create verb to **Import transactions…**. Accounts does
  the same. Name-links already read `account.url`.

### Commitments page — `src/app/finances/commitments/page.tsx`

- **Relevance:** A Finances catalog page: `force-dynamic`, `AppShell`, thin server
  component, client view.

### Kind labels — `src/components/finances/dashboard/DashboardView.tsx` `KIND_LABELS`

- **Relevance:** Extract to `src/lib/finances/` so the grid, drawer, and dashboard share
  one map rather than a third copy.

### Page registry — `src/lib/navigation/pages.ts` + `pages.test.ts`

- **Relevance:** Finances page order is asserted. Accounts is appended; the test must
  name it last.
