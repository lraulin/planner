# Register prepared rows and virtualization

**Status: active**  
Spec folder: `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — Register still rides the shared DataGrid with sort, filter, search, grouping, and saved views.
- **Extends:** `agent-os/specs/2026-08-10-1940-daily-use-performance/` — grid row memoization and local-first navigation stay; this is the measured virtualization delta that spec deferred.
- **Supersedes:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` change #2 — “No server-side date window; the whole register loads and the grid narrows it.”
- **Supersedes:** the DataGrid standing decision that virtualization and server-side filter/sort were out of scope until measured. Numbered pagination and AG Grid remain rejected.
- **Does not supersede:** collapse-as-default for prior years. Collapsed groups still omit descendants from the _index_; they are no longer the only way to keep the DOM small.

## Context

A 7,030-row production ledger produced a 5.85 MB initial payload, 368,756 DOM elements, 15.5 seconds of script evaluation, and 8.8 seconds of blocking time. Database and network were already fast. Collapsing old years could not solve this because every transaction was still transferred, hydrated, filtered, and grouped in the browser.

Actual Budget’s register loads a compact index and fetches row details in blocks. That pattern, applied to our shared DataGrid rather than AG Grid, is the fix.

## Decisions

- **Server-prepared index + 100-row detail blocks.** The server loads the user’s ledger, applies the existing shared grid semantics, and returns ordered transaction/group references, counts, facets, and the first 100 transaction records. Expanding all may return every id; it never returns every detail record.
- **Opt-in DataGrid virtualization** with `@tanstack/react-virtual`. Other grids keep the local row model. Markup, columns, menus, saved views, filters, grouping, keyboard, and compact mobile stay.
- **No numbered pagination. No AG Grid.**
- **Search debounce 200 ms.** Collapse keeps the toggled header as the scroll anchor via the existing group id.
- **Track as bill history** is a transaction-specific server query. Export/Copy run the complete server query on demand. Drawer deep links load one transaction by id.
- **Payee stays a defined column** and participates in filter/search even when hidden. Visible-column defaults do not change.

## Acceptance criteria

- [ ] All-history search, hidden Payee filters, multi-sort stability, grouping/collapse, counts/facets, stale settings, and 100-row blocks without gaps or duplicates are unit-tested.
- [ ] Imports, deletions, and edits reload the index around the selected row rather than `listTransactionsAction()` of the whole ledger. **Run rules** is retired by `2026-08-24-1522-category-by-kind-and-history`.
- [ ] At most ~150 grid rows are mounted; the initial RSC payload is a compact index plus one block, not 7,030 full rows.
- [ ] Drawer, Track as bill, and complete export remain correct without a client-side full ledger.
- [ ] lint, typecheck, Postgres tests without skip warnings, production build, smoke, browser Register verification.

## Changes from original plan

| #   | Change                                                                                                            | Why                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Carry whole-ledger Category assignability as compact index metadata and apply it to every lazy row and deep link. | A 100-row block cannot decide whether a transfer's counterpart is on- or off-budget. Without the index fact, the backlog excluded on-budget card payments while the cell and drawer still offered Categorize.   |
| 2   | Register reload no longer lists **Run rules** as a trigger.                                                       | `2026-08-24-1522-category-by-kind-and-history` retires Rules; imports, deletions, and edits remain.                                                                                                             |
| 3   | Tag chips in the Register stay on one line (`nowrap` + truncate), and DataGrid cells clip overflow.               | Virtual rows are a fixed `--row-height`. `flex-wrap` on `#software-and-development` made the cell ~38px in a 28px row; `items-center` then painted that chip across the neighbours. Drawer tags may still wrap. |

## Task 1: Save spec documentation

This folder.

## Task 2: Shared accessors and Register pipeline

## Task 3: Server actions and Register host

## Task 4: DataGrid prepared/virtual row model

## Task 5: Verify
