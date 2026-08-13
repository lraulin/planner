# Module consolidation — Plan, Library, and Time Charts

**Status: active**
Spec folder: `agent-os/specs/2026-08-13-0845-module-consolidation/`

## Context

The frozen `module-pages` spec built a **Page** tier — a destination inside a module, one
registry, one shell-owned bar — and converted the four modules that had invented their own
switchers. It did not revisit which destinations are modules in the first place.

Seven of the fifteen built modules are not separate destinations at all. `overview`,
`outline`, `projects`, `tasks`, `goals`, `wishes` and `result-areas` each call the same
`loadOutline(userId)` and differ only in which grid renders the result (Wishes adds one
query, Overview adds contexts and the inbox count). That is one destination with seven
presentations — the definition of a Page — and Achieve reached them as sibling tabs from a
single Go-menu entry. The sidebar spends seven rows plus a section heading saying so.

The same is true one section down. `Library` holds Contacts and Resources, reference data
you maintain rather than places you work. And Time Charts is split against itself: the list
lives at `/time-charts` under Library while its editor already lives at
`/schedule/time-chart/[chartId]` — which is why `destinationLabel()` needed a comment about
the editor being reached from two places.

**Outcome:** eight modules in a flat sidebar, no section headings, and every collapsed
destination preserved as a Page on the bar the previous spec built. No page gains a
capability it does not have today — this is chrome.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — the Page tier, the ≥2-page
  bar floor, `lastPage` stickiness, and "a focused flow is not a page" all carry forward
  unchanged. This spec supplies nine more pages and no new mechanism.
- **Supersedes:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/` — the
  **sections** decision and its section table only. The sidebar, palette, `⋯` overflow and
  More sheet all stand.
- **Supersedes:** `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/` — Time Charts,
  Resources and Contacts as **top-level modules**, and "the Library section is now live".
  Every decision about what those surfaces _contain_ stands untouched.
- **Extends:** `agent-os/specs/2026-08-09-2133-overview-and-inbox-organizer/` — Overview
  becomes a page and `/` no longer lands on it unconditionally.

## Decisions

Confirmed with Lee during shaping:

| #   | Decision                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **All three moves in one spec.** They share the same registry, the same five reading surfaces and the same redirect plumbing; splitting them means three passes over the same files.                                          |
| 2   | **Sections are deleted, not left holding one module each.** `SECTIONS`, `SectionId`, the `section` field and `sectionsWithModules()` all go. The sidebar renders `BUILT_MODULES` flat.                                        |
| 3   | **Overview is Plan's default page.** `/` redirects to `/plan`, which lands on `lastPage` — so you return where you left instead of always hitting Overview.                                                                   |
| 4   | **Library is Contacts + Resources only.** Contexts keep `MasterContextsDialog`; a Contexts page is a later delta. There is no Categories page to build — `category` is a free-text inherited node field, not a managed table. |

Design decisions that follow from the code:

- **The time-chart editor stays at `/schedule/time-chart/[chartId]`, singular.** Only the
  list moves, to `/schedule/time-charts`. If the editor moved under the plural segment,
  `pageForPathname`'s subtree rule would match it and draw the page bar on a focused flow
  that has its own Back — the exact case `navigation.md` § "A focused flow is not a page"
  governs. The near-identical singular/plural pair is load-bearing and needs a comment
  saying so, or someone will "fix" it.
- **`primary` stops being a module flag.** The phone's Tasks slot must point at
  `/plan/tasks`, and a boolean on a module cannot say that. It is replaced by one
  `PRIMARY_DESTINATIONS` list in `modules.ts` (which already imports icons; `pages.ts` must
  stay React-free to remain testable), where an entry names a module and optionally a page.
- **Sections were load-bearing for scale, and the scale is gone.** The navigation spec added
  them so the sidebar could reach twenty destinations. Eight built plus three reserved does
  not need headings, and two sections of one is the same "chrome that teaches nothing" the
  ≥2-page bar floor rejects one tier down.
- **Seven tabs fit.** Roughly 460px of underline tabs against a content area of 1000px+ on
  desktop; below `md` the bar already scrolls sideways with 44px targets. If the bar later
  reads as cluttered, the release valve is folding Projects/Goals/Result Areas into one
  Items page with Views — deliberately _not_ done now, because each passes the spec's own
  test: it is a place you can be, with its own selection and scroll position.

## Acceptance criteria

- [ ] The sidebar shows eight rows with no section headings: Plan, Task Chooser, Schedule,
      Metrics, Fitness, Finances, Notes, Library. The More sheet matches it.
- [ ] Plan shows a seven-tab page bar; Library shows two; Schedule shows five with Time
      Charts last.
- [ ] Every old path redirects with its query string intact — `/tasks?detail=<id>`,
      `/time-charts`, `/contacts`, `/resources` and the other five.
- [ ] `/` lands on `/plan` → your last Plan page; a fresh session gets Overview.
- [ ] The phone bottom bar's Tasks slot goes to `/plan/tasks` and highlights only there —
      not on Plan's other six pages.
- [ ] The phone header names the **page** (`Tasks`), not the module (`Plan`).
- [ ] `⌘K` finds every collapsed destination: `Plan: Tasks`, `Library: Contacts`,
      `Schedule: Time Charts`.
- [ ] The time-chart editor still shows **no** page bar and returns to
      `/schedule/time-charts`.
- [ ] `npm run smoke` passes on the grown route list.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create the spec folder with `plan.md` (this plan, **Status: active**, including the empty
**Changes from original plan** table), `shape.md`, `standards.md`, and `references.md`. No
`visuals/` — this is chrome built from two existing reference implementations, the same as
the module-pages spec that established the pattern.

`references.md` records the four spec relationships above plus `PageBar.tsx`,
`moduleEntry.ts` and `src/app/day/page.tsx` (the redirect precedent).

## Task 2: Rework the two registries

**`src/lib/navigation/pages.ts`** — add `plan` (overview `isDefault`, outline, projects,
tasks, goals, wishes, result-areas, in the order `modules.ts` already calls "Achieve's own
order") and `library` (contacts `isDefault`, resources). Append `time-charts` to `schedule`,
last, since it is configuration for the Calendar background rather than a weekly place. Move
each destination's search terms from `GO_KEYWORDS` into its `PageEntry.keywords`.

**`src/components/shell/modules.ts`** — `MODULES` becomes eight built entries (`plan` at
`/plan`, `chooser`, `schedule`, `metrics`, `fitness`, `finances`, `notes`, `library` at
`/library`) plus the three untouched reserved ones. Delete `SECTIONS`, `SectionId`, the
`section` field, `sectionsWithModules()` and the `primary` field. Add:

```ts
export const PRIMARY_DESTINATIONS = [
  { moduleId: "chooser", label: "Chooser", icon: ChooserIcon },
  { moduleId: "plan", pageId: "tasks", label: "Tasks", icon: TasksIcon },
  { moduleId: "notes", label: "Notes", icon: NotesIcon },
] as const;
```

with a `primaryDestinations()` accessor returning the resolved `href` (via the existing
`pageHref`) and an `isActive(pathname)` predicate that uses `pageForPathname` for page
entries and module-id equality for module entries. The existing compile-time
`PagedModuleId extends ModuleId` assertion keeps the new keys honest.

Add `PlanIcon` and `LibraryIcon` to `navIcons.tsx`; grep for the icons no surface renders
any more and delete them.

## Task 3: Move the routes, leave redirects

Move the seven Plan pages to `src/app/plan/<segment>/page.tsx`, Contacts and Resources to
`src/app/library/<segment>/page.tsx`, and the Time Charts list to
`src/app/schedule/time-charts/page.tsx`. Each keeps its body; only `active="tasks"` →
`active="plan"` (and `"library"`, `"schedule"`) changes. Add
`src/app/plan/page.tsx` and `src/app/library/page.tsx`, each one line of
`moduleEntryRedirect(...)`.

**Do not move** `src/app/schedule/time-chart/[chartId]/page.tsx` — see the decision above.

Ten old paths become redirects following `src/app/day/page.tsx`. They must forward the query
string: `hrefWithViewState` writes `?detail=` and `?view=` onto these paths and they are in
bookmarks and on Lee's iPhone home screen. Extract `withQuery` out of `moduleEntry.ts` into
`src/lib/navigation/query.ts` so the redirect files and the module entry share one
implementation rather than eleven copies.

## Task 4: Update the reading surfaces

- **`Sidebar.tsx`** — render `BUILT_MODULES` flat; drop the section wrapper and the `<h2>`
  (the collapsed-rail heading comment goes with it).
- **`MoreSheet.tsx`** — same flattening; its `inBottomBar` check moves to
  `primaryDestinations()`.
- **`MobileNav.tsx`** — render the three slots from `primaryDestinations()` instead of
  hard-coded hrefs, which is what `navigation.md`'s "never hard-code a module anywhere else"
  asked for and the bottom bar never did.
- **`MobileHeader.tsx`** — name the page, not the module, via the existing
  `destinationLabel(pathname)` (which already falls back to the module label for unpaged
  modules). It needs `usePathname()`, so it becomes a client component.
- **`globalCommands.ts`** — trim `GO_KEYWORDS` to the eight module ids; the `Module: Page`
  entries generate themselves.
- **Internal links** — `OverviewView.tsx` (process links to `/outline`, `/projects`,
  `/tasks`), `OrganizerView.tsx` (two `/overview` links), `TimeChartsView.tsx` (the
  `returnTo` on line 123), `src/app/page.tsx` (`/overview` → `/plan`), and
  `src/lib/auth/callback-url.ts` (default `/outline` → `/plan`).

## Task 5: Tests

- Extend `src/lib/navigation/pages.test.ts` for the new modules, and fix the cases at lines
  121–128 that use `tasks` as a module id and `/tasks` as a non-module path — both are false
  after this change, and they would keep passing while asserting nothing.
- New test for `primaryDestinations()`: the Tasks slot resolves to `/plan/tasks` and is
  active there but not on `/plan/goals`.
- Update the five `/outline` expectations in `src/lib/auth/callback-url.test.ts`.
- No component tests (`testing.md`). Nothing here touches the database, so no integration
  test is owed.

## Task 6: Amend `agent-os/standards/components/navigation.md`

- Replace "Sections, and reserved modules" with a reserved-modules-only rule, recording that
  sections were dropped because collapsing removed the scale that motivated them.
- Fix the three-word table: it currently offers **Tasks** as the example of a _module_,
  which this spec makes false. Use Plan / Schedule / Fitness for modules and Tasks / Agenda
  / Journal for pages.
- Add the rule the phone bar now follows: **primary destinations are a registry list, and a
  primary destination may be a page.**
- Note the singular/plural time-chart pair as the worked example of the focused-flow rule.

## Task 7: Verify, freeze, update roadmap

Run `npm run test:unit`, typecheck, lint, then `next build`. Start the dev server and run
`npm run smoke` — this spec adds and removes routes wholesale, and smoke discovers them from
the filesystem, so it is the only thing that will catch a page file that no longer renders.

Then click through in the browser: the flat sidebar, Plan's seven tabs, `/tasks?detail=<id>`
surviving the redirect with the drawer still open, `/` landing on the last Plan page, the
time-chart editor showing no page bar, and the phone layout's Tasks slot highlighting on
`/plan/tasks` only.

Push to `master` — Lee validates on the deployed iPhone, and a nav change parked on a branch
reads as a broken app.

Finally: fill in **Changes from original plan**, mark `plan.md` and `shape.md`
**Status: frozen / complete (2026-08-13)**, and add a roadmap entry under the navigation
line noting that the fifteen modules became eight.

> **While this spec is active:** material changes to requirements, design or scope —
> including feedback on what was built — go into `plan.md` / `shape.md` plus a row in
> **Changes from original plan**. Skip pure implementation details.

## Verification

| What                      | How                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Nothing stopped rendering | `npm run smoke` against a running dev server — the only gate that evaluates a `"use server"` module |
| Redirects keep query      | Visit `/tasks?detail=<id>`; the drawer opens on `/plan/tasks`                                       |
| Bar/focused-flow split    | `/schedule/time-charts` has a bar; `/schedule/time-chart/<id>` has none                             |
| Registry consistency      | `npm run test:unit` — `pages.test.ts` and the new `primaryDestinations` test                        |
| Phone                     | Deployed iPhone: bottom bar, More sheet, header title on each Plan page                             |
