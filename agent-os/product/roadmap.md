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
  reordering, collapse/expand. Drag-to-reorder is still outstanding; keyboard and toolbar
  cover it for now.
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

### Still in Phase 1

- **Weekly calendar + time blocking.** `specs/2026-07-28-1234-weekly-schedule` — Week grid
  (FullCalendar Standard), Time Chart background, appointments with recurrence, project
  drag-to-schedule. Estimated vs actual duration analysis and the guided weekly planning
  wizard remain separate.
- **Weekly planning workflow.** Guided weekly review: pick goals, pull tasks from the
  master list, block them onto the week.
- **Outline drag-to-reorder** (carried from the outline spec).
- **Light polish on the main grids** if needed after using them day-to-day (scope popover,
  Show Fields selection, Life Plan / Task Chooser only if still wanted).

---

## Phase 2: Achieve depth & platform

Features that complete or surround the original product, plus making it multi-device.

### Near-term Achieve surfaces

- **Life Plan tab** (if still desired after living with Goals + Result Areas).
- **Task Chooser** and any remaining Achieve chrome that earns its keep.
- **Pomodoro → time tracking.** Effort, Effort Left, Actual Effort, and % complete
  already live on tasks (and roll up); what’s missing is a way to *earn* those numbers
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

- **Quick capture to inbox.** Global shortcut without opening the full app — **Alfred** on
  macOS first; Raycast later if useful.

### Platform

- **Multi-user accounts & sync.** Real auth (Better Auth, self-run — see `tech-stack.md`),
  per-user isolation activated, cross-device sync. Schema is already multi-user-ready.
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

- **Short-term MVP:** Record sets/reps and runs (simple log, no platform integrations).
- **Medium-term:** Link workouts and habits to **Goals** / Result Areas (progress that
  shows up in the same system that plans the week).
- **Long-term:** Optional **Apple Health** (or similar) import — read-only first.

### AI integration

- **Near-term:** Tooling / API / instructions so an **agent can operate the planner**
  (read outline, create/update tasks, report status) — usable from a local coding agent
  with the repo or a thin HTTP/tool surface.
- **Medium-term:** Same tools from a hosted assistant when auth and multi-device exist.
- **Long-term:** Possible **custom AI** (e.g. AWS Bedrock) with durable memory, calling
  those tools to manage the plan. Earlier Bedrock-memory idea stays relevant; prefer
  tools over “dump the whole tree into the prompt.”

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
        ├──► auth, export, Alfred capture
        ├──► attachments: URL links → Drive/Dropbox pickers (no S3)
        ├──► AI tools/API (useful earlier on single-user + local agent)
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
