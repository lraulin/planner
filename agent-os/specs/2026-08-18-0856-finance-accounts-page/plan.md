# Finance Accounts page

**Status: frozen / complete** (2026-08-18)
Spec folder: `agent-os/specs/2026-08-18-0856-finance-accounts-page/`

This is the as-built record. Further change opens a new delta-spec.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — `finance_accounts` identity (`externalSource` + `externalKey`), the sign rule, `updateAccount` / `deleteAccount` already exist and are tested. This delivers that spec's follow-up: _"Account management UI: `updateAccount` and `deleteAccount` exist and are tested, but nothing in the register calls them yet."_
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — a Finances destination is a registered **page**, not a new module and not a Settings panel.
- **Extends:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — dashboard/register name-links stay; Finances page order is by how often a page is read, not when it was built.
- **Does not supersede:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` — `bank_account_links` and the Settings matching screen stay there. This page manages register accounts, not SimpleFIN bindings.

No named URL-allowlist decision is superseded: `ALLOWED_HOSTS` in `src/lib/finances/accountUrl.ts` was unspecced.

## Context

Clicking an account name on the Dashboard or Register opens the real bank page. That is useful. The URLs live on `finance_accounts.url`, but the only way they get there is a mutation nobody calls from the UI, and the only hosts the mutation will accept are hardcoded Chase and Capital One domains.

The accounts table already exists. Importers create the rows; `updateAccount` and `deleteAccount` are tested, including the two-user battery. What is missing is the page that lets a person edit name, kind, institution, URL, and closed state — and a URL rule that does not need a code change the next time a bank is added.

Roadmap `agent-os/product/roadmap.md` § Financial planning still names **Envelopes** as Next. This is not that. It is the unshipped catalog UI from the original register spec, plus dropping the host allowlist. Envelopes stay the next named finance item.

Achieve had no finance module. No `docs/achieve-planner/` reference governs this.

## Decisions

- **D1 — Existing table, no new table, no create mutation.** Work is a page over `finance_accounts`. Accounts still appear when a file is imported or a live feed is linked. Cash / wallets / "I typed one" stays out.
- **D2 — Any `https` URL.** `parseAccountUrl` keeps the original string (Capital One paths contain `+` / `=`; Chase's deep link lives in the hash — `URL.href` would decode or drop those). Refuse `javascript:`, `http:`, and anything `new URL` cannot parse. Empty string clears. The host allowlist goes. Error copy becomes "That is not an https URL." — it is no longer a bank-host check.
- **D3 — `/finances/accounts`, last in the page bar.** Dashboard → Commitments → Insights → Register → Statements → Orders → **Accounts**. Infrequent maintenance, so it sits after the pages you read. `pages.test.ts` asserts the order.
- **D4 — Shared DataGrid + drawer, catalog commands.** Same shape as Resources / Register. Drawer edits name, kind, institution, URL, closed. Grid shows those plus last four (`externalKey`), balance, transaction count. `externalSource` / `externalKey` are read-only — they are importer identity. The catalog create verb is **Import transactions…** (same as Register), not New account. File ▸ Import already exists; this keeps the catalog pattern rather than inventing a create that D1 forbids.
- **D5 — `updateAccount` can set or clear `closedAt`.** Import still never un-closes. The user can. No new mutation name; extend `AccountEdit` with `closedOn?: string | null` (a `YYYY-MM-DD` key, converted in the mutation). Never `startOfDay`.
- **D6 — Delete confirms with the transaction count.** `deleteAccount` already cascades. `FinanceAccountRow.transactionCount` is already on `listAccounts`. ConfirmDialog: "Delete {name} and its {n} transactions?" Zero is still a confirm ("and its 0 transactions" is honest; do not special-case the copy into a different sentence).
- **D7 — SimpleFIN rematch stays in Settings.** This page does not create, edit, or display `bank_account_links`.

### Out of scope

- Envelopes / budgeting
- Manual account create
- SimpleFIN / Plaid rematching
- Hide closed accounts in the register picker (360 follow-up; still a later spec)
- A user-editable host allowlist
- New schema / migration — `url` and `closedAt` already exist
- Changing importer identity (`externalSource` / `externalKey`)

## Acceptance criteria

- [x] Finances page bar lists **Accounts** last; `/finances/accounts` renders the user's accounts in the shared DataGrid.
- [x] Opening a row edits name, kind, institution, URL, and closed in a drawer; Save persists; importer identity is visible and not editable.
- [x] A Chase or Capital One URL still works. `https://www.coinbase.com` saved (any https). `javascript:alert(1)` is refused with "That is not an https URL."
- [x] Clearing the URL field removes the name-link; setting one makes the name a link on Register (and Dashboard for accounts it lists) without any other change there.
- [x] Closing an account sets `closedAt`; reopening clears it. Dashboard continues to hide closed accounts (CD •••2957 is closed and absent from Dashboard, present here and on Register).
- [x] Delete asks for confirmation that names the account and its transaction count. Cancel leaves the row. The cascade itself is the existing `deleteAccount` integration test — not exercised on live data.
- [x] There is no New account command. Import remains the create path (`Import transactions…`).
- [x] A second user cannot read, change, close, or delete the first user's account.
- [x] `npm run test:unit` (2707), integration mutations 49/49 with Postgres up, typecheck, lint. `npm run smoke` — 56 routes including `/finances/accounts`. Driven in the browser on desktop and 390×844.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                    | Why                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `AccountEdit` takes `closedOn?: string \| null` (date key), not `closedAt?: Date \| null` | Calendar days cross the action boundary as `YYYY-MM-DD`; `fromDateKey` lives in the mutation so the drawer never constructs a `Date`.    |
| 2   | Live delete confirmation was cancelled, not confirmed                                     | Confirming would cascade hundreds of real transactions. The dialog copy was verified; the cascade remains the existing integration test. |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-18-0856-finance-accounts-page/` with:

- **plan.md** — this full plan (**Status: active**), including the empty **Changes from original plan** table
- **shape.md** — scope, decisions, context from shaping
- **standards.md** — full text of the confirmed standards (copy, not `@` references):
  - `agent-os/standards/components/navigation.md`
  - `agent-os/standards/components/data-grid.md`
  - `agent-os/standards/components/drawer-pattern.md`
  - `agent-os/standards/components/ux-principles.md`
  - `agent-os/standards/development/testing.md`
  - `agent-os/standards/development/security.md`
  - `agent-os/standards/development/clean-code.md`
- **references.md** — governing specs and code studied
- **visuals/** — empty; none were provided

Commit the spec folder before implementation.

## Task 2: Any-https URL rule

`src/lib/finances/accountUrl.ts`:

- Drop `ALLOWED_HOSTS`.
- Keep: trim; empty → `""`; `new URL` must succeed; protocol must be `https:`; return the original trimmed string, not `url.href`.
- Update the file comment and the `finance_accounts.url` comment in `src/db/schema.ts` (it currently says "Only https hosts we actually use").

Tests:

- `accountUrl.test.ts` — Cap One `+`/`=` and Chase `#` still pass; `https://example.com` now passes; blank clears; `javascript:` and `http://secure.chase.com/x` still refuse.
- `mutations.integration.test.ts` — store an `https://example.com/…` URL; refuse `javascript:`; error text is the new sentence.

No migration.

## Task 3: Close / reopen on `updateAccount`

Extend `AccountEdit` with `closedAt?: Date | null`.

- Setting a `Date` writes it (UTC-noon calendar day if the UI sends a date key — convert in the mutation or a tiny helper, not in the component).
- `null` reopens.
- Import's "never un-close" rule is unchanged.

Integration tests: close, reopen, still refuse a blank name, still isolate across users (the existing two-user suite already covers rename/delete; add close to it).

## Task 4: Accounts page

**Registry.** Add `{ id: "accounts", label: "Accounts", segment: "accounts", status: "built", keywords: "bank url rename close delete" }` as the last Finances page in `src/lib/navigation/pages.ts`. Update the order assertion in `pages.test.ts`.

**Route.** `src/app/finances/accounts/page.tsx` — `force-dynamic`, `getCurrentUserId`, `listAccounts`, `AppShell active="finances"`. Same shape as `register/page.tsx`.

**Grid.** `src/components/finances/accounts/` — `AccountsView` + `accountColumns.tsx` + `AccountDrawer`. Follow `ResourcesView` / `FinancesView`:

- Columns: name (link if `url`), kind (use the same labels Dashboard already has — extract `KIND_LABELS` to `src/lib/finances/` rather than a third copy), institution, last four, URL, closed, balance, transaction count.
- `catalogCapabilities`: `createLabel: "Import transactions…"`, `openLabel: "Open account"`, delete via ConfirmDialog. Wire create to the existing File ▸ Import surface the other Finances pages use — do not invent a second importer.
- Drawer: name, kind select (`checking` … `other`), institution, URL, closed checkbox (or date). Read-only: last four, source, balance, count. Footer Cancel | Save | Save & Close. Unsaved-changes on leave.
- Delete ConfirmDialog uses `transactionCount`.
- `?detail=` via `useViewStateUrl`, same as Resources.
- Grid scope `grid:finances-accounts` (or the module's existing convention — match Register / Commitments, do not invent a third settings-scope kind).

**Actions.** `updateAccountAction` / `deleteAccountAction` already live in `src/app/finances/actions.ts`. Extend the edit type for `closedAt`. No new `"use server"` logic.

**Dashboard / Register.** Do not change the name-link rendering. They already read `account.url`. After Task 2 they will accept whatever https URL the page saved.

Logic stays in `src/lib/finances/**`. No React component tests.

## Task 5: Verify, freeze spec, update roadmap

- Tick every acceptance criterion. Drive the page in the browser (edit URL → Dashboard link; close; cancel delete; confirm delete on a throwaway). Desktop and a phone viewport for the drawer-as-sheet.
- `npm run test:unit`, `npm run test:integration` (watch for the skip warning), `npm run typecheck`, `npm run lint`. Dev server up, then `npm run smoke`.
- Update `plan.md` / `shape.md` for any material as-built drift; complete **Changes from original plan**.
- Mark files **Status: frozen / complete** (date). Leftovers (hide-closed in the register picker, manual create) go under **Follow-ups (new work — not amendments to this frozen spec)**.
- Update `agent-os/product/roadmap.md` § Financial planning: note the Accounts page as delivered catalog UI. Envelopes remains **Next**.

Commit per `agent-os/standards/development/commits.md` (one logical change per commit, imperative subject, Spec trailer). Push to `origin/master`.

## Follow-ups (new work — not amendments to this frozen spec)

- Hide closed accounts in the register picker (360 follow-up, still open).
- Manual account create (cash / wallets) if a feed-less account is ever needed.
- Confirm-delete of a throwaway account in the live app — skipped here to avoid cascading real history.

---

Tasks 1–5 completed 2026-08-18.
