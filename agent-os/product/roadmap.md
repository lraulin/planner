# Product Roadmap

Big-picture path for Planner. Specs under `agent-os/specs/` implement slices of this;
this file is the product-level map, not a task list.

**How to read it:** Phase 1 is the Achieve reimplementation core. Later phases and the
“beyond Achieve” tracks are real product intent, ordered by dependence and value — not
promises with dates.

---

## Phase 1: Achieve MVP

The core Achieve Planner loop — plan the week, block the time, work the outline.

### Delivered

- **✅ Project/task outline.** `specs/2026-07-27-1100-scaffold-and-outline-tab`. Result
  Areas → Goals → Projects → Tasks, keyboard-driven inline editing, indent/outdent,
  reordering, collapse/expand.
- **✅ Outline drag-to-reorder.** Same spec, "Change: drag-to-reorder (2026-07-28)". Drag
  rows onto or between each other; drops that a level cannot host snap out to the nearest
  ancestor that can, and the drop line is drawn at the depth the node will land at. Left
  out: multi-select drag, auto-scroll at the edges, spring-loaded expand on hover.
- **✅ Row context menus.** Same spec, "Change: row context menus (2026-07-28)". Right-click
  a row for the commands that already have shortcuts, each showing its shortcut: the full
  tree set on the Outline, open/rename on Projects / Tasks / Goals, open owner on Wish
  List. Its three deferrals — Priority/State submenus and multi-select actions — closed under
  "Right-click completion" below; `Shift+F10` is still out.
- **✅ Priorities & scheduling fields.** Priority (A/B/C/D + rank), deadline, focus, effort
  (with rollups), plus lifecycle state for Goals, Projects, and Tasks. Result Areas are
  enduring roles and deliberately have no state (see the delta below). Effort Left, Actual
  Effort, and % complete are editable in the Task form
  (`specs/2026-07-27-1318-per-type-detail-forms`).
- **✅ Per-type detail forms.** Same spec — Result Area / Goal / Project / Task drawers at
  Achieve parity for the in-scope fields and 24 repeating child lists. Recurrence,
  templates, labels, resource pools, file upload, and the welcome wizard stayed out of
  scope.
- **✅ Main grid tabs.** `specs/2026-07-28-1121-main-grid-tabs`. Shared `DataGrid`, derived
  schedule status, tree slice, and four list tabs — **Projects**, **Tasks**, **Goals**,
  **Wish List** — with scope pickers, built-in Views, grouping, column filters, and Show
  Fields. Outline migrated onto the same grid. Known polish (not blockers for “spec done”):
  Show Fields move up/down is coarse. The original flat Project scope select was replaced
  by the shared hierarchy-aware picker in
  `specs/2026-08-09-2133-overview-and-inbox-organizer`. **Column layout originally used
  `localStorage` with an explicit "no
  user-settings table" decision — superseded by** `specs/2026-07-31-1520-persistent-ui-state`
  (see Phase 1 Delivered below).
- **✅ Weekly calendar + time blocking.** `specs/2026-07-28-1234-weekly-schedule`. Week
  grid (FullCalendar Standard), Time Chart background + full-page template editor
  (drag-create, multi-day), appointments (full form, recurrence, three-state check),
  project drag-to-schedule, mini-month + projects rail. Deferred out of this slice:
  Google Calendar, appointment-check → Actual Effort, estimated-vs-actual reports, and
  the guided weekly planning wizard (shipped next — see below).
- **✅ Weekly planning wizard.** `specs/2026-07-28-2144-weekly-planning-wizard`. Full-page
  `/schedule/plan` guided loop: select week → result areas (mission + focus) → dreams/goals
  rewrites → fixed commitments + Time Chart → time budget → drag project blocks with
  collision avoidance. One plan per user/week; entries hold focus/rewrite/commitments.
  Entry point: **Plan Week…** on the schedule toolbar. Out of scope: auto-scheduler,
  resources, estimated-vs-actual on the finished plan.
- **✅ Notes tab with markdown.** `specs/2026-07-29-1045-notes-markdown-editor`. Nested
  notes grid (`/notes`) with Flag / Title / Snippet / Subject / Date / Contexts / Linked
  to; drawer-only editing with autosave; Edit/Preview markdown (`react-markdown` +
  `remark-gfm`, no raw HTML); Nested|Flat, Sort, and Filter as independent controls;
  optional link to a node with reverse surface on the node drawer; markdown editor reused
  on long-form node-form fields. Deferred: always-present preview panel, cross-cutting
  search, wiki links, attachments, export.
- **✅ Notes journal presentation.** `specs/2026-08-12-2145-notes-journal-presentation`.
  Notes gains a Grid \| Journal switch (same idea as Schedule Calendar \| Agenda). Journal
  is The Journal’s calendar + real Year → Month → entry tree + write pane over existing
  `subject = "Journal"` and `Rednotebook` notes. Empty days write nothing; first
  non-whitespace creates the Day-pane journal row. Not a new module and not a saved View.
- **✅ Persistent UI state + unified grid controls.**
  `specs/2026-07-31-1520-persistent-ui-state`. View state (filters, sort, column set /
  order / widths, group collapse, sub-view, Outline type filters, Notes mode/filter,
  Chooser weights, drawer form tab) lives in Postgres `user_settings` with a
  `localStorage` write queue — superseding the main-grid-tabs and Task Chooser
  "no user-settings table" / pure-`localStorage` decisions. Wish List runs on `DataGrid`;
  multi-select column filters; sort works under grouping; manual-order grids show a
  clearable sort chip and disable drag; drawers/sub-views are URL-backed (`?detail=`,
  `?note=`, `?view=`); per-grid reset and `/settings` "Reset everything". Delivers the
  Phase 1 "light polish on the main grids" line for persistence and uniformity.

- **✅ Grid control surface.** `specs/2026-08-04-0924-grid-control-surface`. The grid
  customization story finished: a tab now declares **what it has** (columns, switches, group
  dimensions) and the shared `GridToolbar` supplies **how you control it**, so a capability
  is added once rather than per grid. Filtering, quick search and the new cross-column
  advanced filter reach every column the tab _defines_ — including ones Show Fields has
  hidden, which also fixed a live bug where hiding a filtered column silently emptied the
  grid. Active narrowing is now visible: removable chips, `Showing N of M`, one `Clear all`.
  User-chosen **Group by** (Category / Result Area / Goal / Project / State / Priority /
  Deadline band) with sticky headers, correct post-filter counts and Expand/Collapse all,
  replacing each tab's hardcoded arrangement. Multi-column sort (Shift-click, numbered) and
  a density toggle. Every per-tab switch that used to live in component `useState` now
  persists like the rest of the view state. **The library question was re-opened and settled
  again: hand-rolled stays** — TanStack cannot do tree data and grouping at once, and its
  state layer is in-memory where ours already persists. Rules extracted to
  `agent-os/standards/components/data-grid.md`. Deferred: frozen first column, user-saved
  named views — the latter delivered in two steps, `specs/2026-08-05-0230-saved-views` then
  `specs/2026-08-05-1059-views-across-modules`.
- **✅ Multi-level grouping + Category as an ordinary property.**
  `specs/2026-08-04-1115-grouping-levels-and-category`. Group by stacks up to three
  dimensions (`Group by` … `then by` …), each select appearing as the one above it is
  filled. **Category stopped being a special case**: it is inherited through the hierarchy
  like L.A.P. (`effectiveCategory`, computed once in `derive.ts` by the same walk, and no
  longer keyed to the Result Area type), and it is now a real column — showable, sortable,
  filterable, searchable — instead of a grouping dimension with no visible value behind it.
  The `Groups` and `Group by Area` switches were removed: with a capable picker they were
  duplicates that silently won, so `Group by → (None)` did not actually ungroup. A tab's
  default arrangement is now its default `groupBy`, which the picker shows and can clear.
- **✅ Remaining Go-menu modules.** `specs/2026-08-05-1458-remaining-go-menu-modules`.
  Result Areas, Time Charts, Contacts and Resources complete the intended Go-menu modules:
  the Library section is now live, Contacts turns discussion items into real tasks and
  history into notes, and Resources supplies an editable weekly capacity budget. File
  Organizer and Life Plan are permanently out: the former needs file storage, and the latter
  is already a better note.
- **✅ Result Areas without lifecycle state.**
  `specs/2026-08-09-0915-result-areas-without-state`. Result Areas now model enduring roles
  directly: state, completion, postponement, and derived Status are absent. Shared Outline
  lifecycle columns leave their cells blank, lifecycle commands explain why they are
  disabled, and the dedicated Result Areas module has no lifecycle controls.
- **✅ Overview + Inbox processing workflow.**
  `specs/2026-08-09-2133-overview-and-inbox-organizer`. Overview is now the home surface
  and presents Achieve's Capture → Organize → Prioritize → Plan → Do process as direct
  routes into the app. Organize Tasks opens a shared hierarchy-aware Project picker that
  is also used by Tasks scope and the one-item-at-a-time Inbox Organizer. The Organizer
  can turn each Inbox task into a Task, Project, calendar event, dated deferral, deleted
  branch, or reference Note; it preserves child branches where that outcome is meaningful
  and blocks lossy Calendar/Note conversions. Master Contexts supplies a reusable catalog
  without rewriting contexts already stored on records. The Inbox processor is an
  intentional first-class workflow; broader Someday/Maybe ontology remains open.

- **✅ Daily-use performance & responsiveness.**
  `specs/2026-08-10-1940-daily-use-performance`. Notes list ships summaries and snippets
  (not Markdown bodies); body search matches on the server; drawer/detail load on demand;
  autosave patches the list without an RSC refresh; Markdown parser loads only on Preview.
  Shared grid rows/headers are memoized with selection in row render state. Session and
  settings reads are request-cached; nav links show immediate pending feedback. Calendar and
  Contacts paint the local Google mirror first and sync stale data once in the background.
  Virtualization remains deferred until a measured miss.

### Still in Phase 1

- **Residual grid chrome polish** if needed after daily use (finer Show Fields multi-select /
  multi-move).
  Persistence, control uniformity and the shared control surface
  shipped above.
- **Day-to-day friction from living with the MVP** — find-in-outline, seed goals for demos
  — pick off as they annoy. (Quick capture already shipped in Phase 2 capture track;
  expand/collapse-all and expand-through-level shipped with the command deck below.)

Phase 1's Achieve core is complete. Remaining Phase 1 items are residual chrome polish, not
blockers for Phase 2 slices.

---

## Phase 2: Achieve depth & platform

Features that complete or surround the original product, plus making it multi-device.

### Near-term Achieve surfaces

- **✅ Metrics tab + import/export.** `specs/2026-08-02-0912-metrics-tab`. First-class
  `metrics` / `metric_entries` (optional goal owner, history survives goal delete). Metrics
  tab lists all metrics with Group by Owner and an SVG performance graph; Metric form
  (General + Tracking) with tracking grid and CSV export/import; Goal form Metrics section
  uses the same store. ACHXML import/export of `Metrics` + `MetricTracking`.
- **✅ Metric types (Instance / Cumulative / Total).**
  `specs/2026-08-02-1336-metric-types`. Type select on Tracking; Last Value and the
  performance graph interpret entries by type (latest absolute vs sum / running sum).
  ACHXML maps type codes. Agent tools: `list_metrics` / `get_metric` / `create_metric` /
  `update_metric` / `log_metric_entry` / `update_metric_entry` on `POST /api/agent/*`.
  Deferred still: auto-target, day contribution targets, auto-increase, metric
  recurrence/reminders (Status On Schedule / Overdue), graph zoom/print.
- **✅ Task Chooser.** `specs/2026-07-30-1858-task-chooser`. `/chooser` ranks every leaf
  task and task-less project by a transparent additive score — inherited priority (L.A.P.)
  plus deadline proximity, target dates, Focus, and result-area importance — with the Score
  and rank on screen and every weight tunable per view. Five views (Best Overall, Next
  Action Only, To-do List, Urgent, Deadlines), Achieve's nine date bands including Group By
  Deadline, Show More/Less, and the `Project:` breadcrumb. Settings originally persisted
  per view in `localStorage`; moved onto `user_settings` by
  `specs/2026-07-31-1520-persistent-ui-state`. Deferred: Best in Project Block and Best
  work-related / Best personal (both need machinery that doesn't exist yet), the Parents
  pane, and task predecessors.
- **✅ Repeating routine tasks.** `specs/2026-07-31-0834-task-recurrence`. Achieve's
  regeneration-based recurrence (§3.9.1) for tasks — "repeats every N days/weeks/months/
  years after each completion" — implemented as **deferral, never as a deadline**. A
  routine has no deadline, so it can never read as Overdue; completing it cycles the same
  row (Not Started, progress reset, completed children un-completed) and pushes
  `deferred_date` out, which drops it from the Task Chooser until it is due again. Each
  completion is logged to `task_completions`, so history survives without a year of
  duplicate rows in the outline. This is what keeps **Overdue** meaning something.
- **✅ Achieve-parity recurrence.** `specs/2026-08-01-1900-recurrence-ap-parity`. The other
  half of §3.9: **date patterns** beside regeneration, on every frequency. A date pattern
  follows a fixed calendar — every two weeks on a Friday lands on the Friday whenever you
  finished the last one, so finishing next week's report on Wednesday buys you until the
  week after, and missing one still leaves you owing it. Regeneration is measured from the
  completion, for the habits where catching up is meaningless. Every weekday, every weekend,
  chosen days of the week, day D of the month, the first-through-last weekday of a month or
  a year, a date each year, and the Range box (end never / after N / on a date). Completing
  a repeating task now moves its **whole** date set — start, end, deadline, reminder — by
  the same number of days, so a start-to-deadline window survives the cycle. Recurrence
  still never _creates_ a deadline; it only advances one you set, which is what preserves
  the Overdue rule above. Deferred: recurrence on projects, Skip Recurrence, Lead Time →
  Target Start, the Day tab's next occurrence, and any UI over the completion log.
- **✅ The Day tab.** `specs/2026-07-31-1245-day-tab`. A Franklin Covey daily list beside
  Achieve's weekly planning: `/day` is the paper day page (appointments | task list |
  journal), where you jot what you are doing today, rank it A/B/C, and check it off —
  **without** first deciding what result area or project a ten-minute errand belongs to.
  Jotted lines are their own rows (`daily_items`), so the outline and Inbox stay clean, with
  Promote to task… as the escape hatch. Tasks come in from the week grid (`/day/week`, master
  list plus seven day columns) or from **Plan for day** on the record itself, and completing
  one completes the real task, recurrence and all. Planning something takes it off the Task
  Chooser's To-do List — Covey's master list — and only that view. A day assignment is
  **never a deadline**: unfinished lines carry forward with a **→ forwarded** mark on the day
  they left, and nothing on a daily list can read as Overdue. This is what replaces the old
  "Today Project" workaround, which bent three Achieve concepts to fake a daily ABC list.
  Deferred: Big Rocks, a weekly-wizard step, an auto-forward toggle, agent API tools.
- **✅ Deferred-date model.** `specs/2026-08-01-2145-deferred-date-model`. One shelving
  concept: `postponed` is the state, `deferred_date` is its optional expiry — replacing two
  overlapping hide rules that disagreed. Scheduling dates (`target_start`, `target_end`,
  `deferred`) live on `nodes` so projects can be shelved; a CHECK forbids a plan before
  availability; shelving inherits down the tree at read time; day lines suppress only while
  the planned day falls inside the shelf; state and dates couple both ways (including
  backdated completions). Applicable grids' "Postponed" toggle defaults to showing and is
  persisted; Result Areas have no shelving lifecycle. Follow-ups: grid states-list like the
  Chooser; project recurrence.
- **✅ Navigation & command surface.**
  `specs/2026-08-05-0838-navigation-and-command-surface`. The eleven-tab strip is gone,
  replaced by a grouped, collapsible **sidebar** (Plan / Do / Track, with Library reserved)
  and a `⌘K` **command palette** — which is Achieve's **Go** menu, the piece we had never
  ported, and the reason every view had to be a permanent tab. Commands live in one registry
  rendered by two surfaces: the palette lists everything, a `⋯` overflow on each view's
  toolbar lists what does not already have a button, so nothing is reachable by shortcut
  alone. `Show Fields` and `Reset this grid` moved off the always-visible toolbar into `⋯`.
  Library was initially reserved, then gained Time Charts, Resources and Contacts through
  `specs/2026-08-05-1458-remaining-go-menu-modules`; Result Areas is also built under Plan.
  Overview was later delivered by `specs/2026-08-09-2133-overview-and-inbox-organizer`;
  Focus Timer, Time Log and Reports remain reserved. Phone keeps its bottom nav;
  the More sheet is grouped the same way and `⋯` is the touch path to commands. New standard:
  `components/navigation.md`. Its two deferred items — converting the remaining row context menus
  into registered commands, and a command surface on the views with no grid toolbar — are both
  delivered by the command-surface slice below.
- **✅ Shared command deck & item actions.**
  `specs/2026-08-05-2121-command-deck-and-item-actions`. One capability-aware command
  surface for every grid: a compact, selection-aware deck in `GridToolbar` plus the same
  commands in the palette, `⋯` and row menus, all from one descriptor with shared labels
  and disabled reasons. Eleven views declare full capabilities — Outline, Projects, Goals,
  Tasks, Result Areas, Wish List, Notes, Day, Contacts, Resources, Time Charts. The Task
  Chooser gets only the Open/Rename deck `GridToolbar` synthesises from `rowActions`, and
  **Metrics has no deck at all** — it does not use `GridToolbar`. The Outline's legacy strip
  is gone and its row menu is built from the same registry. Also lands: priority repair
  against the complete persisted sibling set rather than the filtered rows, type
  conversion with a loss/conflict preview and one transactional write, and Outline zoom as
  shareable URL state. Deferred: Wish → Dream/Goal conversion, the scheduling / pickup /
  drop command families, and a conversion dialog with server-loaded detail previews.
- **✅ Command surface: menus, icon toolbar, Commands panel.**
  `specs/2026-08-06-1010-command-surface`. The deck above got the plumbing right and the surface
  wrong — a flat row of identically-bordered words overflowing into an **unsorted** `⋯`, which is a
  traditional app menu with the organization removed. Replaced by what Achieve actually did, and
  what Google Sheets still does: a **menu bar** of named, sectioned menus (`New · Item · Organize ·
View · Tools`) with an icon gutter and shortcut column; an **icon row** for the handful of
  commands used every session, clustered by hairline; a pinnable **Commands panel** (Achieve's
  docked _Outline Commands_ pane, in the sidebar's exact visual language, opt-in and remembered per
  user); and `⋯` demoted to the **phone's** menu bar, rendering the same tree with headings.
  Toolbars are two rows now — **verbs above, lens below** — for every grid.

  Under the surface, three kinds of drift closed. A command declares its own **placement**
  (`menu` / `section` / `icon` / `toolbar` / `rowMenu`), so no surface filters the list itself and
  the Outline's twelve-id row-menu allowlist is gone. All eight hand-written row menus derive from
  the registry, which ended `Open record` sitting beside `Open` and Notes printing `Ctrl+Insert`
  where everything else printed `⌃Insert`. And a command declares its **binding**, with the printed
  shortcut derived from it and one `document` listener replacing eleven — selection movement stays
  with the views, because arrows are navigation, not commands.

  Metrics, Fitness and Schedule joined the shared surface, closing the `navigation.md` violation
  those three were: their commands had existed as bordered buttons and nowhere else. The Day grid's
  twelve right-click-only verbs (`Rank A`–`D`, the `Mark …` states, `Move to tomorrow`,
  `Promote to task…`) are now in the menus, the panel and `⌘K`. Amends both
  `components/navigation.md` (three surfaces → five) and `components/data-grid.md` (the menu tier;
  verbs/lens is no longer conditional). Follow-ups: right-click **content** expansion with submenus
  — the next slice, below — plus a pin/reorder command row and rebindable shortcuts, both of which
  the weight-and-binding model now makes possible.

- **✅ Menus as the complete catalog.**
  `specs/2026-08-13-1050-menu-completeness`. The surface above already said the menu bar must be
  complete; app-wide verbs (Quick capture, Process Inbox, Plan Week…, Settings, Sign out) still
  lived only in `⌘K`. They are now a leftmost **File** menu, registered at the shell so the
  Commands panel and phone `⋯` see them, on every AppShell destination including Overview and
  the organizer. **View ▸ Command palette** is the menu path to `⌘K`. Go-to destinations stay
  sidebar + palette — no Go menu. `navigation.md` now states the rule: a command without
  `menu` is not shipped, except `group: "go"`. The menu itself is application chrome above
  the page bar (`specs/2026-08-16-2152-app-menu-above-pages`): File stays put when tabs
  change, Insights and Dashboard have a menu, and a dual-grid page names which grid
  `Filter…` targets.

- **✅ Right-click completion: submenus, the surfaces it missed, the verbs it lacked.**
  `specs/2026-08-06-1506-right-click-completion`. The surface above worked almost everywhere; this
  finished what it carried and where it reached.

  **Submenus.** A family named in `NESTED_SECTIONS` folds behind one row — a fly-out on the
  desktop, a drill-in with a Back row on touch — on the menu bar as well as the row menu. That is
  what let `Convert to ▸` onto the row menu at all: its five rows were a third of the menu's
  height and had been kept off entirely, so the one view with conversions offered them nowhere on
  right-click. Which families fold is declared, not derived from length; the one length rule is a
  floor of two.

  **The surfaces.** The Outline stopped building its row menu from a second, narrower
  capabilities object and gained Convert to, Priority and Zoom. Blank grid space opens the same
  menu with nothing selected — item verbs greyed with their reason, creation live — rather than
  the browser's. And the **week calendar**, which had no right-click at all, got one: open,
  duplicate, `State ▸` and delete on an appointment; create, navigate, slot granularity and Work
  Week Mode on a slot. FullCalendar exposes no hook, so the target is resolved by hit-testing the
  point — its slot rows and day columns are overlaid tables and neither is an ancestor of the
  other.

  **The verbs.** Complete (`⌃L`) with the state vocabulary behind `State ▸`, `Schedule block…`
  (`⌃⌥⇧B`) which opens the week with a drawer prefilled from the row's own effort,
  `View tasks…` / `View project…` (`⌃T` / `⌃⇧J`), **View in Outline** (`specs/2026-08-14-1142-view-in-outline` — `?select=` lands on the row without opening the drawer), and Achieve's `Pickup Row(s)` as **Cut and
  Paste** — a move, so `moveNode` covers it and no mutation was added. Delete, the state changes
  and Cut now act on the whole selection and print its size.

  Three real defects surfaced while driving it. Five modules had **no Delete at all** — a task
  made on `/tasks` could only be removed from the Outline. The tabs never handed over their first
  "rows on screen" list, so Shift-arrow walked whole-tree order and could select 51 rows on a
  six-row view. And that list was the rows passed _into_ the grid, before its own filters —
  invisible while a selection only highlighted, not invisible once Delete acts on it. `DataGrid`
  reports what it is showing now. The scope selects became `?scope=`, which both gives
  `View tasks…` somewhere to land and makes a narrowed tab survive reload and Back. Amends
  `components/navigation.md`, `components/data-grid.md` and `components/responsive.md` — where
  the row menu is finally the bottom sheet that standard has always described. Follow-ups:
  paste-as-duplicate, and Undo/Redo, which is now the largest missing safety net in the app.

- **✅ Views across all modules.** `specs/2026-08-05-1059-views-across-modules`. Saved views
  stopped being a feature of three grids and became one of the app: **Outline, Projects, Goals,
  Tasks, Wish List, Notes and the Task Chooser** all create, update, rename and delete named
  views through one hook (`useModuleViews`) and one control, with only the View select on the
  bar and the four commands behind `⋯`. This closes the "user-saved named views" deferral
  above. Two things changed about what a view _is_: it now records **switch positions** (the
  Outline's Areas/Goals levels, Next Actions, Include Goals) with no migration — a switch is
  independently keyed, so the fallback is per key rather than per map — and a module's **own**
  settings ride along in view-keyed scopes, so a Chooser view keeps its own scoring weights
  (Achieve's rule, manual §8.1.4) and a Notes view its nested/flat mode, sort and filter.
  `SavedView.base` names the built-in a view derives from, because the Chooser resolves
  behaviour and not just defaults from the view id. **Terminology:** the eleven navigation
  destinations are now **modules**, freeing "View" for the in-grid thing Achieve called a View;
  storage keys still say `tab`, deliberately. Dropped from scope: the Metrics tracking grid
  (four columns, two unhideable — a view there would carry two booleans). The settings
  unification later shipped in `specs/2026-08-09-1956-settings-workspace-date-format`: module,
  grid, and named-view preferences share one grouped reset surface while saved-view settings
  remain protected from bulk reset. Deferred: capturing sort and density.
- **✅ Module pages.** `specs/2026-08-13-0747-module-pages`. Navigating _within_ a module was
  the one tier `components/navigation.md` never governed, so four modules had invented four
  answers: Fitness a bordered segment in one style, Schedule and Notes a bordered segment in
  another, Day a bare pair of links — three visual treatments and two persistence models. A
  **Page** is now a destination inside a module (Sessions, Journal, Agenda, Register), backed
  by a URL segment, listed in one registry (`lib/navigation/pages.ts`), and drawn by one
  shell-owned underline bar that renders only at two or more built pages — so eight modules
  pay nothing. The rule that sorts it: **underline tabs are navigation, bordered segments are
  a setting with two or three values**; density keeps its segment. Calendar|Agenda and
  Grid|Journal stopped being stored presentations and became routes, which gains them Back,
  reload and deep links while `shell.lastPage` keeps the stickiness that motivated the
  setting. Notes' two pages now load only their own data — `/notes` had been calling both
  `loadNotesListPayload` and `loadDiarySummaries` on every visit because it could not know
  which layout would render. **Day is no longer a module:** it folded into Schedule as
  `/schedule/day` and `/schedule/week-plan`, which is what `modules.ts` had already named as
  the alternative to deleting it, and "Weekly Schedule" became **Schedule** because a name
  promising a week is wrong on half its pages. A relocation, not a decision about Day's
  future. **Terminology:** module → page → view, with _pane_ reserved for a layout region
  that collapses below `md`, and "lens" fixed to name exactly one thing (the toolbar's second
  row). The rejected alternative is recorded in the spec: splitting these by whether they show
  the same records differently or different records entirely, which does not survive the cases
  and is how the inconsistency was generated in the first place. Follow-ups: Day stacks two
  toolbars and spends 232px of chrome before its first row on a phone; three week-shaped
  surfaces (Calendar at seven days, Week Plan, the planning wizard) now sit within one bar of
  each other; Finances Insights flips its reserved page to built and makes that bar appear.
- **✅ Module consolidation.** `specs/2026-08-13-0845-module-consolidation`. Having built the
  Page tier, the obvious next question was which destinations should have been modules at all.
  Nine of fifteen should not: **Overview, Outline, Projects, Tasks, Goals, Wish List and Result
  Areas each called the same `loadOutline(userId)` and differed only in which grid rendered it**
  — one dataset, seven presentations, which is exactly what a Page is — and Contacts and
  Resources were reference lists rather than places you work. They became the pages of **Plan**
  and **Library**, and the Time Charts list joined Schedule beside the editor that had always
  lived at `/schedule/time-chart/[chartId]`. Fifteen modules became eight, and **sections went
  with them**: they existed so a sidebar could reach twenty destinations, and after the collapse
  `Plan` and `Library` would each have been a heading over one row of the same name. `/` now
  redirects to `/plan` rather than to Overview, so you return to the page you left and the hub
  is where a first visit lands. Two mechanisms changed rather than moved: `primary: boolean` on
  a module became `PRIMARY_DESTINATIONS`, because the phone's Tasks slot must open one page of
  Plan and a flag can only point at a module; and `MobileNav`, which had hard-coded its three
  hrefs in violation of the registry rule since it was written, finally reads the registry. The
  trap worth knowing about: **the Time Charts list is the plural segment and its editor is the
  singular one**, because a declared segment owns its subtree and merging them would put the
  page bar on a focused flow — `pages.test.ts` asserts both halves so nobody tidies it away.
  Twelve legacy paths redirect with their query strings intact. Follow-ups: a Contexts page if
  `MasterContextsDialog` starts to chafe; folding Projects / Goals / Result Areas into one Items
  page with Views if seven tabs read as cluttered in daily use.
- **✅ Schedule day counts + agenda mode.**
  `specs/2026-08-12-1910-schedule-day-counts-agenda`. The Weekly Schedule stopped being a
  week: Achieve's **One / Three / Five / Seven / Ten / Twenty Days** widths from its View
  menu, on the calendar's right-click and in the menu bar behind `Days ▸`. Two departures
  from Achieve, both deliberate. The range **starts on today** by default and rolls forward,
  with `Align to the week` restoring the Sunday-anchored view exactly — the docs never state
  an anchor rule for the non-seven widths, and a schedule whose left-hand third is already
  spent is one you read around. And a second mode, **Agenda**: the same days as a `DataGrid`
  with Date, Time, Subject, Project, status and **Days left**, which no time grid can show.
  Achieve had no appointments grid at all; this follows Google Calendar's Schedule view.

  Underneath, the day count counts **visible columns** — Work Week Mode's "Five Days" is
  Monday to Friday, not Sunday to Thursday with two missing — and one pure function
  (`lib/schedule/range.ts`) answers "which days" for the server loader and the calendar
  alike, because two implementations of that would eventually draw a column nothing was
  loaded for. The Google mirror now syncs a **canonical window** (whole weeks, four minimum)
  rather than the visible range: freshness is time-based only, so a window that shrank with
  the day count would report itself fresh over days it never fetched. `?week=` became
  `?start=`. Supersedes the base calendar spec's "month/day primary views" exclusion, narrowly
  — month and year views stay out. Deferred: agenda rows for deadline-bearing tasks, and
  window-aware sync staleness (pre-existing).

- Any remaining Achieve chrome that earns its keep.
- **Pomodoro → time tracking.** Effort, Effort Left, Actual Effort, and % complete
  already live on tasks (and roll up); what’s missing is a way to _earn_ those numbers
  while working. Stage it rather than jumping to a full timesheet product:

  1. **MVP — Pomodoro on a task or project.** Start a focus timer from the selected
     outline/grid row (or the open drawer). Configurable work/break lengths; clear
     “what I’m on” context. On complete (or stop), optionally add elapsed minutes to
     that node’s **Actual Effort** (and nudge Effort Left / % if we already compute
     them that way).
  2. **Next — session log.** Persist started/stopped intervals linked to `node_id`,
     not only a running total — so a day or week can be reviewed.
  3. **Long-term — full time tracking & reports.** Start/stop without Pomodoro,
     actual-vs-estimated analysis, time by project/result area/role, and feed the
     weekly calendar’s estimated-vs-actual story. Same data model as (2); richer UI
     and reporting on top.
  4. **Appointment check → effort (later).** Appointments already have Achieve’s
     three-state checkbox (open / done / missed). Marking **done** should eventually
     contribute duration to the linked project’s Actual Effort (Effort to Date) —
     but project effort fields are rollups of tasks today, and the right model is
     the session log in (2), not a one-off write from the calendar. Wire this when
     time tracking exists; until then the checkbox is a local record only.

- **Roles & goals (Covey).** Explicit life roles, balance review in weekly planning —
  partly already modeled as Result Areas; deepen where Achieve or Covey still beats us.

### Capture & access

- **✅ In-app inbox & quick entry.** `specs/2026-07-30-1018-inbox-quick-capture`. An
  **Inbox** project (Achieve's `<Inbox>`, minus `<New Tasks>`) that quick capture drops
  into, created on first use and identified by a flag so renaming it still works. A capture
  box on `c` from any tab: multi-line, Enter to add, indentation becomes subtasks, pasted
  bullets / numbers / checkboxes / quotes / headings are stripped, `##` splits a note off
  the name, optional Priority / Effort / Deadline / Contexts / Project. Came with a
  **hierarchy relaxation** — anything may sit at the top level and a child may be the same
  rank or deeper than its parent, so a quick task never has to be filed to exist.

- **✅ Alfred on macOS (inbox capture).** `specs/2026-07-30-1323-alfred-inbox-capture`.
  Agent tool `POST /api/agent/capture` writes one task into the Inbox via `ensureInbox` /
  `captureItems` (not root-level `create_node`). Alfred workflow sources under
  `tools/alfred/` (keyword e.g. `pin`, Bearer key + base URL as workflow variables).
  Raycast later if useful.

- **✅ Apple Reminders drain.** `specs/2026-07-30-2126-apple-reminders-drain`. "Hey Siri,
  remind me to…" now reaches the planner. Apple has no server-side API for Reminders —
  EventKit is on-device only, and iOS 13's Reminders migration broke the old iCloud CalDAV
  route — so this is a **Shortcut**, not a cron: it reads incomplete reminders from the
  **default** list (where Siri writes), POSTs them as one batch to `/api/agent/capture`
  with name, notes and due date, then marks each complete. Sources under `tools/shortcuts/`.
  Came with the **provenance columns** the schema was missing — `external_source` /
  `external_id` on `nodes`, unique per user — which make the drain idempotent: a run that
  POSTs successfully and then dies before completing the reminders is fixed by running it
  again, not by deleting duplicates by hand.

### Platform

- **✅ Multi-user accounts & auth (personal gate).** `specs/2026-07-29-1630-email-password-auth`.
  Better Auth self-run (email/password, no public signup), session-backed
  `getCurrentUserId()`, middleware redirects guests to `/login`. Schema was already
  multi-user-ready.
- **✅ Real multiple accounts, and a test identity that is not one.**
  `specs/2026-08-01-1042-multi-user-accounts`. `npm run user:create` provisions, updates, or
  renames an account in place, so a second person is one command rather than a schema
  question. Session / dev-bypass / agent identities resolve separately — they were one
  function, which is how the local app ended up writing to a real Google Calendar with
  nobody signed in. Settings gained **Disconnect Google** and shows which account it is
  serving. Invite UI and per-user agent API keys still open.
- **Sync / multi-device.** Already implied by web + Neon; polish only if friction appears.
- **Responsive / mobile (iPhone-first).** `specs/2026-07-31-1938-responsive-mobile`. The app is
  installable as a PWA but was built as a desktop instrument — a 13px, 28px-row grid driven by
  hover, right-click, double-click and drag. Below `md` it becomes a different layout over the
  same data: bottom nav, card lists, full-screen sheets, tap and long-press. Day, Quick Capture,
  the list tabs and Notes get first-class phone treatment; Outline, Weekly Schedule, Task
  Chooser and the planning surfaces degrade gracefully rather than being redesigned. Desktop
  layout and density are unchanged. Codified as `standards/components/responsive.md`.
  Row swipe now carries the two most common actions on every node grid — right completes,
  left deletes behind the usual confirmation — derived once from a view's capabilities the
  way its row menu is (`specs/2026-08-08-1757-mobile-swipe-row-actions`).
- **Import/export.** Achieve data import, full export (own-your-data mandate in
  `mission.md`). Outline core + appointments / time charts / wishes / notes / **metrics**
  ship; RedNotebook journals and Tomboy note archives also import from Settings. Remaining
  Tier A–C tables still grow with product surfaces.

### Google integration

Treat as one track with staged depth:

1. **✅ Calendar sync.** `specs/2026-07-31-2046-google-calendar-sync`. Google Calendar _is_
   the planner's calendar now: `/schedule` and `/day` show your real events, and an
   appointment created here is created in Google, so it reaches the phone. **Google is the
   source of truth** — `appointments` is a mirror, not a peer — which is what removes
   conflict resolution, tombstones, and dirty tracking rather than merely simplifying them.
   Local writes go through to Google inside the mutation, so a rejected change never leaves
   a row claiming something Google did not accept.

   Recurrence is deliberately **asymmetric**: pulls use `singleEvents=true` so Google
   expands series and applies its own exceptions and cancellations (no RRULE parser, no
   exception table, `expandRecurrence` untouched), while creates push our model out as
   RRULE, which it maps onto losslessly. The cost, accepted: recurrence is **create-only**
   here — editing a series is a job for Google Calendar.

   Planner-only fields (three-state check, priority, contexts, project link) survive every
   re-sync as annotations the mirror structurally cannot write. Connect and per-calendar
   checkboxes live on `/settings`; new appointments go to the primary calendar.

   Deferred: editing a series, background sync (no cron/queue/push channels — the mirror
   runs on view), attendees and RSVP, multiple accounts, and offline write queueing.
   **Operational note:** publish the OAuth consent screen — while it is in _Testing_,
   Google expires refresh tokens after 7 days.

2. **✅ Contacts sync.** `specs/2026-08-07-1906-google-contacts-sync`. The shared Google
   grant now includes least-privilege, read-only Contacts access. Planner mirrors Google
   Contacts through full and incremental People API sync while preserving Planner-only
   contexts, item notes, task links, and history links. Google-origin contacts remain
   remote-authoritative and cannot be deleted locally; local-only contacts are never
   matched or swept. Settings owns reconnect, enable, manual sync, and disconnect, while
   `/contacts` refreshes a stale mirror opportunistically.

   Deferred: outbound/two-way contact writes, a pause-without-disconnect control,
   background sync, multiple Google accounts, Other Contacts, and Workspace directory
   profiles.

3. **Optional later** — Tasks/Keep-style capture only if calendar and contacts are not
   enough; avoid boiling the ocean.

### Attachments (files on projects / tasks / goals)

Achieve lets you attach a **local filesystem path**. That only works on the machine that
has the file — fine for a Windows desktop app, broken for a multi-device web app. We also
should not host binary blobs ourselves: **S3 (or similar) is paid**, and free hosting
(Vercel / Neon free tiers) is not a file store.

**Constraint:** the planner stores **references**, not file bytes. The file lives in the
user’s cloud (or stays a plain URL); we open it in a new tab or via the provider’s UI.

Stage it:

1. **MVP — links only.** Title + URL on the existing attachment rows (and any other place
   attachments appear). Paste a public or share link (Google Drive, Dropbox, OneDrive,
   Notion, GitHub, raw `https://…`). No upload; no local path field pretending to work
   cross-device. Prefer share links that open without the app being a download proxy.

2. **Next — cloud pickers (no hosting).** After auth exists, optional **Google Drive**
   and/or **Dropbox** file pickers (OAuth): user picks a file, we store provider file id +
   open URL + display name. Bytes never pass through our servers. Google Drive pairs
   naturally with Google Calendar OAuth if we already have a Google consent flow; Dropbox
   is a second provider only if Drive alone is not enough.

3. **Out unless constraints change — first-party file storage.** Uploading to S3/R2/Neon
   blob and serving downloads. Revisit only if personal use demands offline-ish embeds and
   a free tier actually fits (unlikely for real documents). Prefer not to build a CDN.

Also out of the MVP: syncing Achieve’s `file://` / Windows paths into anything useful —
import can keep the path as a note or dead link for archaeology, but the product path is
cloud links + pickers.

---

## Phase 3: Beyond Achieve

Product lines that use the outline/goals as a hub. Each has its own MVP → medium → long
horizon. Ship vertical slices; do not wait for full Achieve parity to start an MVP if the
core loop is already useful.

### GTD as first-class

**Status: Inbox processing shipped; Someday/Maybe remains product thinking.**
`specs/2026-08-09-2133-overview-and-inbox-organizer` makes capture processing an explicit
one-item-at-a-time workflow without replacing the outline model. Do not invent more filter
workarounds for the remaining ontology questions or treat them as already scheduled.

Achieve (and our Phase 1/2 port) **can** do GTD: Inbox project, `proposed` (PR) for
uncommitted work, deferred tickler, Next Actions via Chooser. That was right when AP
fidelity was the scarce asset. Owning the model means we _may_ promote some of that to
first-class concepts — but only where the tree genuinely hurts, and only after living with
what already works.

#### What is now intentional product behavior

- **Inbox items as real tasks** under an Inbox project: capture can attach notes, links,
  imports from elsewhere. The Inbox Organizer presents one item at a time and processes it
  into a Task, Project, calendar event, dated deferral, deletion, or reference Note. Moving
  an actionable item uses the same hierarchy-aware Project picker as the Tasks view.
  Processing to "Next Action" can still be **dragging into the right place in the
  hierarchy**. That is a feature of "everything is a node," not only a hack.
- **Someday/Maybe as Proposed projects** (`proposed` state — **not** Postponed):
  uncommitted incubation with room to collect links, notes, child ideas **before** you
  decide to commit. Postponed is the shelf/tickler axis (interrupted or dated hide);
  Proposed is "I have not signed up for this yet." Conflating them is a doc/agent mistake.
- **Deferred + postponed shelf** already maps cleanly to GTD tickler (see date-model).

#### What remains unresolved

- Inbox as a **sibling of Result Areas** in the committed hierarchy (a project whose job is
  "not yet decided") can feel ontologically off even when drag-to-process works well.
- Pure Someday lists vs "real" projects: if every maybe is a full project row, the outline
  can fill with incubation noise — but those rows _are_ useful as containers for reference
  material. Tension, not a free fix.

#### Open questions for a future Someday/Maybe shape-spec (if any)

1. Is Someday first-class **list membership**, a **state** (`proposed` promoted in UI), or
   still "just projects with PR"?
2. How do notes/links/attachments on proposed projects stay first-class either way?
3. Do not half-implement with more filters that only paper over the tree.

**Why this stays open:** the processing workflow no longer needs an ontology rewrite.
Someday/Maybe is still exploratory product direction, not a commitment to rip out
`is_inbox` or `proposed`.

Related: state vocabulary in `standards/product/date-model.md` (Postponed vs Proposed
flavor; optional palette thinning).

### Fitness tracker

- **✅ Short-term MVP (strength log):** `specs/2026-07-30-1240-fitness-strength-log`.
  Exercise catalog + multi-exercise sessions with ordered sets (reps × weight); Fitness
  tab. History is its own domain (notes-style durability), not outline state. The
  optional task ↔ exercise “plan reminder” was removed in
  `specs/2026-08-17-1402-shelve-task-exercise-link` — tasks and the log stay separate
  until a later Goal-level join is worth designing. Out: cardio/runs, routines,
  recurrence, Health import.
- **Medium-term:** Deeper Goal / Result Area progress surfaces; routines/templates.
- **Long-term:** Optional **Apple Health** (or similar) import — read-only first; cardio.

### Life history

- **✅ Timeline, Jobs and Residences.** `specs/2026-08-13-2006-life-history`. Three
  Library pages: a chronology grid of exact dates (typed events plus derived job and
  residence edges), and catalogs for employment and housing history with the
  international address shape Contacts already uses. Days-ago and elapsed columns
  ship now. Achieve has no life-history feature — this is personal reference data,
  sitting next to Contacts and Resources. Out: linking events to Contacts, partial
  dates, deriving chronology from other dated tables.
- **✅ The timeline ribbon.** `specs/2026-08-14-1724-timeline-ribbon`. The picture the
  grid deliberately refuses to be: `Home` and `Work` drawn as bars over a year axis with
  life events as pins, so duration and overlap are a shape rather than two point rows.
  A `Grid | Timeline` toggle **inside** `/library/timeline` rather than a second Library
  page — both presentations derive from the same one read, so a route would buy nothing.
  Out: filtering the picture, editing from it, an age axis, a pin lane per category.
- **✅ Range and event labels.** `specs/2026-08-14-1805-timeline-range-and-labels`. Drag
  across the ribbon to look at that stretch and it fills the container, which replaced the
  zoom control outright — narrowing the range _is_ zooming in, and nothing scrolls
  sideways any more. Event titles print beside their dots wherever there is room. Out:
  keyboard access to the range, and panning a narrowed window.

### AI integration

- **✅ Near-term (MVP):** Tooling / API / instructions so an **agent can operate the
  planner** — `specs/2026-07-29-1500-ai-interoperability`. Bearer-keyed
  `POST /api/agent/{tool}` for context, outline mutate, notes, light schedule,
  weekly-plan tools, and metrics (list/get/create/update + log entry); thin
  **`planner-agent`** instruction repo (skills + `call-tool.sh`) for coding-agent clients.
  Hardened by `specs/2026-08-09-1130-agent-tool-contracts`: one typed registry now drives
  strict runtime and JSON Schemas, focused live discovery, effects/retry metadata,
  decision-ready pagination, natural-key replays, and atomic weekly-plan batches.
- **✅ Medium-term — MCP + chat clients:** Same registry as a remote MCP server —
  `specs/2026-08-13-1730-remote-mcp-transport`. Stateless Streamable HTTP at
  `POST /api/mcp` (production `https://planner-lee-5344.vercel.app/api/mcp`), Bearer
  `PLANNER_AGENT_API_KEY`, no second write path. `tools/list` exposes the 33 core and
  domain tools so Grok.com / other chat clients do not need HTTP two-step discovery.
  Still open: OAuth, per-user keys, mapping the key to a real user beyond
  `PLANNER_AGENT_USER_EMAIL`. Skills/prompts from `planner-agent` still apply as system
  instructions where the client allows them.
- **Long-term:** Possible **custom AI** (e.g. AWS Bedrock) with durable memory, calling
  those same tools. Prefer tools over “dump the whole tree into the prompt.”

### Financial planning

YNAB-like, but simpler — and connected to goals over time.

- **MVP:** ✅ Import CSVs; ✅ 360 statement PDF backfill; ✅ Chase Prime Visa
  statement PDFs + statement snapshots; ✅ Capital One card statement PDFs;
  ✅ basic register and balances; **envelopes**
  for known expenses and contingencies still outstanding.
  CSV import and the register shipped 2026-08-12 —
  `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`. Capital One 360
  monthly statement PDFs shipped 2026-08-12 —
  `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/` — filling Jul 2023
  through the CSV window onto the same checking/savings accounts, plus the matured CD.
  Chase Prime Visa monthly statements and a `finance_statements` snapshot store shipped
  2026-08-12 — `agent-os/specs/2026-08-12-1540-chase-statement-import/` — backfilling
  Dec 2023–Aug 2024 onto Chase `•••9910` without duplicating the CSV, and keeping
  closing balances / due dates / APRs off the transaction table.
  Capital One VentureOne monthly statements shipped 2026-08-14 —
  `agent-os/specs/2026-08-14-1430-capitalone-card-statements/` — 3,614 historical
  rows onto the existing `•••3448` card (Aug 2019–Jul 2026 PDFs; 2025 files were
  not in the folder) without duplicating the 2025-08+ CSV.
  File ▸ Import on Register and Statements (and the other home pages) plus
  client-side batching under the 4.5 MB Vercel body limit shipped 2026-08-14 —
  `agent-os/specs/2026-08-14-1854-file-menu-imports/`. A folder of statements no
  longer has to be re-picked a handful at a time.
  Envelopes were deliberately deferred until there is real spending data to design them
  against; that is the next piece of this MVP.
  ✅ Insights dashboard shipped 2026-08-13 —
  `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`. Merchant rules, transfer
  pairing, paycheck cadence and reporting, at `/finances/insights`. Classifying the real
  2,845-row history took reported spend from the naive −$493,642 outflow to −$147,362 by
  pairing transfers, and the pay-period axis removes the three-paycheck month. It
  categorises by **who was paid**, which is the best the bank line can support and is
  still a lie for anything sold at more than one store (see Later, below).
  Interactive reports (drill-down, shared filters, YTD/QTD, spending trends, top payees,
  Sankey, cash-vs-card-debt) are in
  `agent-os/specs/2026-08-13-2121-insights-interactive-reports/` (active).
  ✅ Finance agent tools shipped 2026-08-14 —
  `agent-os/specs/2026-08-14-1208-finance-agent-tools/`. Six read-only MCP tools
  (`get_finance_overview`, `get_cash_flow`, `get_spending_breakdown`,
  `list_recurring_bills`, `get_debt_summary`, `search_transactions`) return the
  Insights dashboard's numbers so an agent can analyze cash flow without a
  second composition.
  ✅ Statement reconcile + Statements page shipped 2026-08-14 —
  `agent-os/specs/2026-08-14-1524-statement-reconcile/`. Headline account
  balances are the latest official close plus later imported txs (Capital One
  snapped from a drifted ledger −$2,790 to −$301). Coverage now names
  mid-history holes (the missing 2025 card PDFs). `/finances/statements` lists
  snapshots and the register check; MCP `list_statements` matches the page.
  ✅ Statement-anchored cash flow shipped 2026-08-14 —
  `agent-os/specs/2026-08-14-1617-statement-cash-flow/`. Insights Net chart
  overlays official household-position change on transaction net; the
  residual is the diagnostic. 2025 Cap One PDFs closed the year-long hole
  (June 2025 file is a May reprint).
  ✅ Finances Dashboard shipped 2026-08-16 —
  `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`. The first
  finance page that answers a forward-looking question: available to spend
  before the next paycheck, and how many days that is. Checking and cash,
  less pending, less the full card balance, less what is set aside — savings
  deliberately excluded, and the figure allowed to go negative. Cash position
  sits beside it. Set-asides are a flag on a declared recurring bill, accruing
  a share per paycheck and re-anchoring when the charge posts. `/finances`
  now opens on Dashboard, with the page bar ordered by how often a page is
  read rather than when it was built.
  ✅ Accounts page shipped 2026-08-18 —
  `agent-os/specs/2026-08-18-0856-finance-accounts-page/`. The original register
  spec's unshipped catalog UI: `/finances/accounts` edits name, kind, institution,
  URL and closed on the existing `finance_accounts` table. Bank name-links accept
  any https URL instead of a hardcoded Chase/Cap One host list. Import remains the
  only create path. Envelopes is unchanged.
- **Next:** Envelopes. The dashboard delivered the **set-aside primitive** and the
  surface envelopes will live on; it did not build the envelope model — multiple
  funded categories, rollover, and reallocation are all still ahead.
- **Then:** **integration with Goals** (save for X, fund project Y); AI advice on top of
  envelope + history data.
- **Later — classification that isn't the merchant's name.** Raised 2026-08-12; not in
  the insights spec. Two related failures of "vendor → category":

  1. **AI classification.** A rules list keyed on the normalized merchant will never
     know that this Amazon order was birdseed and that Walmart trip was formula. The
     existing `derived_*` / override split is what an AI pass would write into — it can
     propose, and a person can still win. Do not start this until the register already
     shows honest spend (transfers out, baseline vs one-off).
  2. **Purpose, not vendor.** PayPal posts as PayPal and never says what it was for —
     which is why it got dropped as a way to pay. Amazon and Walmart sell the same
     goods: weekly groceries at Walmart, and also C4, protein powder, birdseed, cat
     food, vitamins, exercise equipment, baby formula — bought at either, depending on
     the week. Filing Walmart as Groceries and Amazon as Shopping makes the biggest
     discretionary merchants uninformative. Fixing that needs item-level purpose (or a
     person), not another merchant alias. Split-across-categories stays out of the
     current spec for the same reason.
  3. **Itemized receipts** — the data that would make (1) and (2) real. One bank row
     is a lump; the receipt is groceries + formula + cat food.
     ✅ Amazon data-request ingest + Orders page shipped 2026-08-14 —
     `specs/2026-08-14-1439-amazon-order-ingest/`. A local script slims the privacy
     zip (JPEGs/PDFs stay out); `/finances/orders` browses 4,594 line items. Matching
     those items to `finance_transactions` (date + last-4 + amount) without changing
     `amount`, and grocery-vs-discretionary tags, are the next spec. Other sources
     still later: order-confirmation email; Walmart is harder from the bank feed but
     purchases go through the app.

- **Eventually:** **Plaid** (or equivalent) to pull bank data by API — only after
  CSV + envelopes are trustworthy, given lock-in and security cost.

---

## Phase order (dependency sketch)

```text
Phase 1 remaining ──► weekly planning workflow (+ calendar polish)
        │
        ├──► Google Calendar (needs schedule surface — now present)
        │
Phase 2 ──► Pomodoro on task/project (writes Actual Effort)
        │         └──► session log ──► full time reports
        │
        ├──► auth ✅, in-app inbox + quick entry ✅, Alfred capture ✅, export
        │         └──► external intake complete: Reminders drain ✅ (provenance columns)
        ├──► attachments: URL links → Drive/Dropbox pickers (no S3)
        ├──► AI tools/API ✅ (agent HTTP + planner-agent repo; Bedrock later)
        │
Beyond Achieve (can start MVPs in parallel once Phase 1 core is daily-usable):
        │         ├──► GTD first-class (Inbox / Someday ontology — future, not filters)
        │         ├──► fitness ✅ MVP, financial, …
        ├── Fitness log MVP
        └── Finance CSV + envelopes MVP
              └── later: goals links, AI advice, Plaid / Health
```

AI **tooling for local agents** does not need Bedrock or multi-user first. Fitness and
finance MVPs should stay separate modules that **link into** nodes/goals rather than
forking a second hierarchy. Pomodoro can ship before the weekly calendar — it only needs
a selected task/project — but reports get more useful once schedule and actuals meet.
Attachment **links** can ship any time the detail forms are open; **Drive/Dropbox pickers**
want real auth (and ideally share Google OAuth with Calendar).

---

## Out of roadmap (for now)

- Marketing / legal distinctiveness from Achieve (see `mission.md`) — personal use first.
- Printing views and Views/Filters sidebar — called out as out of scope in the
  main-grid-tabs shape unless we reopen them. (**Custom column filter builder** reopened
  and shipping in `specs/2026-08-02-1208-custom-column-filters`. Achieve **task recurrence**
  was reopened and shipped earlier — see "Repeating routine tasks" above.)
- Neon Auth / vendor-owned identity schema — declined; see `tech-stack.md`.
