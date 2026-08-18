# References for Advanced Find

## The Achieve source material

**There is almost none, and that is the finding.** `docs/achieve-planner/` was grepped in full
(seven files, ~550KB) for `advanced find`, `Search In`, `Quick Fields`, `Text Fields`,
`Date Fields`, `Note Fields`, `subrecord` / `sub-record`, `Match Case`, `Match Whole Word`,
`Regular Expression`, `Past Items`, `Completed Items`. Two hits:

- `docs/achieve-planner/release-log.txt:326` — under the 1.8.1 heading:
  `Feature: Advanced search functionality (Edit -> Advanced Find)`
- `docs/achieve-planner/online-help.md:2981` — the Edit Menu page, predating 1.8.1:
  `Find... — Find text within the current view` / `Find Next — Find the next occurrence of the
previously searched item`

`subrecord` appears **zero** times in the pack. So do `Quick Fields`, `Text Fields`,
`Note Fields` and `Date Fields`.

The nearest documented analogue is the File Organizer quick filter
(`docs/achieve-planner/online-help.md:2096`), which _"will search for your text string in the
title, description and keywords of the file items"_, with a `Filter…` button for _"more complex
search/filtering criteria"_ — the same two-tier shape. File Organizer is permanently out of
roadmap (no file storage), so it is an analogue only.

**Therefore:** `visuals/advanced-find-ap.png` is the primary source, and the Search In semantics
in `plan.md` are a reconstruction. See `shape.md` Decision 1.

## Governing specs

### `agent-os/specs/2026-08-02-1208-custom-column-filters/`

- **Relationship:** Extends; **supersedes** two of its "Out of scope (this slice)" entries.
- **What it deferred, verbatim:** `- Like, Not Like, Matches Regular Expression` and
  `- Cross-column expressions / global advanced find`.
- **What carries forward:** the operator vocabulary and the custom-criteria model.
- **What changes:** regex arrives, on the Advanced Find surface only. The grid quick search
  stays dumb.

### `agent-os/specs/2026-08-04-0924-grid-control-surface/`

- **Relationship:** Extends.
- **Relevant decisions:** progressive filter disclosure — _"quick search → column funnel →
  cross-column builder"_; the chip bar; `Showing N of M` counted before narrowing. It delivered
  the cross-column half of the deferral above, within one grid. Advanced Find is a fourth
  surface across entities, not a fourth rung inside a grid.

### `agent-os/specs/2026-07-29-1045-notes-markdown-editor/`

- **Relationship:** Extends — this is its named follow-up.
- **Relevant decisions:** rejected surfacing `nodes.notes` as rows in the Notes grid, and
  recorded that the underlying want was **cross-cutting search**. Notes stay their own table;
  Advanced Find is what reaches both.

### `agent-os/specs/2026-08-14-1142-view-in-outline/`

- **Relationship:** Extends.
- **Relevant decisions:** `?select=<nodeId>` means "this is the selected row", `?detail=` means
  "the form is open"; `outlineSelectPath` builds a fresh params object rather than patching the
  current page; unknown ids are ignored rather than erroring; ancestors are expanded so the row
  is actually on screen. A node result reuses all of it.

### `agent-os/specs/2026-08-13-0845-module-consolidation/` and `2026-08-13-0747-module-pages/`

- **Relationship:** Extends.
- **Relevant decisions:** module vs page vs view; a module with fewer than two built pages
  renders no page bar. Find is one destination, so it registers as a module and declares no
  pages.

### `agent-os/specs/2026-08-06-1010-command-surface/` + `2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends.
- **Relevant decisions:** one command registry read by every surface; a command without a `menu`
  is not shipped **except** `group: "go"` destinations, whose catalog is the sidebar. There is
  deliberately no Achieve **Edit** menu, which is where Achieve put Advanced Find; app-wide
  verbs live in **File**. Find registers as a destination, so it takes the `go.*` path.

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends.
- **Relevant decisions:** addressable view state goes in the URL; filters, sort and column
  layout go in `user_settings`. `?q=` is the former; sources / fields / options are the latter.

### `agent-os/specs/2026-08-09-0915-result-areas-without-state/`

- **Relevance:** Result Areas have no state and no completion, so the "Completed items" toggle
  must not silently exclude them.

## Similar implementations

### The existing matchers — what not to duplicate

- **`src/lib/grid/search.ts`** — `searchActive`, `rowMatchesSearch(values, query)`. Rung 1:
  lowercase substring, whitespace-split terms, AND across terms but any term may hit any
  column. Its header comment states the "deliberately dumb" rule that Advanced Find sits above.
- **`src/lib/notes/filter.ts`** — `NoteFilter` with `search`, `searchMode: "all" | "any"`,
  `searchInTitle` / `searchInBody` / `searchInOtherFields`. **The closest existing thing to this
  feature**, and the model for splitting a search across field classes.
- **`src/lib/agent/search.ts`** — `filterOutline` / `filterOutlinePage`. Its header states the
  load-once-then-filter posture: _"Personal outlines are small enough that load-once + filter is
  fine… Pure so unit tests do not need Postgres."_ That is the posture `src/lib/find/` adopts.
- **`src/lib/finances/transactionSearch.ts`** — `searchTransactions(rows, filter)`, the same
  shape for one entity.

### Query patterns

- **`src/lib/tree/queries.ts`** — `loadOutline(userId)`. One recursive CTE returning nodes plus
  all four `*_details` tables flattened, ordered by materialised path. **This is the outline
  corpus**; Find reuses it rather than writing a second tree read. Note `user_id` is repeated in
  both arms of the CTE.
- **`src/lib/finances/queries.ts`** — `scopeConditions(userId, filter)` returning a condition
  array, so _"a new filter cannot be added to the list query and forgotten in the total."_ The
  template for a multi-source scoped read.
- **`src/lib/contacts/queries.ts`** — the `innerJoin(nodes, …)` + `eq(nodes.userId, userId)`
  pattern that the four `*_details` tables require, since they carry no `userId` of their own.
- **`src/lib/db/crossUserReads.integration.test.ts`** — the repo-wide sweep for a dropped
  `userId`. `loadFindCorpus` must be registered here; `security.md` says a reader that only ever
  runs in a one-user test will not catch itself.

### UI

- **`src/components/grid/GridSearchBox.tsx`** — local draft, external-value adoption without
  clobbering typing, Escape clears. The query box borrows its input handling but **not** its
  debounce-and-commit, since Find is explicit.
- **`src/components/grid/GridFilterDialog.tsx`** — "the draft is local until OK" for the
  Sources / Fields / Options popovers.
- **`src/components/notes/NoteFilterDialog.tsx`** — the field-class checkbox group, already
  built once.
- **`src/app/notes/actions.ts`** — `loadNoteIdsMatchingFilter`, the precedent for a read-only
  server action using `runQuery` from `src/app/actionResult.ts` (no revalidate).
- **`src/app/chooser/page.tsx`** — the shape of a single-destination module page: `force-dynamic`,
  resolve `userId`, load, `<AppShell active="…">` with a `<Suspense>` around the client view.
- **`src/components/shell/globalCommands.ts`** — `go.*` generated from `BUILT_MODULES`, and the
  in-file precedent for attaching a chord to one generated command (`app.capture` /
  `QUICK_CAPTURE`).
- **`src/lib/url/viewState.ts`** — param constants, `asRecordId` / `asDateKey` validators,
  `outlineSelectPath`, `notesPath`. `Q_PARAM`, `asSearchQuery` and `findPath` join them.
