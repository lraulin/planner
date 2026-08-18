# Advanced Find — search across every item type

**Status: frozen / complete** (2026-08-18)  
Spec folder: `agent-os/specs/2026-08-18-1012-advanced-find/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-02-1208-custom-column-filters/` — the filter operator
  vocabulary and the custom-criteria model
- **Supersedes:** `agent-os/specs/2026-08-02-1208-custom-column-filters/` — its two
  "Out of scope (this slice)" entries, **`Matches Regular Expression`** and
  **`Cross-column expressions / global advanced find`**. The cross-column half was already
  delivered by grid-control-surface; this spec delivers the global-find half and brings regex
  in on the Advanced Find surface only (the grid quick search stays dumb).
- **Extends:** `agent-os/specs/2026-08-04-0924-grid-control-surface/` — progressive filter
  disclosure (quick search → column funnel → cross-column builder), the chip bar,
  `Showing N of M`. Advanced Find is a fourth surface, not a fourth rung inside a grid.
- **Extends:** `agent-os/specs/2026-07-29-1045-notes-markdown-editor/` — which recorded
  **cross-cutting search** as the real want behind two of its rejections, and listed it as a
  freeze follow-up. This is that follow-up.
- **Extends:** `agent-os/specs/2026-08-14-1142-view-in-outline/` — `?select=` and
  `outlineSelectPath`, reused to open a node result.
- **Extends:** `agent-os/specs/2026-08-13-0845-module-consolidation/` — modules vs pages;
  Find is a module with one destination, so it renders no page bar.
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` and
  `agent-os/specs/2026-08-13-1050-menu-completeness/` — one command registry; `go.*` is the
  one exception to "a command without a menu is not shipped", with the sidebar as its catalog.
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — addressable view state
  in the URL, filters in `user_settings`.

## Context

Achieve Planner shipped an **Advanced Find** dialog (`Edit → Advanced Find`, added in 1.8.1):
one search box, a set of "Search In" scope checkboxes, match options, and a results list with
`Name | Type | Field | Text` columns plus View / Open buttons.

Planner has no equivalent. Every search today is scoped to one grid or one module:

- `src/lib/grid/search.ts` — the per-grid quick search, deliberately dumb substring
- `src/lib/notes/filter.ts` — the Notes filter dialog
- `src/lib/agent/search.ts`, `src/lib/finances/transactionSearch.ts` — one entity each
- `⌘K` is **commands only** by standard (`navigation.md`), and there is no palette on phone

There is no way to answer _"where did I write that word?"_ across goals, projects, tasks, node
sub-records, notes, appointments, contacts, finances, fitness and the library.

`agent-os/product/roadmap.md:147` carries this only as Phase-1 friction — "find-in-outline",
framed far more narrowly than a cross-entity find.

### The reference pack is silent — this is design, not fidelity

**`docs/achieve-planner/` does not document Advanced Find.** All seven files were grepped for
`advanced find`, `Search In`, `Quick Fields`, `Text Fields`, `Date Fields`, `Note Fields`,
`subrecord`, `Match Case`, `Match Whole Word`, `Regular Expression`, `Past Items`,
`Completed Items`. Two hits:

- `release-log.txt:326` — `Feature: Advanced search functionality (Edit -> Advanced Find)`
- `online-help.md:2981` — the older, narrower `Find...` / `Find Next`:
  _"Find text within the current view"_

`mission.md` says "default when ambiguous: match Achieve", but there is nothing here to match
against beyond `visuals/advanced-find-ap.png`. **The Search In semantics below were
reconstructed from the screenshot and our own schema, not looked up.** A future agent should
not assume they are Achieve parity, and should not "correct" them against the doc pack — the
doc pack has nothing to say.

## Decisions

### 1. Find is a module with its own page, not a dialog

A `find` entry in `src/components/shell/modules.ts` → a sidebar row and a `/find` page. One
destination, so no page bar (same as Chooser and Metrics); it appears in `MoreSheet` on phone
automatically because that surface reads the registry.

Rejected, with reasons, because Achieve's shape was a modal:

- **A modal.** `ux-principles.md` reserves modals for destructive confirmations, blocking
  decisions and fast capture. Browsing a results list and opening records from it is none of
  those. A modal also cannot be linked or reloaded, and a scrollable grid inside an overlay is
  bad at 390px.
- **Extending `⌘K`.** `navigation.md` fixes the palette as the command-search surface and
  forbids a second search control competing with it; there is also deliberately no palette
  below `md`, so a phone user would have no path at all.

### 2. Results are a `DataGrid`, grouped by Type

| Column    | Content                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**  | Type glyph + label — Task, Project, Note, Appointment, Contact, Transaction…                                                                                          |
| **Name**  | The record's headline field                                                                                                                                           |
| **Where** | Module / ancestor path (`Plan ▸ Health & Fitness ▸ Freewriting`). Our tree makes this the useful column; Achieve crammed it into the Name cell as `[Personal Devel…]` |
| **Field** | Which field(s) matched — `Notes`, or `Notes, Description`                                                                                                             |
| **Match** | Snippet around the first hit                                                                                                                                          |

`DataGrid` brings sort, grouping, quick-search-within-results, column funnels, chips,
`Showing N of M`, saved views, the row menu and the compact/touch behaviour — `clean-code.md`:
_"There is one of each thing here."_

**Deliberate divergence from Achieve: one row per record, not per (record, field).** The
screenshot shows the same note twice when two of its fields hit. `Field` lists every matching
field name instead, so a record appears once.

### 3. Sources — everything, in nine families

| Source       | Tables                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Outline      | `nodes` + `task_details`, `project_details`, `goal_details`, `result_area_details`               |
| Sub-records  | `node_items` — ~30 text columns across 16 `kind`s (Achieve's "subrecords")                       |
| Notes        | `notes`                                                                                          |
| Appointments | `appointments`                                                                                   |
| Contacts     | `contacts` + `contact_items`                                                                     |
| Library      | `resources`, `jobs`, `residences`, `life_events`                                                 |
| Metrics      | `metrics`                                                                                        |
| Fitness      | `exercises`, `workout_sessions`, `workout_session_exercises`                                     |
| Finances     | `finance_transactions`, `finance_accounts`, `finance_recurring_bills`, `finance_recurring_spend` |

`node_items`, `contact_items` and `workout_session_exercises` are **not** sources — they are
sub-records of the Outline, Contacts and Fitness sources, reached through the `subrecord`
field class. Sources and field classes are the two independent axes Achieve's dialog drew.

**Never searched:** `users`, `sessions`, `accounts` (holds `password`, `accessToken`,
`refreshToken`), `verifications`, `googleCalendarLinks`, `googleContactSyncs`, `userSettings`.

### 4. "Search In" field classes — three, not Achieve's five

Achieve's `Quick Fields / Text Fields / Date Fields / Note Fields / Subrecords` cannot be
reconstructed (see Context) and map badly onto our schema. The reconstruction:

- **Names & titles** — the headline field (`nodes.name`, `notes.title`, `appointments.subject`,
  `contacts.fileAs`, `finance_transactions.description`, …)
- **Detail text** — every other text column on the record
- **Sub-records** — the child lists (`node_items`, `contact_items`,
  `workout_session_exercises`)

**Achieve's Date Fields is dropped.** Our dates are typed columns governed by
`product/date-model.md`, not free text; matching "foo" against one is meaningless here.

Two include-toggles, both **off** by default, mirroring Achieve's Completed Items / Past Items:

- **Completed items** — complete-state nodes. Result Areas can never be complete
  (`2026-08-09-0915-result-areas-without-state`), so the toggle does not affect them.
- **Shelved / past items** — postponed and deferred nodes, and past appointments, per
  `product/date-model.md`.

### 5. Match options: case, whole word, and regex

One pure matcher in `src/lib/find/matcher.ts`. An invalid regex produces an inline error on
the box — never a throw, never a silent zero-match.

`data-grid.md` says _"Keep search dumb — substring only, no operators, no field syntax, no
regex"_. **That governs rung 1, the grid quick search**, and the same paragraph sends
expressiveness to a higher rung. Advanced Find is that rung, on its own surface. This is not a
conflict and should not be "fixed" back.

### 6. Search runs on Enter or the Find button

Not as-you-type: one Find touches ~12 tables. Changing a source, field class or option re-runs
an **existing** search automatically, so the controls still feel live. Minimum query length 2.
Results capped at **1000**, with a visible "narrow your search" row when the cap is hit.

### 7. URL and persistence

`?q=` lives in the URL — it is what the page is about, so Back and reload work and the first
load renders results server-side. Sources, field classes and options live in `user_settings`
under a new `find` scope via `useSetting`: `viewState.ts` is explicit that _"filters, sort and
column layout stay out of the URL"_, and `data-grid.md` requires every preference to persist.

### 8. Opening a result reuses existing navigation

Pure mapping in `src/lib/find/targets.ts`:

| Kind                                    | Href                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| node                                    | `/plan/outline?select=<id>&detail=<id>`                                                                 |
| node sub-record                         | the owning node's detail drawer                                                                         |
| note                                    | `notesPath(id)`                                                                                         |
| appointment                             | `/schedule/calendar?date=…&detail=<id>`                                                                 |
| contact                                 | `/library/contacts?detail=<id>`                                                                         |
| resource / job / residence / life event | the Library page + `?detail=`                                                                           |
| metric                                  | `/metrics?detail=<id>`                                                                                  |
| exercise / session                      | `/fitness/exercises/<id>`, `/fitness/sessions/<id>`                                                     |
| transaction / account / bill            | `/finances/register?detail=<id>`, `/finances/accounts?detail=<id>`, `/finances/commitments?detail=<id>` |

Row menu: **Open** (`⏎` / double-click / tap) and, for nodes, the existing
`record.view-in-outline`.

### 9. The sidebar's `Search…` row becomes `Commands…`

Two "search" affordances in one rail is the ambiguity `navigation.md` exists to prevent. The
row's own tooltip already reads "Search modules and commands". `navigation.md` names that row
by its label, so the standard is edited in the same change rather than left disagreeing.

## Risk

`loadFindCorpus` reads text columns from ~12 tables per Find. Load-then-filter-in-JS is the
endorsed pattern here (`src/lib/agent/search.ts`) and `loadOutline` already runs on every Plan
page at this user's scale. **`finance_transactions` is the one unbounded table.** If Find gets
slow, the fix is an `ILIKE` **prefilter** in SQL for the non-regex case — a superset that
narrows I/O while the JS matcher stays the sole authority on what matches, so it does not
duplicate the rule. Out of scope here; it is a delta-spec trigger, not a v1 task.

## Acceptance criteria

- [x] `/find` exists as a module: a sidebar row, a `MoreSheet` row on phone, a `go.find` palette
      entry, and `⌘⇧F` printed and working. No page bar (one destination).
- [x] A query finds matches in all eight source families, including `node_items` sub-records and
      the four `*_details` tables.
- [x] One row per record. A record matching in three fields appears once, with all three named
      in `Field`.
- [x] Sources, field classes and options narrow the search, are visible as chips, and persist
      across reloads through `user_settings`.
- [x] Completed and Shelved/past items are excluded by default and included when toggled.
- [x] Match case, whole word and regex all work. An invalid regex shows an inline error and
      leaves the previous results alone.
- [x] `?q=` round-trips: reload and Back restore the search. The first load is **not**
      server-rendered — see change 1.
- [x] Opening a result lands on the right record with its drawer open, **except** for
      appointments, metrics, life events and commitments, whose views have no deep link —
      see change 4.
- [x] Over 1000 matches shows the cap notice rather than silently truncating.
- [x] Cross-user: a second user searching a word that exists only in the first user's data gets
      zero results from **every** source. Registered in `crossUserReads.integration.test.ts`.
- [x] Compact verified at 390×844 (no horizontal scroll, ≥16px query input, 44px rows, tap
      opens, long-press menus), then re-checked at 1280×800.
- [x] `npm test` (integration tests not skipped), lint, typecheck, and `npm run smoke` pass.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                           | Why                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The first load is **not** server-rendered. The page reads `?q=` and the client runs the search after hydration.                  | Shelf expiry and "is this appointment past" depend on the reader's local day, which the server does not know (`development/dates.md`). Rendering server-side would have searched with "no shelf ever expires" and quietly returned different rows.                                                                                     |
| 2   | Sources are **eight** families, not nine: sub-records are a field class, not a source.                                           | Achieve's dialog has record types on one row of Search In and Subrecords on the other, and the axes really are independent — `node_items` belong to the Outline, `contact_items` to Contacts, session exercises to Fitness.                                                                                                            |
| 3   | The outline needed a **second read** (`loadOutlineDetailText`) beyond `loadOutline`.                                             | `loadOutline` selects only the columns a grid draws, so a goal's Vision and a result area's Mission were unreachable. Widening it would have taxed all seven Plan pages to serve one.                                                                                                                                                  |
| 4   | Results are grouped by a **default sort on Type**, not by grid grouping; and four kinds land on their page rather than opening.  | `GridGroupBy` is a closed union with host-side group building — a new dimension for one page is machinery a sort already buys. Appointments, metrics, life events and commitments keep the open record in component state, so there is nothing to deep-link to; the command says "Show where it lives" rather than promising a drawer. |
| 5   | The scope chips **collapse below `md`** behind a one-line summary.                                                               | At tap size the sixteen chips are ~950px on an 844px screen, so results began below the fold. `responsive.md`: a different information architecture, not the desktop one scrolled.                                                                                                                                                     |
| 6   | The **result count** sits on the query row, separate from the grid's `Showing N of M`.                                           | Those answer different questions — how much the search found, versus how much the grid is narrowing — and `GridFilterChips` correctly renders nothing when the grid narrows nothing.                                                                                                                                                   |
| 7   | `agent-os/standards/components/navigation.md` was edited: the sidebar row is **Commands…**, and a destination may carry a chord. | Two rows promising to search, one for commands and one for records, is the ambiguity that standard exists to prevent. `⇧⌘F` on `go.find` is declared once, on the command, so every surface prints the same binding.                                                                                                                   |

## Task 1: Save spec documentation

`plan.md`, `shape.md`, `standards.md`, `references.md`, `visuals/advanced-find-ap.png`.

## Task 2: The matcher and the result model

`types.ts`, `matcher.ts`, `sources.ts` + tests. Cover case on/off, whole-word boundaries
(punctuation, start/end of string), invalid regex returning an error rather than throwing,
snippet window clamped at both ends, empty and whitespace-only queries.

## Task 3: The corpus query

`queries.ts` — one function per source family, `userId` first, every arm scoped. The four
`*_details` tables carry **no `userId`** and must join `nodes` and filter `nodes.userId`.
Add `queries.integration.test.ts` and register `loadFindCorpus` in
`src/lib/db/crossUserReads.integration.test.ts`.

## Task 4: `searchable.ts` — rows to results

Per-entity field maps, field-class assignment, completed/shelved predicates, the ancestor path
for `Where`, the 1000 cap. Tests including three-field collapse and the include-toggles.

## Task 5: Route, action, and navigation registration

`src/app/find/page.tsx`, `src/app/find/actions.ts`, the `find` module entry, `FindIcon`, the
`FIND` chord on `go.find`, `Q_PARAM` / `asSearchQuery` / `findPath`, the `Commands…` rename,
and `targets.ts` + tests.

## Task 6: `FindView` and the results grid

Query box with Find button and inline regex error; Sources / Fields / Options popovers
persisted through `useSetting`; chips; the `DataGrid` grouped by Type; Open and View in Outline
on the row menu; empty, over-cap and no-query states.

## Task 7: Compact layout

390×844 verification per `responsive.md`'s checklist, then 1280×800.

## Follow-ups (new work — not amendments to this frozen spec)

- **Deep links for the four remaining kinds.** Appointments, Metrics, Timeline and Commitments
  hold the open record in component state. Giving each a `?detail=` — as Contacts, Resources,
  Jobs, Residences, the Register and Accounts already have — would let Find open them, and
  would be useful on its own. `resultTarget` already reports `opens: false` for exactly these,
  so the change is local once those views support the param.
- **An `ILIKE` prefilter for `finance_transactions`** if Find gets slow. A superset that
  narrows I/O; the JS matcher stays the authority on what matched.
- **Saving a search.** The results grid gets saved _views_ for free; saving the query, sources
  and options as a named search is a different idea and was never in scope here.

## Task 8: Verify, freeze spec, update roadmap

`npm test` (confirm integration tests did not skip), lint, typecheck, `npm run smoke` against a
running dev server, browser verification. Complete **Changes from original plan**, set
**Status: frozen / complete**, and update `agent-os/product/roadmap.md` — this supersedes the
narrow "find-in-outline" friction item at `roadmap.md:147`.
