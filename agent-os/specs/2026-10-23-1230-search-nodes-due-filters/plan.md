# search_nodes: due-date filters, deadline sort, compact rows

**Status: active**
Spec folder: `agent-os/specs/2026-10-23-1230-search-nodes-due-filters/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` (`search_nodes` input and
  output contracts, paging, response budget).

## Context

Planner Bot had no way to ask "what is overdue" or "what is due by Friday". It paged through
`search_nodes` (50 full rows per page, outline order) and filtered deadlines itself. Full rows
carry `path`, which repeats every ancestor's name; on a deep outline with long names 50 rows
pass the 20,000-byte gateway cap, which drops the rest of the text without an error.

## Decisions

### D1: `dueAfter`, `dueBefore`, `overdue`

- `dueAfter` / `dueBefore`: inclusive YYYY-MM-DD, like `from`/`to` elsewhere. Rows with no
  deadline are excluded. `dueAfter` later than `dueBefore` is a validation error.
- `overdue: true`: deadline day strictly before today; `false`: everything else (undated, due
  today or later).
- Deadlines are calendar days stored at UTC noon, so filters compare day keys
  (`toDateKey`), never instants. Today is the reader's day (`readerTodayKey()`,
  America/New_York), passed into the pure filter (dates standard: no rule reads the server
  zone).
- Completed and cancelled rows stay hidden unless `includeCompleted` — an overdue list is open
  work.

### D2: `sort`

`outline` (tree order) or `deadline` (soonest first, undated last, stable). Defaults to
`deadline` when any due filter is set, else `outline` — the old order, so existing calls are
unchanged. Paging happens after sorting.

### D3: `fields: "summary" | "compact"`

Default `summary` (unchanged rows). `compact` returns `id, parentId, type, name, state,
priorityLetter, priorityRank, dueOn, focus` — no `path`, `depth`, or effort; `dueOn` is the
deadline day. About three times as many rows fit per page.

### D4: Byte-bounded pages

A page stops before its JSON passes 16 KB (`SEARCH_NODES_BYTE_BUDGET`), with
`returned < limit`, `hasMore: true` and `nextOffset` at the first row left out. At least one
row is always returned. `pageInfo` keeps its shape. This applies to every `search_nodes` call,
not only due filters, since long paths could already overflow at the default limit.

## Acceptance

- [x] Inclusive bounds, day-key comparison, overdue split, completed hidden (unit tests).
- [x] Deadline sort: stable, undated last, default switch, paging after sort.
- [x] Compact row shape and output schema.
- [x] Budget tests on a ~550-node outline where 50 summary rows exceed 20,000 bytes: default
      page and 200-limit compact page under 16 KB; following `nextOffset` visits every match.
- [x] `docs/agent-api.md` regenerated.

## Tasks

1. Save spec documentation (this folder).
2. Filter, sort, compact rows and byte bound in `src/lib/agent/search.ts`.
3. Contracts, tool text, `searchNodes` argument parsing.
4. Unit and response-budget tests.

## Changes from original plan

| What     | Why                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| D4 added | The budget test showed 50 summary rows at ~32 KB on the deep fixture; a smaller default limit alone would not bound long paths. |
