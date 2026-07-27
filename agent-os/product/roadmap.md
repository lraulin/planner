# Product Roadmap

## Phase 1: MVP

The core Achieve Planner loop — plan the week, block the time, work the outline.

- **✅ Project/task outline.** Delivered by
  `specs/2026-07-27-1100-scaffold-and-outline-tab`. The Outline tab shows the whole
  hierarchy — Result Areas → Goals → Projects → Tasks, nestable without limit — with
  keyboard-driven inline editing, indent/outdent, reordering, and collapse/expand.
  Drag-to-reorder is still outstanding; keyboard and toolbar commands cover it for now.
- **✅ Priorities & scheduling fields.** Priority (A/B/C/D plus rank), deadline, state,
  focus, and effort are editable in the outline, and effort rolls up through the tree.
  Effort Left, Actual Effort, and % complete became editable in the Task form, delivered by
  `specs/2026-07-27-1318-per-type-detail-forms`.
- **🟡 Per-type detail forms.** Delivered for Result Areas and Projects by
  `specs/2026-07-27-1318-per-type-detail-forms`, at parity with Achieve — all six Result
  Area tabs and all eleven Project tabs, including the repeating child lists (Objectives,
  Risks, Stakeholders, Roles, Issues, and the rest). Each opens in a drawer rather than a
  modal; see `standards/components/ux-principles.md` for why. Goals and Tasks have a
  minimal single-pane form over the existing schema — their full Achieve forms still need
  reference captures, alongside `screenshots/welcome_wizard/`. Recurrence, templates,
  labels, and resource pools were left out of scope.
- **Weekly calendar + time blocking.** Week grid where projects are scheduled into time
  blocks, tracking estimated vs. actual duration.
- **Weekly planning workflow.** A guided weekly review: pick goals, pull tasks from the
  master list, block them onto the week.

## Phase 2: Post-Launch

### Near-term priority

- **Quick capture to inbox.** A global shortcut to add an item to the inbox without opening
  the app, via an **Alfred** workflow on macOS. Further Alfred integrations may follow, and
  other launchers (Raycast) are possible later.

### Then

- **Time tracking & reports.** Start/stop timers, actual-vs-estimated analysis, and
  time-spent-by-project/role reporting.
- **Roles & goals (Covey).** Define life roles and long-term goals, link projects and tasks
  to them, and review balance across roles during weekly planning.
- **Multi-user accounts & sync.** Activate real auth, per-user data isolation, and
  cross-device sync — the payoff for building multi-user-ready in Phase 1.
- **Import/export & integrations.** Import existing Achieve Planner data, export to standard
  formats, and sync with external calendars (Google / CalDAV).

## Phase 3: Exploratory

Ideas worth pursuing, not yet committed.

- **Financial planning.** Lee has a separate personal finance app in progress; folding it in
  would let financial goals connect to the roles-and-goals system.
- **AI personal assistant.** A prior attempt used a git repo as agent memory. The newer idea
  is an assistant on AWS Bedrock that manages its own memory using Bedrock's memory
  features, with this app exposing tools the assistant can call to read and modify the plan.
