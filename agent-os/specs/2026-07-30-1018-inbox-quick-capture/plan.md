# Inbox & Quick Task Entry

**Status: frozen / complete** (2026-07-30)  
Spec folder: `agent-os/specs/2026-07-30-1018-inbox-quick-capture/`

## Context

GTD's capture habit — get the idea out of your head the moment it appears, decide what it
is later — is a core influence on this product, and the app has no way to do it. Every
route into the outline today requires you to first decide where the thing goes.

Achieve solved this with an `<Inbox>` container project (priority D, at the top level) plus
a Quick Task Entry dialog on a global hotkey. See `references.md` for the screenshots.

Two blockers, both in `src/lib/tree/hierarchy.ts`:

1. `LEGAL_PARENTS.project` has no `null`, so a top-level Inbox project is illegal.
2. `LEGAL_PARENTS.task = ["project", "task"]`, so a task cannot sit at the top level and
   cannot sit directly under a result area or goal.

(2) is a problem independent of the inbox. Forcing every quick task to be filed under a
project is exactly the pointless organizing work this feature exists to avoid. The value of
the hierarchy is top-down planning — being prompted to remember what you need to do. When
you already know the specific thing, filing it may be nice but must not be mandatory.
Achieve agrees: its project picker offers `<No Project>`, and its outline shows tasks
sitting directly under a result area.

So the hierarchy rule becomes the rule it should always have been: **a child may be the
same rank or deeper than its parent, and the top level accepts anything.** The only
restriction is that you cannot go backwards.

**Scope split:** this spec is the **in-app** inbox. External intake (Apple Reminders via a
Shortcut, Alfred) is follow-up work — it needs a provenance/dedupe column that exists
nowhere in the schema today, and the agent API's `create_node` can already reach the inbox
once root-level tasks are legal.

## Decisions

| Topic                               | Decision                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hierarchy rule                      | Rank comparison replacing the `LEGAL_PARENTS` table: `parent === null \|\| RANK[child] >= RANK[parent]`, with `result_area 0 < goal 1 < project 2 < task 3`. Anything may sit at root; equal ranks nest — including result area under result area ("Relationships" containing a specific relationship is legitimate, if rarely advisable) |
| Inbox representation                | A **normal project** carrying an `is_inbox` flag. Not a new node type, not a flag on tasks                                                                                                                                                                                                                                                |
| Rejected: "unparented task = inbox" | A top-level task is a legitimate resting state — "I know what this is, it just needs no home." Overloading it with "unprocessed idea" would take that away and smuggle the filing work back in. There is no reason a task can't have no parent, therefore that cannot be what marks it unprocessed                                        |
| Rejected: separate inbox item type  | Processing an item should be nothing more than moving it. A distinct type would make processing a conversion, and would break on captured items that already carry a date or a priority                                                                                                                                                   |
| Inbox identity                      | `nodes.is_inbox boolean` + partial unique index per user. Identity is the flag, not the name — renaming it keeps it working, as in Achieve                                                                                                                                                                                                |
| Inbox lifecycle                     | **Exactly as Achieve does it.** Renameable, editable, completable, and **deletable**; the next capture recreates it. Deleting it is the natural "reset every field back to default" gesture, and the cascade takes unprocessed children with it, which is what a reset means                                                              |
| Auto-reopen                         | Capturing into a `completed` / `cancelled` inbox sets it back to `in_progress`. New unprocessed items mean the "decide about these" project is live again                                                                                                                                                                                 |
| `<New Tasks>` sub-project           | **Dropped.** No discernible purpose. It likely existed to scope Achieve's "open information form after adding", which we are also cutting                                                                                                                                                                                                 |
| Inbox meaning                       | The container is honest rather than a hack: its job is "decide what these are and what to do about them." Priority D and state IP mean something on it, so its project fields are not dead weight                                                                                                                                         |
| Tab visibility                      | **No special handling anywhere.** Inbox items are ordinary tasks and appear in every task surface                                                                                                                                                                                                                                         |
| Inbox surface                       | Outline only. No `/inbox` tab, no count badge, no "Move to…" picker — processing is dragging in the outline, and it is already part of the weekly planning flow                                                                                                                                                                           |
| Creation                            | Lazy, on first capture. No seed change — one code path                                                                                                                                                                                                                                                                                    |
| Position / defaults                 | First root child (`position: { at: "first" }`), priority D, state `in_progress`, name `Inbox` (plain — this app has no angle-bracket convention)                                                                                                                                                                                          |
| Entry shortcut                      | Bare `c`, plus a visible button in the tab strip. Every existing shortcut is Insert / arrows / Tab / Enter / F2 / Delete, so no bare letter conflicts, and it matches the Gmail/GitHub convention                                                                                                                                         |
| Submit                              | Enter adds, Shift+Enter newlines — the chat/comment convention. No "enter multiple tasks" toggle; multi-line is always on, which is what made the toggle pointless                                                                                                                                                                        |
| Dialog lifetime                     | Stays open after Add, textarea clears, reports "3 items captured" — Achieve's separate Add / Close buttons, which is what rapid capture wants                                                                                                                                                                                             |
| Carried over from Achieve           | `##` separates name from note; optional Priority / Effort / Deadline / Contexts / Project fields, used only if wanted                                                                                                                                                                                                                     |
| Cut from Achieve                    | "Open information form after adding tasks" (we use drawers, and it fights multi-item entry), "Activate Achieve Planner when tasks added" (web app)                                                                                                                                                                                        |
| Paste tolerance                     | Strip `-` / `*` / `+`, `1.` / `1)`, `[ ]` / `[x]`, `>` and `#` markers; respect indentation (tabs or spaces) as subtask depth. Pasting a rich-text bullet list, a markdown list, or a YAML list should all work                                                                                                                           |
| Modal, against the standard         | `ux-principles.md` says never use a modal for a create flow. Documented departure — see `standards.md`                                                                                                                                                                                                                                    |
| Agent API                           | Relax `createNodeTool`'s "parentId required unless result_area" guard so the HTTP API cannot contradict `canNest`. A dedicated `capture` tool is follow-up work                                                                                                                                                                           |

## Acceptance criteria

- [x] A task can be created at the top level, and directly under a result area or a goal
- [x] Result areas nest under result areas; no type can nest under a deeper rank
- [x] `c` opens the capture box from any tab; it does not while typing in a field or with a dialog open
- [x] Pasting an indented markdown/bulleted list creates a matching task subtree with markers stripped
- [x] `Buy milk ## whole, not 2%` sets name and note; a line that merely _starts_ with `##` does not
- [x] Captured items land in the Inbox project, created on first use and reused thereafter
- [x] Renaming the Inbox keeps it the inbox; deleting it is allowed and the next capture makes a new one
- [x] Capturing into a completed Inbox reopens it
- [x] Choosing a Project in the dialog bypasses the Inbox entirely
- [x] Inbox items appear in the Tasks tab like any other task — no exceptions in any grid
- [x] A second user cannot capture into, read, or delete the first user's Inbox
- [x] Outline drag still refuses backwards drops — a result area dragged over a deep task
      snaps out to the nearest level that can host it, which is now the _enclosing result
      area_ (as a sub-area), not necessarily the root

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                     | Why                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Drag snap-out lands on the nearest **enclosing result area**, not the root, when a result area is dragged over a deep task | Follows from allowing result areas to nest. The plan asserted it would still snap to the top level, which was only true under the old rule. `dnd.test.ts` now pins the new behavior                                                                                                                                                    |
| 2   | `resolveDrop` can no longer return `null` for "nowhere legal to land"                                                      | The top level hosts every type, so the ancestor walk always terminates. The test for that case was replaced with one asserting the opposite invariant, since dead drop zones during a drag would now be a bug                                                                                                                          |
| 3   | **Outdent can no longer produce an illegal nesting at all** — its guard is unreachable                                     | A node's rank is always ≥ its parent's, and its parent's ≥ the grandparent's, so moving up a level is never backwards. `moveNode` keeps the check as a backstop; the integration test now pins that the move _succeeds_                                                                                                                |
| 4   | Only `stripLeadingMarkers` was lifted to `src/lib/text/markers.ts`, not `parseListMarker`                                  | The plan said "all three import it". In fact `parseListMarker` (notes/editing) _rebuilds_ markers for list continuation while the other two _strip_ them — merging would have been abstraction for its own sake. `splitIndent` / `indentColumns` were added instead, since capture needs the indent measured before markers are peeled |
| 5   | `stripLeadingMarkers` now treats a marker at end-of-line as a marker (`\s+` → `\s+\|$`)                                    | Found by a test: a trailing empty bullet from a copied list became a task literally named `-`. Also improves the Notes snippet column, whose 16 existing tests verified the change was safe                                                                                                                                            |
| 6   | Added `NodeDetailPatch` rather than passing full `CoreValues`                                                              | `saveNodeDetail` already wrote only the keys it was given (`pick` is `key in source`-guarded); the type just overstated the requirement. The drawer keeps the strict `NodeDetailValues`, where a missing field really is a bug                                                                                                         |
| 7   | `createNode` gained `isInbox` as well as `notes`                                                                           | `ensureInbox` needs to set the flag at insert time; a follow-up update would leave a window where two concurrent captures could each create an inbox and one would then violate the unique index                                                                                                                                       |
| 8   | Extracted `ModalShell` and retrofitted all three existing dialogs, plus `isTypingTarget` across four keyboard handlers     | Planned as optional; done because the fourth copy was the point at which the duplication became the bug risk. Both are pure refactors covered by existing tests                                                                                                                                                                        |
| 9   | `driver.mjs` gained single-character key support                                                                           | The run-planner driver could only press named keys, and `type` uses `Input.insertText`, which fires no `keydown`. Nothing could have tested a bare-letter shortcut                                                                                                                                                                     |

---

## Task 1: Save spec documentation

This folder: `plan.md` (**Status: active**), `shape.md`, `standards.md`, `references.md`.
Screenshots are referenced in place from `screenshots/` rather than copied into `visuals/`,
following the notes spec — both paths are gitignored, so copying only duplicates local
files.

`references.md` records that this spec **changes behavior decided in two frozen specs** —
`2026-07-27-1100-scaffold-and-outline-tab` (hierarchy rules, drag snap-out) and
`2026-07-28-1121-main-grid-tabs` (grid keep-filters) — without editing them, per the
lifecycle rule in `AGENTS.md`.

## Task 2: Replace the hierarchy rule

`src/lib/tree/hierarchy.ts` — replace `LEGAL_PARENTS` with `RANK` plus a one-line
`canNest`. Keep `assertCanNest` and its message; keep `defaultChildType(null) ===
"result_area"` so Insert at the outline root still makes a result area.

Grep for `LEGAL_PARENTS` before deleting it — `src/lib/tree/dnd.ts` names it in a doc
comment.

`hierarchy.test.ts`: task under result area and under goal now legal, result area under
result area legal, every type legal at root, backwards cases (goal under project, result
area under task) still illegal.

`dnd.test.ts`: `resolveDrop`'s ancestor walk is unchanged in shape; what changes is that
its loop can now terminate at `parentId: null` for goals, projects and tasks, so drops that
previously returned `null` resolve to root. The snap-out path stays live for genuinely
backwards drops — `canNest("result_area", "task")` is still false — so the doc comment at
`dnd.ts:92-95` remains accurate.

## Task 3: `is_inbox` column and migration

`src/db/schema.ts` — add to `nodes`:

```ts
isInbox: boolean("is_inbox").notNull().default(false),
```

plus a partial unique index so a user cannot end up with two:

```sql
create unique index nodes_one_inbox_per_user on nodes (user_id) where is_inbox;
```

Hand-write `drizzle/0008_inbox.sql` and add its `_journal.json` entry. **Do not run
`db:generate`** — `drizzle/meta/` is drifted, so generation prompts to re-apply 0004–0007.
Two prior specs hit this and both hand-wrote; snapshot repair remains a separate follow-up.

**Superseded 2026-07-30:** the drift was repaired the same day (see
`agent-os/standards/database/migrations.md`). `db:generate` works again and is now the
required path; this task's hand-written `0008_inbox.sql` is the last of its kind.

Add `is_inbox` to the select list in `loadOutline`'s recursive CTE
(`src/lib/tree/queries.ts`) and to `OutlineNode` in `src/lib/tree/types.ts`, so any surface
can tell it is the inbox without a second query.

## Task 4: The capture parser (pure logic)

New `src/lib/capture/parse.ts`:

```ts
export type CapturedItem = { depth: number; name: string; note: string };
export function parseCapture(text: string): CapturedItem[];
```

- Drop blank lines; handle CRLF.
- Measure leading whitespace in columns (tab = 4), then map columns → depth with a stack,
  so 2-space, 4-space and tab indentation all work and mixed input does not explode. An
  indented _first_ line normalizes to depth 0. A jump of more than one level clamps to
  parent + 1.
- Strip list / quote / heading markers. **Reuse, do not rewrite:**
  `src/lib/notes/editing.ts` has a private `parseListMarker()` handling indent + `-*+` +
  `1.` / `1)` + `[ ]` / `[x]`, and `src/lib/notes/snippet.ts` has `stripLeadingMarkers()`.
  Lift the shared regex into `src/lib/text/listMarker.ts` and have all three import it —
  `editing.test.ts` and `snippet.test.ts` already cover the existing behavior, so the move
  is verifiable.
- `##` splits name from note only when text precedes it, so a stripped heading line
  (`## Groceries`) becomes a name rather than an empty-named note.

`src/lib/capture/parse.test.ts` is the load-bearing test file: tab vs 2-space vs 4-space vs
mixed indent, each marker form, checkbox forms, blockquote, heading, `##` both ways, blank
lines, indented first line, depth jumps, CRLF, empty input.

## Task 5: Inbox resolution and the capture mutation

New `src/lib/capture/mutations.ts`:

```ts
export async function ensureInbox(userId: string): Promise<string>;
export async function captureItems(params: {
  userId: string;
  items: CapturedItem[];
  parentId?: string | null; // omitted → the Inbox
  defaults?: CaptureDefaults; // priority, deadline, effortMinutes, contexts
}): Promise<{ createdIds: string[]; parentId: string }>;
```

- `ensureInbox` — find the `is_inbox` node for this user; reopen it when
  `completed` / `cancelled`; otherwise create a root project named `Inbox`, priority D,
  state `in_progress`, `position: { at: "first" }`.
- `captureItems` — resolve the target, then create one node per item with the existing
  `createNode` from `src/lib/tree/mutations.ts`, tracking the last created id per depth so
  an indented line parents to the line above it. `createNode` already validates nesting,
  computes the fractional `sortKey`, and inserts the `task_details` row, so none of that is
  reimplemented. One transaction per item is fine at capture scale.
- Extend `createNode` with an optional `notes?: string` rather than issuing a second write
  for the `##` note.
- Apply defaults with the existing `saveNodeDetail(userId, nodeId, values)`
  (`src/lib/detail/mutations.ts`) — it already handles core fields (priority, deadline) and
  `task.effortMinutes` / `task.contexts` in one call, so no new setters.

`src/lib/capture/mutations.integration.test.ts` — inbox created once then reused; reopened
when completed; recreated after deletion; indentation produces the right subtree; explicit
`parentId` bypasses the inbox; defaults land on every created node. **Cross-user block:**
user B capturing into user A's project rejects with "Node not found"; B's `ensureInbox`
never returns A's inbox; A's inbox is invisible in B's `loadOutline`.

## Task 6: Quick capture UI

Mount the feature in **`src/components/shell/TabStrip.tsx`**, not `app/layout.tsx` — every
authed page renders `TabStrip` (including `/schedule/plan`) and `/login` does not, so that
placement gives exactly the right scope with no pathname guard, and puts the trigger button
where it belongs.

New `src/components/capture/`:

- `QuickCapture.tsx` (client) — the `c` listener plus the dialog. Reuse the established
  guard idiom (bail on INPUT / SELECT / TEXTAREA / `isContentEditable`) and additionally
  bail when `document.querySelector('[role="dialog"], [role="alertdialog"]')` is present,
  since the per-tab handlers own drawer state this component cannot see. Extract that guard
  into `src/lib/keyboard.ts` (`isTypingTarget`) and adopt it in the four existing copies —
  `useOutlineKeyboard`, `useGridTab`, `NotesGrid`, `WishesGrid`.
- `QuickCaptureDialog.tsx` — textarea (autofocus), the `##` hint line, Priority / Effort /
  Deadline / Contexts / Project fields, Add + Close. Enter submits, Shift+Enter newlines.
  Reuse field components from `src/components/detail/fields.tsx` and `parseEffort` /
  `parsePriority` from `src/lib/tree/format.ts`.
- `CaptureButton.tsx` — the tab-strip trigger. It dispatches a `planner:quick-capture`
  custom event that `QuickCapture` also listens for, so a server component can host the
  button without a context provider spanning it.

New `src/app/capture/actions.ts` — `"use server"`, following the exact `run()` /
`ActionResult` shape of `src/app/outline/actions.ts`. Two actions: `captureAction` and
`listCaptureTargetsAction` (flat id/name/type list for the Project picker, fetched on first
open so no page pays for it). Use a plain `ToolbarSelect`-style select for the picker —
Achieve's filtered tree popover is the already-known-open polish item from the frozen
main-grid-tabs spec, not new debt from here.

The dialog is the app's **fourth** copy of the same centered-modal shell (`ConfirmDialog`,
`ShowFieldsDialog`, `NoteFilterDialog` are the others: identical backdrop, `useModalFocus`,
capture-phase Escape). Extract `src/components/detail/ModalShell.tsx` and build on it;
retrofit the existing three last, in one commit, so a regression is easy to isolate.

## Task 7: Agent API consistency

`src/lib/agent/tools.ts` — `createNodeTool` requires `parentId` unless `type ===
"result_area"`. Relax it so the HTTP API cannot contradict `canNest`. Update
`docs/agent-api.md` (the live doc). Add a case to
`src/lib/agent/tools.integration.test.ts` creating a root-level task.

## Task 8: Verify, freeze, update roadmap

- Run the verification in `shape.md`.
- Fill in **Changes from original plan**; mark `plan.md` / `shape.md` **Status: frozen /
  complete** with the date.
- `agent-os/product/roadmap.md`: rewrite the Phase 2 "Quick capture to inbox" bullet — the
  in-app inbox and quick entry are delivered — and add the staged external intake as _new_
  work: (1) Apple Reminders drain via a Shortcut POSTing to `/api/agent/*`, needing a
  provenance/dedupe column; (2) Alfred for one-at-a-time typing on the Mac.
- Record as follow-ups (not edits to this spec): an `/inbox` processing tab; grouping the
  **Tasks tab by project**, which Achieve always does (`screenshots/task_tab/` shows
  `Project : <Inbox>\<New Tasks> (5 items)`, and a Goal hosting direct tasks labeled
  "Project" too) whereas `TasksGrid` only offers `groupBy: ["resultArea"]`; the filtered
  tree project picker; amending `ux-principles.md` for the third modal case; and
  `drizzle/meta` snapshot repair.

## Change: capture closes on Add (2026-07-30, post-freeze)

Two decisions above are superseded. Recorded here as a dated change rather than edited in
place, per `agent-os/specs/README.md`.

| Was                                                                                  | Now                                                                | Why                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Dialog lifetime: stays open after Add, textarea clears, reports _3 items captured_" | **Enter captures and closes.** The dialog is unmounted, not hidden | The stay-open design existed to support a burst of separate captures. That need does not survive scrutiny: multi-line already covers bulk in one submit, and per-item detail belongs in the normal interface rather than in a box you keep reopening |
| Escape left the typed draft in place (an accident of mounting, not a decision)       | **Escape discards.** The parent unmounts the dialog                | Explicit and consistent with `NoteFilterDialog`; a stale draft reappearing days later is worse than retyping a few words                                                                                                                             |

A toast was built for the close case and then removed: it would have been the only one in
the app, and closing already _is_ the success signal — a failed capture keeps the box open
with the error. Written up in `agent-os/standards/components/modal-pattern.md`.

## Follow-ups (new work — not amendments to this frozen spec)

| Follow-up                                  | Note                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **External intake: Apple Reminders**       | A Shortcut reading a dedicated list and POSTing to `/api/agent/create_node`, then completing the reminder. Apple has no server-side API for Reminders (EventKit is on-device only, and iOS 13 broke the iCloud CalDAV route), so the drain must run on a device. Needs a provenance/dedupe column — there is no `external_id` anywhere in the schema today                  |
| **External intake: Alfred**                | One task at a time from the Mac, same endpoint. Smaller than the Reminders work and unblocked now                                                                                                                                                                                                                                                                           |
| **Group the Tasks tab by project**         | Achieve always does this — `screenshots/task_tab/` shows `Project : <Inbox>\<New Tasks> (5 items)`, with a Goal that hosts direct tasks labelled "Project" too. `TasksGrid` only offers `groupBy: ["resultArea"]`. Needs a `"project"` case in `GroupBy`/`RowContext` (nearest ancestor that is not a task) and a path-style label for nested containers                    |
| **An `/inbox` processing tab**             | Only if the Outline turns out to be the wrong place to sit and process a backlog. Would want a count badge, which means giving `TabStrip` a query                                                                                                                                                                                                                           |
| **Achieve's filtered tree project picker** | Already open on the frozen main-grid-tabs spec; would serve both the capture box's "Add to" and the Tasks tab's scope picker                                                                                                                                                                                                                                                |
| **Amend `ux-principles.md`**               | Add a third permitted modal case: a transient, keyboard-invoked command surface that owns no record. See this spec's `standards.md`. Route through `/discover-standards`                                                                                                                                                                                                    |
| ~~**Repair `drizzle/meta` snapshots**~~    | **Done 2026-07-30.** A correct `0008_snapshot.json` was generated from `schema.ts`, so `db:generate` works again. Root cause was `0004` (commit `566a565`) shipping SQL and a journal entry with no snapshot; `0007`'s snapshot was the `0003` schema re-stamped with new ids, not a byte copy as first recorded. Written up in `agent-os/standards/database/migrations.md` |
