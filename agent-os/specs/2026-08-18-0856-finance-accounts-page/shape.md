# Finance Accounts page — Shaping Notes

**Status: active**

## Scope

A Finances **Accounts** page over the existing `finance_accounts` table, so bank deep-links
and the other user-owned account fields stop being hardcoded or unreachable.

What ships:

1. `/finances/accounts` — last tab in the Finances page bar. Shared DataGrid + drawer.
   Edit name, kind, institution, URL, closed. Delete with a confirmation that names the
   transaction count. Import remains the only create path.
2. `parseAccountUrl` accepts any `https` URL. The Chase / Capital One host allowlist goes.
3. `updateAccount` can set or clear `closedAt`. Import still never un-closes; the user can.

### Out of scope

- A new accounts table — `finance_accounts` already exists
- Manual create (cash, wallets, typed-in accounts)
- Envelopes / budgeting
- SimpleFIN rematch (stays in Settings)
- Hide closed accounts in the register picker (360 follow-up)
- A user-editable host allowlist
- Schema migration — `url` and `closedAt` are already columns
- Changing importer identity (`externalSource` / `externalKey`)

## How the shape was arrived at

The prompt was: the finances account links are good, but we should not be hardcoding that,
and maybe there should be an accounts table and a page to manage it.

Two facts settled the table question immediately:

- `finance_accounts` has been there since
  `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`, with `updateAccount` /
  `deleteAccount` tested and no UI calling them. That spec's own follow-up is this page.
- The "hardcoding" is `ALLOWED_HOSTS` in `src/lib/finances/accountUrl.ts` — Chase and
  Capital One only — plus the fact that nothing in the UI writes `url`.

Rejected alternatives:

- **A new table.** Would fork identity. Importers already match on
  `(userId, externalSource, externalKey)`.
- **A user-editable host allowlist.** Solves a problem the any-https rule does not have,
  and still needs a code-shaped list. `https` plus refusing `javascript:` is the XSS /
  open-redirect floor; a host list is Lee's two banks encoded as policy.
- **Manual create.** Out of the original register spec on purpose: a transaction is not
  typed in, it arrives from the bank. Same for the account it sits on.
- **Fold SimpleFIN matching onto this page.** Live-bank-sync already has a Settings
  matching screen whose job is "which register row does this feed land in." Mixing that
  with rename/URL/close is two questions on one surface.

## Decisions

Full statements live in `plan.md` D1–D7. In brief:

- **D1** Existing table, no create mutation.
- **D2** Any `https` URL; preserve the original string (`+`, `=`, `#`).
- **D3** Page last in the Finances bar (infrequent).
- **D4** DataGrid + drawer; catalog create verb is Import, not New account.
- **D5** User can close / reopen; import still never un-closes.
- **D6** Delete names the cascade count.
- **D7** SimpleFIN links stay in Settings.

## Context

- **Visuals:** None. Follow Commitments / Register / Resources.
- **References:** See `references.md`.
- **Product alignment:** Phase 3 Financial planning. Delivers the register spec's
  "Account management UI" follow-up. Envelopes remains the next named roadmap item.

## Standards Applied

- **components/navigation** — new Finances page in the registry; commands have a menu;
  unavailable is disabled with a reason, never absent.
- **components/data-grid** — shared `DataGrid`, not a hand-rolled table.
- **components/drawer-pattern** — right-sliding drawer for the full record; unsaved-changes
  on leave.
- **components/ux-principles** — dangerous delete is hard to do by accident; keyboard on
  desktop, tappable path on phone.
- **development/testing** — URL parse is pure; close/reopen and the existing
  update/delete battery stay in `*.integration.test.ts` with a second user.
- **development/security** — `https` only on stored hrefs; every mutation still takes
  `userId` first and proves ownership.
- **development/clean-code** — logic in `src/lib/finances/`, thin `actions.ts`, components
  never touch the db.
