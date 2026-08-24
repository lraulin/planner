# Register prepared rows — Shaping Notes

**Status: active**

## Scope

- Replace “send the whole ledger to the browser” with a server-prepared index and 100-row detail blocks.
- Virtualize only the Register’s use of DataGrid.
- Move Track-as-bill history off the client ledger.

### Out of scope

- Numbered pagination.
- Replacing DataGrid with AG Grid or TanStack Table.
- A SQL filter compiler. Server/database work is already fast; the pipeline runs in process on `listTransactions`.
- Virtualizing Outline, Notes, or other grids.

## Decisions

- Shared `registerFields` accessors so financeColumns and the server cannot drift.
- `preparedDisplay` + `virtualize` are opt-in DataGrid props.
- Collapsed groups omit descendants from the logical index (same as today’s `applyGroupCollapse`).
- Hidden Payee remains filterable/searchable.

## Context

- **Visuals:** None.
- **References:** See `references.md`.
- **Product alignment:** Daily-use performance; Finances Register at production scale.
