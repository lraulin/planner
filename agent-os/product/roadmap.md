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
  up/down is coarse; screenshot walkthrough and a few open questions in the plan remain.
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

### Still in Phase 1

- **Light polish on the main grids** if needed after using them day-to-day (scope popover,
  Show Fields selection, Life Plan / Task Chooser only if still wanted).
- **Day-to-day friction from living with the MVP** — expand/collapse-all, find-in-outline,
  quick capture, seed goals for demos — pick off as they annoy.

Phase 1 core loop is now complete enough for daily use. Remaining Phase 1 items are
polish, not blockers for starting Phase 2 slices.

---

## Phase 2: Achieve depth & platform

Features that complete or surround the original product, plus making it multi-device.

### Near-term Achieve surfaces

- **Life Plan tab** (if still desired after living with Goals + Result Areas).
- **Task Chooser** and any remaining Achieve chrome that earns its keep.
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

- **External intake to the inbox.** The above only works with the app open in a browser,
  which is the half of the capture habit that matters least — the point is getting an idea
  out of your head wherever you are. Staged:

  1. **Apple Reminders drain.** "Hey Siri, remind me to…" is already the fastest capture
     path on hand. Apple has no server-side API for Reminders — EventKit is on-device only,
     and iOS 13's Reminders migration broke the old iCloud CalDAV route — so this cannot be
     a cron pulling from the cloud. It is a **Shortcut** that reads a dedicated list, POSTs
     each item to `/api/agent/create_node`, and completes it. Needs a provenance/dedupe
     column; nothing in the schema records where a row came from.
  2. **Alfred on macOS.** One task at a time, same endpoint, for typing rather than
     talking. Raycast later if useful.

### Platform

- **✅ Multi-user accounts & auth (personal gate).** `specs/2026-07-29-1630-email-password-auth`.
  Better Auth self-run (email/password, no public signup), session-backed
  `getCurrentUserId()`, middleware redirects guests to `/login`. Owner provisioned via
  seed/env. Schema was already multi-user-ready; second-user invite UI and OAuth still
  open.
- **Sync / multi-device.** Already implied by web + Neon; polish only if friction appears.
- **Import/export.** Achieve data import, full export (own-your-data mandate in
  `mission.md`).

### Google integration

Treat as one track with staged depth:

1. **Calendar sync** — show Google Calendar alongside (or inside) the weekly schedule;
   push time blocks / pull busy times.
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
  `POST /api/agent/{tool}` for context, outline mutate, notes, light schedule, and
  weekly-plan tools; thin **`planner-agent`** instruction repo (skills + `call-tool.sh`)
  for Grok Build / Claude Code. Prefer summary tools over dumping the tree.
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
        ├──► auth ✅, in-app inbox + quick entry ✅, export
        │         └──► external intake: Reminders Shortcut, Alfred (needs a dedupe column)
        ├──► attachments: URL links → Drive/Dropbox pickers (no S3)
        ├──► AI tools/API ✅ (agent HTTP + planner-agent repo; Bedrock later)
        │
Beyond Achieve (can start MVPs in parallel once Phase 1 core is daily-usable):
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
- Achieve recurrence, printing views, custom filter builder, Views/Filters sidebar —
  called out as out of scope in the main-grid-tabs shape unless we reopen them.
- Neon Auth / vendor-owned identity schema — declined; see `tech-stack.md`.
