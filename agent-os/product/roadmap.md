# Product Roadmap

## Phase 1: MVP

The core Achieve Planner loop — plan the week, block the time, work the outline.

- **Project/task outline.** Hierarchical tree of projects, subprojects, and tasks with
  inline editing, drag-to-reorder, and collapse/expand. The central view.
- **Weekly calendar + time blocking.** Week grid where tasks are scheduled into time
  blocks, tracking estimated vs. actual duration.
- **Priorities & scheduling fields.** Priority levels (A/B/C plus numbers), due dates,
  estimated time, status, and % complete on each task.
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
