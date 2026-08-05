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
  List. Left out: Priority/State submenus, multi-select actions, `Shift+F10`.
- **✅ Priorities & scheduling fields.** Priority (A/B/C/D + rank), deadline, state, focus,
  effort (with rollups). Effort Left, Actual Effort, and % complete editable in the Task
  form (`specs/2026-07-27-1318-per-type-detail-forms`).
- **✅ Per-type detail forms.** Same spec — Result Area / Goal / Project / Task drawers at
  Achieve parity for the in-scope fields and 24 repeating child lists. Recurrence,
  templates, labels, resource pools, file upload, and the welcome wizard stayed out of
  scope.
- **✅ Main grid tabs.** `specs/2026-07-28-1121-main-grid-tabs`. Shared `DataGrid`, derived
  schedule status, tree slice, and four list tabs — **Projects**, **Tasks**, **Goals**,
  **Wish List** — with scope pickers, built-in Views, grouping, column filters, and Show
  Fields. Outline migrated onto the same grid. Known polish (not blockers for “spec done”):
  Project scope is a select rather than a filtered tree popover; Show Fields move
  up/down is coarse. **Column layout originally used `localStorage` with an explicit "no
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

### Still in Phase 1

- **Residual grid chrome polish** if needed after daily use (Project scope as a filtered
  tree popover rather than a select; finer Show Fields multi-select / multi-move).
  Persistence, control uniformity and the shared control surface
  shipped above.
- **Day-to-day friction from living with the MVP** — expand/collapse-all, find-in-outline,
  seed goals for demos — pick off as they annoy. (Quick capture already shipped in Phase 2
  capture track.)

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
  backdated completions). Grids' "Postponed" toggle defaults to showing and is persisted.
  Follow-ups: grid states-list like the Chooser; project recurrence.
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
  Overview, Focus Timer, Time Log and Reports remain reserved. Phone keeps its bottom nav;
  the More sheet is grouped the same way and `⋯` is the touch path to commands. New standard:
  `components/navigation.md`. Deferred: converting the six row context menus into registered
  commands; `⋯` on the four views with no grid toolbar.
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
  (four columns, two unhideable — a view there would carry two booleans). Deferred: unifying
  the settings UI so a module's own settings stop looking distinct from grid settings;
  capturing sort and density.
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
- **Import/export.** Achieve data import, full export (own-your-data mandate in
  `mission.md`). Outline core + appointments / time charts / wishes / notes / **metrics**
  ship; remaining Tier A–C tables still grow with product surfaces.

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

2. **Optional later** — Tasks/Keep-style capture only if calendar alone is not enough;
   avoid boiling the ocean.

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

### GTD as first-class (open questions, not a rewrite plan)

**Status: future product thinking — not shaped, not scheduled.** Intent only. Do not treat
today's design as a bug; do not invent more filter workarounds as if they were the end
state either.

Achieve (and our Phase 1/2 port) **can** do GTD: Inbox project, `proposed` (PR) for
uncommitted work, deferred tickler, Next Actions via Chooser. That was right when AP
fidelity was the scarce asset. Owning the model means we _may_ promote some of that to
first-class concepts — but only where the tree genuinely hurts, and only after living with
what already works.

#### What already works (keep these strengths)

- **Inbox items as real tasks** under an Inbox project: capture can attach notes, links,
  imports from elsewhere; processing to "Next Action" is often just **dragging into the
  right place in the hierarchy**. That is a feature of "everything is a node," not only a
  hack.
- **Someday/Maybe as Proposed projects** (`proposed` state — **not** Postponed):
  uncommitted incubation with room to collect links, notes, child ideas **before** you
  decide to commit. Postponed is the shelf/tickler axis (interrupted or dated hide);
  Proposed is "I have not signed up for this yet." Conflating them is a doc/agent mistake.
- **Deferred + postponed shelf** already maps cleanly to GTD tickler (see date-model).

#### Where it still feels wrong

- Inbox as a **sibling of Result Areas** in the committed hierarchy (a project whose job is
  "not yet decided") can feel ontologically off even when drag-to-process works well.
- Pure Someday lists vs "real" projects: if every maybe is a full project row, the outline
  can fill with incubation noise — but those rows _are_ useful as containers for reference
  material. Tension, not a free fix.

#### Open questions for a future shape-spec (if any)

1. Keep Inbox-as-tasks + drag-to-process, but change **where** the queue lives (not a peer
   of Work/Personal RAs)?
2. Is Someday first-class **list membership**, a **state** (`proposed` promoted in UI), or
   still "just projects with PR"?
3. How do notes/links/attachments on proposed projects stay first-class either way?
4. Do not half-implement with more filters that only paper over the tree.

**Why not yet:** daily value still comes from the Achieve loop + current capture. This is
exploratory product direction, not a commitment to rip out `is_inbox` or `proposed`.

Related: state vocabulary in `standards/product/date-model.md` (Postponed vs Proposed
flavor; optional palette thinning).

### Fitness tracker

- **✅ Short-term MVP (strength log):** `specs/2026-07-30-1240-fitness-strength-log`.
  Exercise catalog + multi-exercise sessions with ordered sets (reps × weight); Fitness
  tab; optional task ↔ exercise link for outline reminders. History is a separate domain
  (notes-style durability) so deleting a plan task never wipes the log. Out: cardio/runs,
  routines, recurrence, Health import.
- **Medium-term:** Deeper Goal / Result Area progress surfaces; routines/templates.
- **Long-term:** Optional **Apple Health** (or similar) import — read-only first; cardio.

### AI integration

- **✅ Near-term (MVP):** Tooling / API / instructions so an **agent can operate the
  planner** — `specs/2026-07-29-1500-ai-interoperability`. Bearer-keyed
  `POST /api/agent/{tool}` for context, outline mutate, notes, light schedule,
  weekly-plan tools, and metrics (list/get/create/update + log entry); thin
  **`planner-agent`** instruction repo (skills + `call-tool.sh`) for Grok Build /
  Claude Code. Prefer summary tools over dumping the tree.
- **Medium-term — MCP + chat clients:** Package the same agent tools as a **remote MCP
  server** (thin wrapper over `POST /api/agent/*`, not a second write path) so Grok web
  (connectors / Bring Your Own MCP), Claude, and other MCP clients can operate the planner
  without opening a coding-agent workspace. Needs a **public HTTPS endpoint** + auth that
  works for remote MCP (Bearer / API key at minimum; map to a real user after Better Auth).
  Skills/prompts from `planner-agent` still apply as system instructions where the client
  allows them.
- **Long-term:** Possible **custom AI** (e.g. AWS Bedrock) with durable memory, calling
  those same tools. Prefer tools over “dump the whole tree into the prompt.”

### Financial planning

YNAB-like, but simpler — and connected to goals over time.

- **MVP:** Import CSVs; **envelopes** for known expenses and contingencies; basic
  register and balances.
- **Next:** Analyze past spending; light categorization.
- **Then:** AI assistance/advice on top of that data; **integration with Goals**
  (save for X, fund project Y).
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
