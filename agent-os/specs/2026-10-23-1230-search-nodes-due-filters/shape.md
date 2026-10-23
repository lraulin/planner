# search_nodes: due-date filters, deadline sort, compact rows — Shaping Notes

**Status: active**

## Scope

### In scope

- D1–D4 on `search_nodes` only.

### Out of scope

- Filtering on plan dates (`planStart`/`planEnd`) or appointment times.
- Changing the default `limit` (50) or other tools' paging.
- A byte bound in the shared `paginate()` helper; other list tools can adopt
  `fitPageToBudget` later if they need it.

## Context

- Naming follows `contracts.ts`: `dateKey` inputs, `dueOn` for a day-valued due date (as in
  `list_recurring_bills`), inclusive bounds as with `from`/`to`.
- `filterOutlinePage` stays pure; `searchNodes` supplies `today`.
