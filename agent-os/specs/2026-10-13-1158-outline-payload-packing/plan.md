# Outline Payload Packing

**Status: active**  
Spec folder: `agent-os/specs/2026-10-13-1158-outline-payload-packing/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-07-28-1121-main-grid-tabs/` — only the consequence of
  "One widened `loadOutline` … one `OutlineNode` type" that every page _receives_ every
  column of every node as a keyed JSON object. The single query, single `derive`, and single
  in-memory `OutlineNode` type all stay.
- **Supersedes:** `agent-os/specs/2026-08-04-1530-grid-column-parity/` — "Load the
  type-specific values required for grids in `loadOutline`" no longer implies shipping them
  to pages that cannot show them. Loading is unchanged; Show Fields is unchanged.
- **Supersedes:** `agent-os/specs/2026-07-29-1045-notes-markdown-editor/` — the Notes grid
  receiving the whole outline for the link picker.
- **Extends:** `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/` — one recursive
  CTE reads the tree in one round trip.
- **Extends:** `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — the drawer fetches
  its own record on open (`loadNodeDetailAction`); it takes only id, name and type from the
  row, so nothing moves out of the row for the drawer's sake.
- **Extends:** `agent-os/specs/2026-08-10-1940-daily-use-performance/` — "load only what the
  page needs"; virtualization stays deferred.
- **Independent of** `agent-os/specs/2026-10-13-1155-immediate-navigation-and-page-cache/`
  (active, shaped the same day; it names payload size as "its own spec" — this one). Neither
  depends on the other. That cache removes repeat _visits_ inside 60 seconds; it does not
  remove first visits or the per-edit re-ship described below, and a revalidating action
  empties it. Two things to respect whichever lands second:
  - It moves every `AppShell` page under one route group, so the `src/app/**/page.tsx` paths
    named here move with it. URLs do not change.
  - With the cache on, a revisit sends no request. Measure this spec's figures on a first
    visit (or a hard reload), and say which.

## Context

Measured 2026-10-12, signed-in browser on production: every Plan tab and the Schedule
calendar returns ~810–875 kB of RSC (~85 kB compressed) per click, 160–230 ms server,
50–90 ms client. The size is the same on every tab because each page calls
`loadOutline(userId)` and passes all ~600 nodes to a client component.

What shaping found:

- **The bytes are field names, not data.** `OutlineNode` has 63 fields. A task with nothing
  filled in serialises to 1,346 bytes — the measured 1.3–1.5 kB — of which 955 (71%) are
  the field names repeated per row, and most of the rest is `null` / `false` / `""`. The
  values themselves are roughly 250–400 bytes.
- **Trimming columns cannot reach that.** Show Fields offers nearly every field on every
  grid, and filter and search reach hidden columns (`components/data-grid.md`).
- **Every inline edit re-ships the page.** `run()` (`src/app/actionResult.ts`) calls
  `revalidatePath("/", "layout")`, and Next 16 includes the re-rendered route in the action
  response (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`). A state
  toggle on a Plan tab downloads the ~810 kB again. The page cache does not cover this.
- **Sixteen pages carry the outline to the browser**, in two groups:
  - _Tree pages_ render or score the tree and need nearly the whole row: `/plan/outline`,
    `/plan/tasks`, `/plan/projects`, `/plan/goals`, `/plan/result-areas`, `/plan/overview`,
    `/chooser`, `/organize`, `/schedule/week-plan`, `/schedule/plan` (via
    `WeeklyPlanPayload.nodes`).
  - _Slice pages_ use it as supporting data: `/metrics` (goal id + name for a select),
    `/schedule/time-chart/[chartId]` (result areas), `/notes/grid` (link picker),
    `/plan/wishes` (owner lookup + drawer), `/schedule/calendar` and `/schedule/agenda`
    (project rail, project names, appointment form).

## Decisions

**D1 — Pack the rows at the server→client boundary; keep `OutlineNode` in memory.**
A pure codec in `src/lib/tree/wire.ts`: `packOutline(nodes, columns?)` on the server,
`unpackOutline(wire)` in the browser. Required properties, with the exact layout left to
the implementer:

1. Field names appear once per payload, not once per row.
2. A value equal to its column's default (`null`, `false`, `""`, `[]`, `0`, `"none"`) is not
   written. A value that differs from the default — including `null` where the default is
   `[]` — is.
3. Lossless: `unpackOutline(packOutline(nodes))` deep-equals `nodes`. `Date`s come back as
   `Date`s with the same instant; calendar-day fields are not re-encoded
   (`development/dates.md`).
4. Self-describing: `unpack` reads the column list from the payload, not from a constant in
   the client bundle, so a tab open across a deploy cannot misalign columns.
5. Exhaustive at compile time: the column defaults are a `Record<keyof OutlineNode, …>`, so
   adding a field to `OutlineRow`/`OutlineNode` without teaching the codec fails typecheck.

Rejected: splitting `OutlineNode` into a slim core plus per-type extras. It touches ~70
files and still repeats field names per row, so it saves less than packing.
Rejected: trimming each grid to its own catalog on top of packing. Empty columns already
cost nothing once packed; the remaining saving is small and needs every grid's filters,
search, group-by and row menus audited for fields outside the visible catalog. Reopen only
if Task 6 shows a tree page over budget.

**D2 — One unpack per page, memoised on the payload's identity.**
A hook (`useOutline(wire)`, beside `useOptimisticNodes`) does
`useMemo(() => unpackOutline(wire), [wire])`. Each top-level client view takes the wire as
its prop and unpacks once; everything below it keeps receiving `OutlineNode[]` exactly as
today. The memo is load-bearing: `useOptimisticNodes` drops its patch layer when
`initialNodes` changes identity, so the array must change when — and only when — the server
sends a new payload.

**D3 — Slice pages filter rows and project columns when packing, from the same
`loadOutline`.** No new SQL: it is one round trip either way
(`database/read-latency.md`), and a second narrow query would have to recompute `hidden`,
L.A.P. and `resultAreaName` — the drift `main-grid-tabs` rejected. `packOutline` takes a
column list and returns `OutlineWire<K>`; `unpack` yields `Pick<OutlineNode, K>[]`. Shared
consumers that slice pages reuse (`ProjectPicker` / `projectPickerRows`, `ProjectsRail`,
`AppointmentDrawer`, `NodeDetailDrawer`'s `nodes`, `owningProjectId`, `projectNamesFrom`,
`MetricDrawer`, `TimeChartAreaPanel`, `NoteDrawer`) are retyped to the `Pick` they actually
read, so the compiler proves a component only reads what it was sent, and a full node still
satisfies them. Precedent: `listCaptureTargetsAction` (`src/app/capture/actions.ts`) already
filters and maps the outline on the server.

**D4 — `derive` stays on the server, and SQL is not narrowed.** Deriving in the browser
would make rollups and L.A.P. update optimistically — a behaviour change, not a payload
fix. Out of scope.

**D5 — A page never sends the same rows twice.** `/organize` passes `nodes` and
`queue` (a subset of the same objects). React dedupes object references today; packed
payloads would not. The queue crosses as ids.

**D6 — Go/no-go after the baseline.** The compressed transfer is already ~85 kB and field
names compress well, so the gain is in server serialisation, client parse and memory more
than in bytes on the wire. Task 2 measures the outline's share of a click before anything is
built. If it is under ~20 ms of a production-build tab switch and of an inline-edit round
trip, stop and report rather than build.

### Out of scope

- Virtualizing any grid (`components/data-grid.md`; only Register and Orders virtualize).
- Changing `loadOutline`'s SQL, `derive`, any mutation, any column, or any default view.
- Other heavy payloads: Insights, Register, Payees.
- The page cache, `loading.tsx`, link prefetching.

## Acceptance criteria

- [ ] Baseline and after-figures for every route in Context are recorded in this plan: raw
      and gzip bytes of the RSC navigation response, raw and gzip bytes of one inline-edit
      action response on `/plan/outline`, server time, and click-to-settled time — all from
      a production build, same dataset, same machine.
- [ ] Tree pages: raw RSC bytes at most 40% of baseline (expected ~25–30%).
- [ ] Slice pages: `/metrics` and the time-chart editor at most 5% of baseline;
      `/notes/grid`, `/plan/wishes`, `/schedule/calendar`, `/schedule/agenda` at most 15%.
- [ ] The inline-edit action response on a Plan tab shrinks by the same proportion as its
      page.
- [ ] Each grid renders the same rows and the same cells as before: the before/after DOM
      capture from Task 2 and Task 6 diffs empty for every grid route, in its default view
      and in a view with every Show Fields column on.
- [ ] Pickers, the Schedule rail, the Metrics goal select and the time-chart area list offer
      the same entries in the same order as before.
- [ ] Sort, filter, group, search, drag-reorder, multi-select, optimistic edits (including
      the revert on a rejected action) and the detail drawer behave as before on Outline and
      Tasks.
- [ ] `wire.test.ts` passes, including the round trip and the size tripwire.
- [ ] `npm test` with no integration skips, typecheck, lint, production build, and
      `npm run smoke` all pass.
- [ ] If measured tab-switch time does not improve, the plan says so in plain words.

## Measurements

Filled during implementation. Every figure below comes from a **production build**
(`next build` + `next start`, signed in through the login form as a local account), a
Chrome driven over CDP, the same dataset and the same machine, and **a hard load of a hub
page followed by one soft navigation per sample** — so these are first visits, never a
revisit that a client cache could answer. Five samples per route after one discarded
warm-up; the table shows the median.

- **Dataset: synthetic, 789 nodes, not a restored backup.** The real backups are encrypted
  with a passphrase held in the Keychain, and reading it is not something an unattended run
  may do. The scratch database `planner_oppbench` holds 6 result areas, 12 goals, 42
  projects and 729 tasks (22% completed, notes on ~20%, priorities on ~30%, deadlines on
  ~20%), built by a throwaway script kept outside the repo. It is somewhat larger than
  production's ~600 nodes; it serialises to 1,416 B per node, inside the 1.3–1.5 kB measured
  on production, so the byte figures are comparable and the millisecond figures are the
  ones to treat as indicative. Rows carry realistic names, notes, dates and rollups; they do
  not carry Lee's real mix of empty and filled fields, which is the one thing a restored
  backup would have added.
- **Columns.** _raw_ and _gzip_ are `decodedBodySize` and `encodedBodySize` of the RSC
  navigation response (`?_rsc=`) from the Resource Timing API — gzip is what `next start`
  actually sent. _fetch_ is request start to response end, over loopback: server render and
  serialisation, with no network, so on a phone it is a floor, not a figure. _settled_ is
  click to the last DOM mutation before a 500 ms quiet period. Navigations are real mouse
  clicks at a link's coordinates (or a double-click on the row that opens the route), never
  `router.push`.
- **Load.** The Mac was shared with two other agents building and testing; load average
  ranged 8–34 during these runs. Treat differences under ~15 ms as noise. Paired
  before/after comparisons below were taken back to back in one timing-lock window.

### Baseline (Task 2, `master` at `6d5e23c4`)

| Route                            | Group | Raw B     | Gzip B | Fetch ms | Settled ms |
| -------------------------------- | ----- | --------- | ------ | -------- | ---------- |
| `/plan/outline`                  | tree  | 1,117,186 | 65,142 | 39       | 207        |
| `/plan/tasks`                    | tree  | 1,117,198 | 65,158 | 36       | 282        |
| `/plan/projects`                 | tree  | 1,117,190 | 65,145 | 37       | 165        |
| `/plan/goals`                    | tree  | 1,117,177 | 65,140 | 37       | 146        |
| `/plan/result-areas`             | tree  | 1,117,205 | 65,157 | 42       | 147        |
| `/plan/overview`                 | tree  | 1,113,800 | 64,940 | 50       | 144        |
| `/chooser`                       | tree  | 1,117,868 | 65,212 | 41       | 81         |
| `/organize`                      | tree  | 1,114,486 | 65,018 | 42       | 53         |
| `/schedule/week-plan`            | tree  | 1,114,069 | 65,026 | 39       | 63         |
| `/schedule/plan`                 | tree  | 1,123,931 | 66,102 | 39       | 58         |
| `/metrics`                       | slice | 28,599    | 4,236  | 28       | 90         |
| `/schedule/time-chart/[chartId]` | slice | 1,116,532 | 65,453 | 54       | 94         |
| `/notes/grid`                    | slice | 1,116,872 | 65,274 | 47       | 66         |
| `/plan/wishes`                   | slice | 1,122,527 | 66,392 | 50       | 148        |
| `/schedule/calendar`             | slice | 1,124,391 | 66,002 | 44       | 82         |
| `/schedule/agenda`               | slice | 1,124,383 | 65,997 | 52       | 77         |
| inline edit on `/plan/outline`   | —     | 1,120,498 | 66,352 | 47       | 205        |

Two things the table corrected:

- **`/metrics` was never carrying the whole outline.** Its page already filters to goals, so
  it ships 12 goals' worth of full rows (~17 kB) plus the metrics themselves, 28.6 kB in
  all. The "at most 5% of baseline" criterion cannot hold for a page whose non-outline
  payload is already ~40% of it; see the Task 6 table for what that criterion becomes.
- **Settled time is mostly rendering, not payload.** The Plan grids settle in 145–280 ms
  and the pages that draw no 650-row grid in 55–95 ms, against a 36–54 ms fetch. Packing
  cannot touch the render, only the fetch and the parse.

### Go / no-go (D6, Task 2)

Two experiments, each paired and back to back, on this build and dataset.

**1. Outline emptied** (`loadOutline` still queries and derives, then returns `[]`; a
throwaway patch, not committed). This is the upper bound on what the outline costs a click,
render included:

| Route                 | Fetch ms, full → empty | Settled ms, full → empty |
| --------------------- | ---------------------- | ------------------------ |
| `/plan/outline`       | 50 → 30                | 228 → 52                 |
| `/plan/tasks`         | 43 → 27                | 299 → 45                 |
| `/organize`           | 42 → 31                | 56 → 41                  |
| `/schedule/week-plan` | 43 → 40                | 70 → 53                  |
| `/schedule/calendar`  | 45 → 26                | 92 → 66                  |

Read that carefully: the 175–250 ms on the Plan tabs is almost all row rendering, which
packing leaves exactly as it is. The part packing can recover is the fetch (3–20 ms) plus
the client's parse of the payload, which the non-grid pages show to be about 5–15 ms.

**2. The codec prototyped on two pages** (`/plan/outline` and `/organize`, the real codec
from Task 3), alternating baseline and packed builds twice, five samples each:

| Measure                    | Baseline  | Packed        |
| -------------------------- | --------- | ------------- |
| `/plan/outline` raw B      | 1,117,186 | 224,117 (20%) |
| `/plan/outline` gzip B     | 65,139    | 42,147 (65%)  |
| `/plan/outline` fetch ms   | 45, 51    | 32, 30        |
| `/plan/outline` settled ms | 216, 239  | 196, 197      |
| `/organize` fetch ms       | 58, 43    | 28, 34        |
| `/organize` settled ms     | 64, 55    | 40, 45        |
| inline edit raw B          | 1,120,500 | 227,431 (20%) |
| inline edit fetch ms       | 61, 56    | 43, 46        |
| inline edit settled ms     | 225, 213  | 208, 212      |

**Decision: go.** The rule was to stop if the outline's share is under ~20 ms of a tab
switch _and_ of an inline-edit round trip. A tab switch recovers 15–40 ms here (more on
the Plan tabs, whose payload is the same but whose fetch is longer); an inline edit
recovers 13–17 ms of fetch and 5–13 ms settled. That is not under 20 ms on both counts,
and it is on a loopback connection with no network and a laptop CPU. It is also not much
more than that, and the plan says so in plain words: **on this machine packing makes a tab
switch 15–40 ms faster and an inline edit about 10 ms faster, and removes 80% of the raw
bytes and 35% of the gzip bytes of every one of them.** The remaining 150–250 ms of a Plan
tab switch is rendering ~650 rows and is not addressed here. The iPhone, where Lee
validates, has a slower parse and a real network on the other side of those 23 kB, which is
where the larger share of this is expected to land; only the post-deploy production
re-measurement (Task 6) can say.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                   | Why                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Task 2's dataset is a synthetic 789-node outline in a scratch database, not "a restored backup".                         | The backups are encrypted with a passphrase in the Keychain; an unattended run does not read that. Sizes land inside production's measured per-node range. |
| 2   | Task 2's go/no-go ran two experiments (outline emptied; codec prototyped on two pages), not only the first.              | The emptied outline measures rendering as much as payload, so on its own it cannot say what packing recovers. Result and decision are under Measurements.  |
| 3   | The "`/metrics` … at most 5% of baseline" criterion rests on a premise the baseline disproved; it is restated at Task 6. | `/metrics` already sent only goals: 28.6 kB, of which the metrics themselves are ~40%. The criterion assumed the page carried the whole outline.           |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-10-13-1158-outline-payload-packing/` with:

- **plan.md** — this plan (Status: active), empty Changes table.
- **shape.md** — scope, the evidence above, the four choices Lee made (pack the rows;
  filter and project when packing; supersession as listed; independent of the page cache),
  rejected alternatives, out of scope.
- **standards.md** — references pinned to standards commit `5f665924`, no copies.
- **references.md** — governing specs and the code studied.
- No `visuals/`.

Commit and push. **Shaping ends here.**

## Task 2: Baseline, cell capture, and the go/no-go

- Production build (`npm run build && next start`), signed in as a real local account — the
  dev bypass does not work under `next start`. Use a dataset of at least 600 nodes: a
  restored backup in a scratch local database, never a local build pointed at production.
- For every route in Context record raw/gzip RSC bytes, server time, click-to-settled time.
  Click by coordinate, not element ref, so the navigation is soft.
- On `/plan/outline`, record the response size of one inline edit (toggle a state).
- Isolate the outline's share: the same route with the node list emptied, as a throwaway
  local experiment that is not committed.
- Capture each grid's rendered rows × cells as JSON with `.agents/skills/run-planner/driver.mjs`
  (default view, and all Show Fields columns on), plus picker / rail / select entries on the
  slice pages. Keep the captures outside the repo.
- Write the table into this plan. Apply D6.

## Task 3: The codec

- `src/lib/tree/wire.ts`: `OutlineWire<K>`, column defaults, `packOutline`, `unpackOutline`.
  Pure, no React, no database.
- `src/lib/tree/wire.test.ts`:
  - round trip over a fixture with every node type, once with every field populated and
    once with every field at its default;
  - `Date` fields return as `Date` with the same instant;
  - `null` in a column whose default is `[]` survives;
  - a column subset returns exactly those keys;
  - size tripwire: N near-empty nodes pack to under a fixed bytes-per-node bound, so a
    regression to keyed objects fails.

## Task 4: Tree pages send the packed outline

- `useOutline(wire)` hook (D2).
- Pages pack; entry components take the wire and unpack once: `OutlineGrid`, `TasksGrid`,
  `ProjectsGrid`, `GoalsGrid`, `ResultAreasGrid`, `OverviewView`, `ChooserGrid`,
  `OrganizerView` (queue as ids, D5), `WeekPlanView`, `WeeklyPlanView`.
- `loadWeeklyPlanPayload` keeps returning `OutlineNode[]` — the agent tools read it too. The
  page packs before handing it to the client.
- Run `npm run smoke` after touching `src/app/**`.

## Task 5: Slice pages send a filtered, projected outline

- Retype the shared consumers in D3 to the `Pick` they read; let the compiler list what each
  needs.
- Name the slices beside the codec (rows kept + columns), one per use:
  - Metrics — goals; id, name, type.
  - Time-chart editor — visible result areas; what `TimeChartAreaPanel` reads.
  - Notes grid — link-picker candidates.
  - Wishes — owner lookup and the drawer's inputs.
  - Schedule calendar / agenda — all rows (for `owningProjectId`'s parent walk), the columns
    the rail, project names and appointment form read.
- No new queries. Slices filter an already user-scoped read, so nothing new crosses users.

## Task 6: Re-measure and compare

- Repeat every Task 2 measurement on the same build setup and dataset; fill in the table.
- Re-capture rows × cells and picker entries; diff against Task 2. Empty diff required.
- Exercise the behaviours in the acceptance list on Outline and Tasks in a browser.
- Full gate: `npm test` (check for the integration skip warning), typecheck, lint, build,
  `npm run smoke`.
- After deploy, repeat the 2026-10-12 production measurement from the signed-in browser and
  record it beside the local figures.

## Task 7: Verify, freeze spec, update roadmap

- Confirm acceptance criteria; state plainly any that missed.
- Add the rule to `agent-os/standards/components/data-grid.md` — row sets cross to the
  browser packed, and a page that uses the outline as supporting data sends a slice — and
  run `/index-standards`.
- Update plan/shape for as-built drift; complete the Changes table; mark
  **Status: frozen / complete** with the date and the standards SHA; list follow-ups as new
  work.
- Update `agent-os/product/roadmap.md` under the daily-use performance entry.

> While this spec is **active**, when we make a material change to requirements, design, or
> scope (including from feedback on what was implemented), update the relevant sections and
> append to **Changes from original plan**. Skip pure implementation details. Freeze when
> verified.
