# Scaffold + Outline Tab

**Status: frozen / complete** (2026-07-27)  
Spec folder: `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/`

> Status classified retroactively on 2026-08-27. This spec predates the status-line
> convention and carries no acceptance checkboxes; the date above is its last
> implementation commit. It is a historical as-built record — further change opens a
> new delta-spec.

## Context

`planner` is a web reimplementation of Effexis Achieve Planner, a Windows time-management
app that is no longer developed. The repo currently contains only docs and Agent OS config —
no application code. This spec delivers the foundation plus the first real feature.

The Outline tab is the right first slice because it is the app's spine: a single tree showing
the whole hierarchy — **Result Areas → Goals → Projects → Tasks** — with arbitrary nesting
depth. Every later feature (Projects tab, Tasks tab, weekly schedule, project blocks) reads
from this same tree, so getting the tree model and its editing interactions right unblocks
everything else.

**Outcome:** a deployed Next.js app where Lee can build and edit his real hierarchy with the
keyboard, and the schema is shaped so the per-type detail forms and the weekly schedule can
be layered on without migration churn.

### Source of truth for behavior

Screenshots of the real app are in `screenshots/` — `OutlineTabSS.png` is the primary
reference for this spec. Vendor documentation was scraped from effexis.com and confirms
terminology: ABCD priorities with optional numeric rank, Effort / Effort Left / Actual
Effort, "project blocks", "time charts", "activity zones", and the Capture → Organize →
Prioritize → Plan → Do process.

### Explicitly out of scope

Deferred so this spec stays completable in one pass:

- **Per-type detail forms.** Each type opens its own multi-tab form in Achieve. The schema
  anticipates them; the forms are separate specs.
- Drag-and-drop reordering (keyboard and toolbar commands cover it for now).
- Saved views / the View dropdown and filter sidebar.
- Tasks tab, Projects tab, Weekly Schedule tab, Notes.
- Real authentication (see Decisions).

## Decisions

**Schema: shared tree table + per-type detail tables.** One `nodes` table owns the tree
structure and every field that appears in the outline grid. Fields exclusive to one type go
in a side table keyed by node id. This keeps the Outline tab a single query against one
table while leaving room for the complex per-type forms.

**Adjacency list + fractional sort keys.** `nodes.parent_id` self-reference for structure,
plus a lexicographic `sort_key` string for sibling order. Fractional keys mean an
indent/outdent/move rewrites one row instead of renumbering siblings. Reads use a recursive
CTE, which also computes L.A.P. (inherited ancestor priority) on the fly rather than storing
it.

**Auth: `user_id` everywhere, no login.** Every row carries `user_id`; every query filters
on it. A single `getCurrentUserId()` returns a seeded dev user. Swapping in Auth.js later
touches that one function, not the schema.

**Type constraints in application code, not CHECK constraints.** Legal parent/child pairs
(a Task may not parent a Result Area) live in one exported table so the rules are readable
and testable, and so the hierarchy can loosen later without a migration.

## Tasks

### Task 1: Save spec documentation

Create `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/`:

- `plan.md` — this plan
- `shape.md` — scope, the decisions above, and open questions (see below)
- `standards.md` — a stub noting `agent-os/standards/index.yml` is empty, so no standards
  applied; re-run `/agent-os:index-standards` before the next spec
- `references.md` — no in-repo references (empty codebase); points at `screenshots/` and the
  scraped effexis.com pages as the external reference
- `visuals/` — copy the outline/projects/tasks/schedule screenshots here

Open questions to record in `shape.md`:

- "Fo" column is Focus, a boolean used for filtering — confirm whether it has any other
  behavior.
- L.A.P. is believed to be inherited ancestor priority, used as a sort key. Confirm against
  the running app.
- Whether Result Area "groups" (the `Group by Category` checkbox) are a separate entity or
  just a text category field. Modeled as a nullable text field for now.

### Task 2: Scaffold the Next.js app

- `create-next-app` — TypeScript, App Router, Tailwind, ESLint, `src/` directory.
- Prettier + a `typecheck` script; keep `strict: true`.
- Vitest for unit tests (tree logic is worth testing directly).
- Replace the placeholder README with real setup instructions.

Verify: `npm run dev` serves the default page; `npm run typecheck` and `npm test` pass.

### Task 3: Database and schema

- Add Drizzle ORM + `drizzle-kit` + `postgres` driver. `DATABASE_URL` in `.env.local`;
  commit a `.env.example`. Confirm `.env*.local` is gitignored.
- Create a Neon project (free tier) for dev.
- `src/db/schema.ts`:
  - `users` — id, email, name, timestamps. Seeded with one dev user.
  - `nodes` — id, `user_id`, `parent_id` (nullable self-FK, `on delete cascade`),
    `type` enum (`result_area | goal | project | task`), `name`, `sort_key`,
    `priority_letter` enum (`A|B|C|D`, nullable), `priority_rank` (int, nullable),
    `status` enum, `deadline` (nullable), `focus` (bool), `collapsed` (bool),
    `notes` (text), `completed_at`, timestamps.
  - `task_details` — `node_id` PK/FK, `effort`, `effort_left`, `actual_effort` (minutes),
    `percent_complete`, `contexts`.
  - `result_area_details` — `node_id` PK/FK, `color`, `category`.
  - Effort lives on `task_details` but is read for projects too, as rollups (see Task 4).
  - Indexes on `(user_id, parent_id, sort_key)` and `(user_id, type)`.
- Generate and apply the initial migration; add a seed script creating the dev user and a
  small sample hierarchy mirroring `OutlineTabSS.png` (Work / Romance result areas).

Verify: `drizzle-kit push` applies cleanly; seed runs; `drizzle-kit studio` shows the tree.

### Task 4: Tree data access layer

`src/lib/tree/` — pure logic, unit-tested, no React:

- `sortKey.ts` — fractional key generation: `between(a, b)`, `first()`, `last()`. Test the
  edge cases (adjacent keys, repeated subdivision).
- `hierarchy.ts` — the legal parent/child table and `canNest(childType, parentType)`.
- `queries.ts` — recursive CTE loading a user's full tree in one round trip, returning
  depth, materialized path, and computed L.A.P. per node. Rollups for project effort and
  percent-complete computed here.
- `mutations.ts` — `createNode`, `renameNode`, `deleteNode` (cascades), `moveNode`
  (reparent + resort), `indentNode` / `outdentNode`, `setPriority`, `setStatus`,
  `toggleFocus`, `toggleCollapsed`. Every function takes `userId` and scopes by it.

`indent` = become the previous sibling's last child; `outdent` = become the next sibling of
the parent. Both must reject moves that violate `canNest`.

Verify: unit tests cover sort-key subdivision, indent/outdent at boundaries (first child
can't indent, root can't outdent), cascade delete, and cross-user isolation.

### Task 5: Outline tab UI

Route `/outline` as the default page. Dense grid matching `OutlineTabSS.png`:

- Columns: expander + type icon, Status, Priority, Name (indented), Deadline, Focus.
- Server Component loads the tree; a client component owns editing and selection.
- Inline editing on the Name cell; priority and status as compact cell editors.
- Expand/collapse persisted to `nodes.collapsed`.
- Toolbar: New Result Area / New Goal / New Project / New Task, Delete, Move Up/Down,
  Indent/Outdent — mirroring Achieve's left command panel.
- Header toggles: Show Result Areas / Show Goals / Show Tasks (client-side filtering).
- Priority color coding, and the "N items" grouping headers seen in the screenshots.

Mutations go through Server Actions wrapping Task 4's functions, with optimistic updates so
keyboard editing stays responsive.

Verify: build the sample hierarchy from scratch in the browser; reload and confirm it
persisted with order and nesting intact.

### Task 6: Keyboard interaction

Achieve is keyboard-driven and this is a large part of why it felt good. Match its bindings:

- `Insert` — add sibling after; `Shift+Insert` — add sibling before; `Ctrl+Insert` — add
  child; `Esc` — cancel a pending insert.
- `Tab` / `Shift+Tab` — indent / outdent.
- `↑` / `↓` — move selection; `Alt+↑` / `Alt+↓` — move the row.
- `←` / `→` — collapse / expand.
- `Enter` — edit name; `Delete` — delete with confirm.

macOS has no `Insert` key — bind `Cmd+Enter` / `Shift+Cmd+Enter` / `Ctrl+Cmd+Enter` as the
primary bindings and keep `Insert` as an alias. Show the hint bar Achieve displays above the
grid.

Verify: build a multi-level hierarchy using only the keyboard.

### Task 7: Deploy

- Push to Vercel (Hobby), connect the repo, set `DATABASE_URL` to Neon.
- Run migrations against the deploy database and seed the dev user.
- Confirm the free tiers are actually free at this usage — no card required on either.

Verify: the deployed URL loads the outline and edits persist.

## Verification

End to end, after Task 7:

1. `npm run typecheck && npm test && npm run build` all pass.
2. Locally, seed a fresh database and confirm the sample hierarchy matches
   `screenshots/OutlineTabSS.png` in structure.
3. In the browser: create a Result Area, nest a Goal under it, nest two Projects, nest Tasks
   under one Project — keyboard only. Reorder with `Alt+↑`. Outdent a Task to Project level
   and confirm it is rejected if it would violate `canNest`.
4. Reload and confirm structure, order, collapse state, priorities, and focus flags survive.
5. Confirm the deployed instance behaves identically.

## Execution notes

Where the build diverged from this plan. Recorded after the fact, on 2026-07-27.

- **Keyboard handling is bound to `document`, not the grid.** The plan assumed a focused
  grid element would receive key events. It never reliably held focus — clicking a row left
  `document.activeElement` on `<body>`, so nothing fired. Binding at document level and
  ignoring events whose target is a form field is both simpler and better suited to a page
  whose entire content is the outline. An earlier attempt to force focus on row click was
  reverted: focusing the scroll container jumped the scroll position.

- **The first deploy went to production, not preview.** Vercel assigns a project's first
  deployment to production regardless of flags. The intent had been to keep an
  unauthenticated app off a public URL. It is public at
  `planner-sable-three.vercel.app`, and Vercel's Hobby plan cannot protect a production
  domain — Standard Protection covers preview and deployment URLs only. Accepted knowingly
  while the database holds nothing but sample data; see `README.md`.

- **Drag-and-drop reordering is still deferred**, as scoped. Keyboard (`Alt+↑`/`Alt+↓`) and
  the toolbar cover reordering. _(Superseded — delivered 2026-07-28; see the change section
  at the end of this file.)_

- **Effort entry was missing and added afterwards.** The plan's Task 5 listed Effort as a
  displayed column and never as an editable one, so the feature shipped with effort
  unenterable outside the seed script. Fixed in a follow-up: leaf tasks are now editable,
  and duration/priority parsing lives in `src/lib/tree/format.ts`.

- **Standards were imported rather than discovered.** `standards.md` recommended running
  `/agent-os:discover-standards`. Instead, two standards were adapted from Lee's
  `wrcs/reactwrcs` project — see `agent-os/standards/components/`. Discovery against this
  codebase's own conventions is still worth doing later.

## Change: drag-to-reorder (2026-07-28)

Closes the one piece this spec deferred. Small enough to land as a change section rather
than its own spec folder; the decisions below are the durable part.

**What shipped.** Outline rows are draggable onto and between each other. A drop resolves
by which third of the target row the pointer is over: the top and bottom thirds insert
beside it, the middle third drops it in as a child.

**Decisions worth keeping:**

| Decision                                                                                       | Why                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop resolution is a pure function (`src/lib/tree/dnd.ts`), not logic inside the drag handlers | The gesture is ambiguous — a line under a row could mean "next sibling", "first child of the row above", or "sibling of an ancestor" — and `LEGAL_PARENTS` rules most readings out on any given drop. One tested function decides, and the indicator can then be drawn at the depth the node will _actually_ land at. |
| The gap under an **open** parent means "first child", not "next sibling"                       | That gap sits directly above the parent's own children, so the sibling reading contradicts what the user sees. Under a collapsed or childless row the plain reading stands.                                                                                                                                           |
| An illegal level **snaps out to the nearest ancestor that will have it** rather than refusing  | Dragging a Result Area over a deep task has exactly one legal meaning — the top level — so the drop line jumps there instead of showing a no-drop cursor. Without it, a Result Area could never be dragged at all.                                                                                                    |
| The middle third falls back to a sibling placement when a row cannot host the node             | Otherwise the centre of most rows is a dead zone. The indicator switches from a ring to a line, so it still tells the truth.                                                                                                                                                                                          |
| No optimistic patch on drop                                                                    | A move changes depth, sibling order and effort rollups at once. Re-deriving that on the client would duplicate `lib/tree/derive`; the server round-trip `apply` already does is the honest answer.                                                                                                                    |
| `draggable` is armed on `mousedown`, not left on                                               | Every row carries priority, effort and deadline `<input>`s. A permanently draggable row steals the click-and-drag that selects text inside them.                                                                                                                                                                      |
| Drag lives in `DataGrid` behind an opt-in `rowDrag` prop                                       | The gesture is generic; the meaning is not. The grid owns zones, hover state and the indicator; the outline owns resolution and the move. Other tabs pass nothing and are unchanged.                                                                                                                                  |

**Also:** dropping into a collapsed row expands it, so the node does not appear to vanish.
`moveNode` in `src/lib/tree/mutations.ts` already existed for indent/outdent and was reused
as-is — the only new server surface is `moveNodeAction`.

**Not covered:** multi-select drag, drag between tabs, auto-scroll when dragging past the
edge of a long outline, and spring-loaded expand on hover.

## Change: row context menus (2026-07-28)

Right-click menus on grid rows, across the Outline and the list tabs. Recorded here rather
than in the main-grid-tabs spec because the shared `ContextMenu` and the tree commands both
live on this side.

**Scope decision: the menu adds discoverability, not capability.** Every entry is a command
that already has a keyboard shortcut and a toolbar button, and each entry prints its
shortcut — the menu is also how the keyboard gets taught. Nothing is reachable by mouse
alone, which `ux-principles.md` requires.

- **Outline** — open, rename, add sibling before/after, add child, indent, outdent, move
  up/down, collapse/expand, delete. Entries are greyed out on exactly the conditions that
  would make the command fail (first at its level cannot indent or move up, top level
  cannot outdent, a childless row cannot collapse), so choosing one never raises an error
  banner.
- **Projects / Tasks / Goals** — open and rename only. These tabs are views onto the tree,
  not the tree, so they carry no restructuring commands.
- **Wish List** — open owner, its one command. Rows there are `node_items`, so it wires the
  menu directly rather than through `DataGrid`.

**Decisions worth keeping:**

| Decision                                                           | Why                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu items are built when the menu opens, not held in state        | Disabled state has to reflect the tree as it is at that moment, not as it was when the row rendered.                                                                                                                                                                                     |
| Tree commands were refactored to `commandsFor(node)`               | They were bound to the _selection_. A right-click acts on the row under the cursor, which is not reliably the selection at the moment the menu opens. Keyboard and toolbar now pass the selection into the same function.                                                                |
| Collapse/expand is deliberately **absent** from the list-tab menus | Those tabs list matching nodes rather than a walkable tree, so collapsing changes nothing on screen — the effect only shows up on the Outline. An entry that appears to do nothing where you clicked it is worse than no entry. (The row expander itself is pre-existing and unchanged.) |
| Right-click inside a cell editor falls through to the browser      | Cut/copy/paste is the useful menu inside a text field. Same rule the drag-arming check uses.                                                                                                                                                                                             |
| The menu closes on scroll — but not on the scroll it causes        | Right-clicking selects the row, and a partly-visible row scrolls into view on the frame the menu opens. The scroll listener is registered one frame late so that one is skipped.                                                                                                         |

**Non-obvious constraint, worth remembering.** The menu must swallow keys so `Delete`
doesn't reach the outline's delete-row shortcut behind it, and `event.stopPropagation()`
**is not sufficient**. App Router hydrates on `document`, so React's delegated listener and
the outline's own `document` keydown listener are two listeners on the _same node_, and
stopping propagation never cancels siblings on the same node. It needs
`event.nativeEvent.stopImmediatePropagation()`. Any future overlay that listens for keys
has the same problem — `Drawer` sidesteps it by using the capture phase instead.

**Not covered:** submenus (Achieve has Priority/State ones; those fields are already
inline-editable columns), multi-select actions, a menu on group headers or on the empty
area below the rows, and `Shift+F10` / the Menu key as a keyboard route to open it.
