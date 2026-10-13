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

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

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
